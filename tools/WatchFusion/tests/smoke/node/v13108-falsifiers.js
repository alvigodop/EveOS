// v13.10.8 falsifiers for Drift's host-handoff and TV post-resume traces, run through the real modules with a
// virtual clock. Red on v13.10.7: linked-mirror-guard.js does not exist, the TV dwell restarts on every playout
// segment, and room audio is tried once per video instead of once per player instance.
// Evidence type: Node VM only. This is not Playwright, not Windows, and not audible playback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.WF_FALSIFIER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function world() {
  let now = 0, seq = 0; const timers = new Map(), notes = [];
  const ctx = {Math, JSON, Number, String, Array, Object, Error, console, Promise, Set, Map, notes};
  ctx.performance = {now: () => now};
  ctx.setInterval = (fn, ms) => { const id = ++seq; timers.set(id, {fn, at: now + ms, every: ms}); return id; };
  ctx.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, {fn, at: now + ms}); return id; };
  ctx.clearTimeout = ctx.clearInterval = id => timers.delete(id);
  const nodes = new Map();
  ctx.document = {hidden: false, addEventListener() {},
    getElementById: id => nodes.get(id) || (id === 'syncStatus' ? {parentNode: {insertBefore: n => nodes.set(n.id, n)}} : null),
    createElement: () => ({style: {}, setAttribute() {}, addEventListener(type, fn) { this.click = fn; }})};
  ctx.watchFusionRoomSyncLog = {note: (kind, detail) => notes.push([kind, detail])};
  // Keep browser event registration observable in this VM fixture.
  const windowListeners = new Map();
  ctx.addEventListener = (type, fn) => {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(fn);
  };
  ctx.removeEventListener = (type, fn) => {
    windowListeners.set(type, (windowListeners.get(type) || []).filter(item => item !== fn));
  };
  ctx.windowListeners = windowListeners;
  ctx.window = ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.nodes = nodes;
  ctx.advance = ms => { const end = now + ms;
    for (;;) { let next = null; for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break; const [id, t] = next; now = t.at; if (t.every) t.at += t.every; else timers.delete(id); t.fn(); }
    now = end; };
  ctx.setNow = v => { now = v; };
  return ctx;
}
const guardCtx = () => { const ctx = world(); vm.runInContext(read('public/client/linked-mirror-guard.js'), ctx); return ctx; };
const authority = (over = {}) => ({roomId: 'ROOM', linkId: 'L1', hostId: 'A', host: true, linkedActive: true, proof: true,
  sourceKey: 'AAAAAAAAAAA', sourceMatches: true, say: () => {}, ...over});

// Drift's TV post-resume Trace v3: linked-source status per snapshot (L live, F frozen, S stale), 79 snapshots
// about 2.95 s apart; the TV reported BUFFERING in the first 77 at -537 s growing to -760 s. Segment stayed 72.
const TRACE_SOURCE = 'LLLLFLLLLFLLLLLLLLLLLLLLLLFLLLLLLLLLLFLLLLLLLLLLLLLLLLLLLLLLFLLLLLFLLLLLSLLLLFL';

export async function runV13108Checks(check) {
  await check('V13108-01:a-403-after-host-handoff-is-one-request-and-one-denial-not-a-storm', () => {
    const ctx = guardCtx(); const G = ctx.WatchFusionLinkedMirrorGuard; let requests = 0;
    for (let i = 0; i < 240; i++) { // Drift's trace: 240 metadata ticks at the same paused position
      ctx.setNow(i * 1000);
      if (G.gate(authority()).allow) { requests++; G.result(false, 403); }
    }
    assert.equal(requests, 1, 'one denied mirror per room authority, got ' + requests);
    assert.equal(ctx.notes.filter(([k]) => k === 'host-link-denied').length, 1, 'the denial is reported once');
    ctx.setNow(241000);
    assert.equal(G.gate(authority({hostId: 'B', host: true})).allow, true, 'a real authority change earns exactly one new try');
    G.result(false, 403);
    assert.equal(G.gate(authority({hostId: 'B', host: true})).allow, false);
    G.reset();
    assert.equal(G.gate(authority({hostId: 'B', host: true})).allow, true, 'Reconnect clears the hold');
  });
  await check('V13108-02:non-host-or-detached-link-sends-nothing-and-a-returning-host-rebinds-once', () => {
    const ctx = guardCtx(); const G = ctx.WatchFusionLinkedMirrorGuard; let sent = 0, rebinds = 0;
    const step = (over, t) => { ctx.setNow(t); const g = G.gate(authority(over)); if (g.allow) sent++; if (g.rebind) rebinds++; };
    step({}, 0); // host A publishing
    for (let t = 1000; t < 60000; t += 1000) step({hostId: 'B', host: false}, t); // handed off to B
    assert.equal(sent, 1, 'a member that is no longer host publishes nothing');
    for (let t = 60000; t < 120000; t += 1000) step({hostId: 'A', host: true, linkedActive: false}, t); // A is host again, room dropped the link
    assert.equal(rebinds, 1, 'exactly one protected rebind for the same source');
    assert.equal(sent, 1, 'no mirror while the room link is detached');
    const fresh = guardCtx().WatchFusionLinkedMirrorGuard;
    assert.equal(fresh.gate(authority({linkedActive: false})).rebind, undefined, 'no rebind without a handoff seen in this room');
  });
  await check('V13108-03:transport-failures-back-off-to-30s-and-recover', () => {
    const ctx = guardCtx(); const G = ctx.WatchFusionLinkedMirrorGuard; let requests = 0;
    for (let t = 0; t < 120000; t += 250) { ctx.setNow(t); if (G.gate(authority()).allow) { requests++; G.result(false, 0); } }
    assert.ok(requests <= 8, 'connection failures must back off, got ' + requests + ' requests in 120 s');
    ctx.setNow(200000); assert.equal(G.gate(authority()).allow, true, 'a transport failure never blocks for good');
    G.result(true); ctx.setNow(200250); assert.equal(G.gate(authority()).allow, true, 'success clears the backoff');
  });
  await check('V13108-04:a-frozen-playing-source-is-mirrored-once-and-pause-or-seek-still-pass', () => {
    const ctx = guardCtx(); const G = ctx.WatchFusionLinkedMirrorGuard; const page = 'https://www.youtube.com/watch?v=AAAAAAAAAAA';
    let published = 0;
    for (let i = 0; i < 12; i++) { // trace: 609.747 s re-mirrored as drift about once a second while "playing"
      if (!G.stalledRepeat({publish: true, reason: 'drift'}, {paused: false, currentTime: 609.747 + i * .01}, page)) published++;
    }
    assert.equal(published, 1, 'a stalled source moves the room once, got ' + published);
    assert.equal(ctx.notes.filter(([k]) => k === 'source-stall-held').length, 1);
    assert.equal(G.stalledRepeat({publish: true, reason: 'drift'}, {paused: false, currentTime: 611.2}, page), false, 'fresh advancing evidence publishes');
    assert.equal(G.stalledRepeat({publish: true, reason: 'pause'}, {paused: true, currentTime: 611.2}, page), false, 'a pause is never held');
    assert.equal(G.stalledRepeat({publish: true, reason: 'seek'}, {paused: false, currentTime: 611.2}, page), false, 'a seek is never held');
  });
  await check('V13108-05:tv-buffering-dwell-survives-playout-segment-churn', () => {
    const ctx = world(); vm.runInContext(read('public/client/tv-decoder-rescue.js'), ctx);
    const R = ctx.WatchFusionDecoderRescue; let reloads = 0, rebuilds = 0;
    for (let t = 0; t <= 60000; t += 250) { // segment bumps every second, as in the 3:22-3:24 PM churn
      R.consider({scope: 'ROOM:AAAAAAAAAAA:4:' + Math.floor(t / 1000), nowMs: t, buffering: true, playing: false, trusted: true,
        sourceBuffering: false, drift: -(20 + t / 1000), reload: () => reloads++, rebuild: () => rebuilds++});
    }
    assert.equal(reloads, 1, 'segment churn must not restart the 9 s wedge dwell');
    assert.equal(rebuilds, 1, 'and must not refill the budget into a reload loop');
  });
  await check('V13108-06:drift-tv-post-resume-trace-gets-recovery-and-a-healed-player-earns-a-new-budget', () => {
    const run = src => { const ctx = world(); vm.runInContext(src, ctx); const R = ctx.WatchFusionDecoderRescue; const acts = [];
      for (let t = 0; t < 77 * 2950; t += 500) { const s = TRACE_SOURCE[Math.floor(t / 2950)];
        R.consider({scope: 'ROOM:AAAAAAAAAAA:4:72', nowMs: t, buffering: true, exhausted: false, playing: false, trusted: s === 'L',
          sourceBuffering: false, drift: -(537 + t / 1000), reload: () => acts.push('reload'), rebuild: () => acts.push('rebuild')}); }
      return {R, acts}; };
    const legacy = read('public/client/linked-playback-sync.js').match(/\/\* v13\.10: one last decoder reload[\s\S]*?\}\)\(\);/)?.[0];
    assert.ok(legacy, 'legacy v13.10 rescue present for the baseline replay');
    assert.deepEqual(run(legacy).acts, [], 'baseline: the installed rescue never acts while the TV buffers (the observed freeze)');
    const {R, acts} = run(read('public/client/tv-decoder-rescue.js'));
    assert.deepEqual(acts, ['reload', 'rebuild'], 'candidate: one reload, then one rebuild, on the real trace');
    // PLAYING alone is not proof of a healthy decoder. Held frames must
    // never replenish the terminal retry budget (8p's safety contract).
    for (let t = 245000; t <= 280000; t += 500) R.consider({scope: 'ROOM:AAAAAAAAAAA:4:73', nowMs: t,
      playing: true, buffering: false, trusted: true, sourceBuffering: false, drift: 0, position: 40});
    assert.equal(R.diagnostics().steps, 2, 'frozen PLAYING cannot refill decoder budget');
    // R14v: healthy playback must persist for a full 60 seconds before a
    // spent decoder-recovery budget can be replenished. A merely advancing
    // 35-second interval must NOT recreate the old reload/rebuild loop.
    for (let t = 300000; t <= 335000; t += 500) R.consider({scope: 'ROOM:AAAAAAAAAAA:4:73', nowMs: t,
      playing: true, buffering: false, trusted: true, sourceBuffering: false, drift: 0,
      position: 50 + (t - 300000) / 1000});
    assert.equal(R.diagnostics().steps, 2, '35 seconds must not refill the R14v 60-second recovery budget');
    // Continue the SAME uninterrupted, advancing playback to 65 seconds.
    for (let t = 335500; t <= 365000; t += 500) R.consider({scope: 'ROOM:AAAAAAAAAAA:4:73', nowMs: t,
      playing: true, buffering: false, trusted: true, sourceBuffering: false, drift: 0,
      position: 50 + (t - 300000) / 1000});
    assert.equal(R.diagnostics().steps, 0, '65 seconds of verified healthy progress earns one rearm');
    assert.equal(R.diagnostics().healCount, 1, 'exactly one qualified healthy-progress rearm');
    let again = 0;
    for (let t = 370000; t <= 390000; t += 500) R.consider({scope: 'ROOM:AAAAAAAAAAA:4:74', nowMs: t, buffering: true, playing: false, trusted: true,
      drift: -30, reload: () => again++, rebuild: () => again++});
    assert.equal(again, 1, 'one fresh reload only after sustained healthy playback, never a reload loop');
  });
  await check('V13108-07:a-rebuilt-tv-player-gets-the-room-volume-again', () => {
    const ctx = world(); const unmutes = [];
    const player = id => ({id, muted: true, volume: 100, state: 1, getPlayerState() { return this.state; }, isMuted() { return this.muted; },
      mute() { this.muted = true; }, unMute() { unmutes.push(id); this.muted = false; }, setVolume(v) { this.volume = v; }, playVideo() {}});
    Object.assign(ctx, {roomId: 'ROOM', ytPlayer: player(1), ytPlayerReady: true, playerInitializing: false, primingPlayer: false,
      autoplayWasBlocked: true, userGesturePrimeUsed: false, isHost: () => false,
      state: {source: {videoId: 'AAAAAAAAAAA'}, presentationEpoch: 4, playback: {paused: false}},
      authoritativeRoomAudio: () => ({volume: 37, muted: false}), applyRoomAudioState() {}});
    vm.runInContext('var autoplayWasBlocked = true, userGesturePrimeUsed = false;', ctx);
    vm.runInContext(read('public/client/room-audio-unlock.js'), ctx);
    assert.ok(ctx.windowListeners.get('pointerdown')?.length && ctx.windowListeners.get('keydown')?.length,
      'audio recovery must retain real gesture listeners after a player rebuild');
    ctx.advance(4000);
    assert.deepEqual(unmutes, [1], 'the first player gets one room-audio attempt');
    assert.equal(ctx.ytPlayer.volume, 37);
    vm.runInContext('autoplayWasBlocked = true; ytPlayer = globalThis.nextPlayer;', Object.assign(ctx, {nextPlayer: player(2)}));
    ctx.advance(4000);
    assert.deepEqual(unmutes, [1, 2], 'a decoder rebuild is a new player and gets its own attempt');
    assert.equal(ctx.ytPlayer.volume, 37, 'at the host room volume');
  });
  await check('V13108-08:mirror-wiring-gates-before-the-request-and-reads-a-fresh-status', () => {
    const tab = read('public/client/linked-tab.js'), boot = read('public/client/bootstrap.js'), files = read('src/server/static-files.js');
    const body = tab.slice(tab.indexOf('async function mirrorNow'));
    assert.ok(body.indexOf('mirrorGuard()?.gate?.(') < body.indexOf("command('mirror'"), 'gate before the request');
    assert.ok(body.indexOf('stalledRepeat') < body.indexOf("command('mirror'"), 'stall hold before the request');
    assert.match(body, /mirrorGuard\(\)\?\.result\?\.\(ok,receipt\.status/);
    assert.match(tab, /function reconnect\(\)\{if\(!link\)return start\(\);mirrorGuard\(\)\?\.reset\?\.\(\)/);
    assert.match(boot, /if \(receipt\) Object\.assign\(receipt, \{status:res\.status/, 'the mirror uses its own response even when commands overlap');
    assert.ok(files.indexOf("'client/linked-mirror-guard.js'") > 0 && files.indexOf("'client/linked-mirror-guard.js'") < files.indexOf("'client/linked-tab.js'"));
  });
  await check('V13108-09:expired forced mirrors retry from current metadata after backoff', async () => {
    const ctx = guardCtx(), positions = [];
    Object.assign(ctx, {active:()=>true, roomId:'ROOM', link:{id:'L1'}, loadedPageUrl:'fixture',
      state:{source:{videoId:'AAAAAAAAAAA'}}, pendingControls:new Map(), mirrorInFlight:false, queuedMirror:null,
      lastMirrorAnchor:{position:5,sampledAt:Date.now(),rate:1}, roomProof:()=>({id:'L1'}),
      mirrorAuthority:authority, mirrorGuard:()=>ctx.WatchFusionLinkedMirrorGuard,
      command:async (_type, body, receipt) => {
        positions.push(body.position);
        Object.assign(receipt,{status:positions.length===1?408:200,sampleAgeMs:positions.length===1?1557:7});
        return receipt.status===200;
      }});
    const code = read('public/client/linked-tab.js');
    vm.runInContext(read('public/client/linked-playback-sync.js'),ctx);
    vm.runInContext(code.slice(code.indexOf('async function mirrorNow'),code.indexOf('function scheduleMirror')),ctx);
    const emit = (position,force) => ctx.mirrorNow({currentTime:position,sampledAt:Date.now(),pageUrl:'fixture'},force);
    assert.equal(await emit(422,true),false);
    assert.equal(ctx.lastMirrorAnchor,null);
    assert.equal(await emit(423,false),false);
    assert.equal(positions.length,1);
    ctx.advance(3100);
    assert.equal(await emit(425,false),true);
    assert.ok(Math.abs(positions[1]-425)<.1,'next metadata supplies the new position');
    assert.deepEqual(ctx.notes.filter(([kind])=>['mirror-expired','mirror-applied'].includes(kind))
      .map(([kind,detail])=>[kind,detail.sampleAgeMs]),[['mirror-expired',1557],['mirror-applied',7]]);
  });
}
