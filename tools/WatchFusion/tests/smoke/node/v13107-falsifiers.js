// v13.10.7 falsifiers, driven through the real modules with a virtual clock and a fake YouTube player:
// zero convergence inside Locked, solo linked-tab sync, embedded solo controls, TV terminal recovery,
// room audio on join, and verified source-tab mute. Red on v13.10.5 (the modules or routes do not exist).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function world(extra = {}) {
  let now = 0, seq = 0; const timers = new Map();
  const ctx = {Math, JSON, Number, String, Array, Object, Error, console, Promise, Set, Map, ...extra};
  ctx.Date = class extends Date { static now() { return 1.7e12 + now; } };
  ctx.performance = {now: () => now};
  ctx.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, {fn, at: now + ms}); return id; };
  ctx.setInterval = (fn, ms) => { const id = ++seq; timers.set(id, {fn, at: now + ms, every: ms}); return id; };
  ctx.clearTimeout = ctx.clearInterval = id => timers.delete(id);
  const nodes = new Map();
  ctx.document = {hidden: false, addEventListener() {},
    getElementById: id => nodes.get(id) || (id === 'syncStatus' ? {parentNode: {insertBefore: n => nodes.set(n.id, n)}} : null),
    createElement: () => ({style: {}, setAttribute() {}, addEventListener(type, fn) { this.click = fn; }})};
  ctx.window = ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.nodes = nodes;
  ctx.advance = ms => { const end = now + ms;
    for (;;) { let next = null; for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break; const [id, t] = next; now = t.at; ctx.tick?.(now); if (t.every) t.at += t.every; else timers.delete(id); t.fn(); }
    now = end; ctx.tick?.(now); };
  ctx.clock = () => now;
  return ctx;
}
function fakePlayer(ctx, {rates = [.75, 1, 1.25], position = 30, state = 1, muted = false} = {}) {
  const p = {position, rate: 1, state, muted, volume: 100, calls: [], last: 0, videoId: 'AAAAAAAAAAA', rates};
  ctx.tick = now => { const dt = (now - p.last) / 1000; p.last = now; if (p.state === 1) p.position += dt * p.rate; };
  Object.assign(p, {getCurrentTime: () => p.position, getPlaybackRate: () => p.rate, getAvailablePlaybackRates: () => p.rates,
    setPlaybackRate: r => { p.calls.push(['rate', r]); if (p.rates.includes(r)) p.rate = r; }, getPlayerState: () => p.state,
    getVideoData: () => ({video_id: p.videoId}), getDuration: () => 600, seekTo: v => { p.calls.push(['seek', v]); p.position = v; },
    pauseVideo: () => { p.calls.push(['pause']); p.state = 2; }, playVideo: () => { p.calls.push(['play']); p.state = 1; },
    isMuted: () => p.muted, mute: () => { p.muted = true; }, unMute: () => { p.calls.push(['unmute']); p.muted = false; },
    setVolume: v => { p.volume = v; }, getVolume: () => p.volume});
  return p;
}
function roomGlobals(ctx, player, {targetOffsetSec, uncertaintyMs = 110, host = false, owns = () => false} = {}) {
  Object.assign(ctx, {roomId: 'ROOM', ytPlayer: player, ytPlayerReady: true, playerInitializing: false, primingPlayer: false, applyingRemote: false,
    state: {source: {videoId: 'AAAAAAAAAAA'}, playback: {paused: false, ended: false, rate: 1}, presentationEpoch: 1, playoutSegment: 1, linkedSourceActive: true},
    estimatedServerNow: () => ctx.Date.now(), isHost: () => host,
    watchFusionViewerArbiter: {owns}, watchFusionPlayout: {status: () => ({source: 'live', uncertaintyMs, reference: 'peer-cohort'}), sourceBuffering: () => false},
    watchFusionYouTubeTarget: () => 30 + ctx.clock() / 1000 + targetOffsetSec});
}

export async function runV13107Checks(check) {
  await check('V13107-01:locked-50ms-walks-toward-zero-despite-a-100ms-shared-reference', () => {
    const ctx = world(); const p = fakePlayer(ctx, {position: 30.05}); // 50 ms ahead
    roomGlobals(ctx, p, {targetOffsetSec: 0, uncertaintyMs: 110});
    vm.runInContext(read('public/client/zero-converge.js'), ctx);
    ctx.advance(30000);
    const err = Math.abs((30 + 30 - p.position) * 1000);
    assert.ok(err <= 16, 'Locked edge must walk into the 0..16 ms band, residual ' + err.toFixed(1) + ' ms');
    assert.ok(!p.calls.some(([k]) => k === 'seek' || k === 'pause'), 'zero convergence never seeks or pauses');
    assert.equal(p.rate, 1, 'rate always returns to 1x');
  });
  await check('V13107-02:fixed-rate-tv-and-noisy-measurement-are-left-alone', () => {
    for (const variant of ['fixed', 'noisy']) {
      const ctx = world(); const p = fakePlayer(ctx, {position: 30.04, rates: variant === 'fixed' ? [1] : [.75, 1, 1.25]});
      roomGlobals(ctx, p, {targetOffsetSec: 0});
      if (variant === 'noisy') { let k = 0; ctx.watchFusionYouTubeTarget = () => 30 + ctx.clock() / 1000 + ((k++ % 2) ? .03 : -.03); }
      vm.runInContext(read('public/client/zero-converge.js'), ctx);
      ctx.advance(20000);
      assert.ok(!p.calls.some(([k, r]) => k === 'rate' && r !== 1), variant + ': no actuation');
    }
  });
  await check('V13107-03:zero-convergence-yields-to-the-arbiter', () => {
    const ctx = world(); const p = fakePlayer(ctx, {position: 30.04});
    roomGlobals(ctx, p, {targetOffsetSec: 0, owns: () => true});
    vm.runInContext(read('public/client/zero-converge.js'), ctx);
    ctx.advance(15000);
    assert.equal(p.calls.length, 0, 'never two rate owners at once');
  });
  await check('V13107-04:solo-linked-tab-converges-without-commanding-the-source', () => {
    const ctx = world(); const p = fakePlayer(ctx, {position: 29.7}); // 300 ms behind the linked tab
    const sent = []; let sampledAt = 0;
    ctx.state = {source: {videoId: 'AAAAAAAAAAA'}}; Object.assign(ctx, {roomId: null, ytPlayer: p, ytPlayerReady: true, playerInitializing: false, primingPlayer: false, pendingVideoId: 'AAAAAAAAAAA'});
    ctx.parseYoutubeInput = () => 'AAAAAAAAAAA';
    ctx.WatchFusionLinkedPlaybackSync = {projectedPosition: (m, at) => m.currentTime + (at - m.sampledAt) / 1000};
    ctx.watchFusionLinkedTab = {active: () => true, applying: () => false, pendingControl: () => false, suppressPlaybackEcho() {},
      control: (...a) => sent.push(a), metadata: () => { if (ctx.Date.now() - sampledAt > 250) sampledAt = ctx.Date.now();
        return {pageUrl: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', paused: false, rate: 1, sampledAt, currentTime: 30 + (sampledAt - 1.7e12) / 1000}; }};
    vm.runInContext(read('public/client/solo-link-sync.js'), ctx);
    ctx.advance(30000);
    const err = Math.abs((30 + 30 - p.position) * 1000);
    assert.ok(err <= 20, 'solo preview must settle within 20 ms of the linked tab, got ' + err.toFixed(1));
    assert.equal(sent.length, 0, 'solo corrections never send transport to the source tab');
    assert.ok(!p.calls.some(([k]) => k === 'seek'), '300 ms is corrected by rate, not a seek');
    assert.match(ctx.nodes.get('watchfusionSoloLinkStatus')?.textContent || '', /Locked/);
  });
  await check('V13107-05:solo-embedded-pause-and-seek-reach-the-linked-tab', () => {
    const src = read('public/client/commands.js');
    assert.match(src, /linked\?\.active\?\.\(\) && \(!roomId \|\| isHost\(\)\)/, 'embedded Play/Pause routes to the source with no room');
    assert.match(src, /forwardSeek&&jumped&&\(!roomId\|\|isHost\(\)\)/, 'embedded seek routes to the source with no room');
    assert.match(src, /rateChanged=!window\.watchFusionHostZeroCenter\?\.isApplying\?\.\(\) && !window\.WatchFusionZeroConverge\?\.isApplying\?\.\(\) && !window\.WatchFusionSoloLinkSync/, 'source rate follow never stomps a correction pulse');
  });
  await check('V13107-06:wedged-tv-buffering-gets-one-reload-then-one-rebuild-and-ignores-a-frozen-blink', () => {
    const ctx = world(); const notes = [];
    ctx.watchFusionRoomSyncLog = {note: k => notes.push(k)}; ctx.ensurePlayer = () => notes.push('ensure');
    vm.runInContext(read('public/client/tv-decoder-rescue.js'), ctx);
    const R = ctx.WatchFusionDecoderRescue; let reloads = 0, rebuilds = 0;
    for (let t = 0; t <= 120000; t += 500) {
      const blink = t % 20000 === 10000; // the linked source reads "frozen" for one report every 20 s
      R.consider({scope: 's', nowMs: t, buffering: true, exhausted: false, playing: false, trusted: !blink, sourceBuffering: false,
        drift: -(5 + t / 1000), reload: () => reloads++, rebuild: () => rebuilds++});
    }
    assert.equal(reloads, 1, 'exactly one decoder reload'); assert.equal(rebuilds, 1, 'exactly one player rebuild');
    assert.equal(R.diagnostics().outcome, 'terminal-recovery-spent');
    let frozen = 0; R.consider({scope: 'x', nowMs: 0, buffering: true, trusted: false, drift: -9, reload: () => frozen++});
    for (let t = 0; t <= 60000; t += 500) R.consider({scope: 'x', nowMs: t, buffering: true, trusted: false, drift: -9, reload: () => frozen++});
    assert.equal(frozen, 0, 'never while the room reference itself is not live');
  });
  await check('V13107-07:joining-member-tries-host-room-volume-then-falls-back-to-a-tap-button', () => {
    for (const allowed of [true, false]) {
      const ctx = world(); const p = fakePlayer(ctx, {muted: true});
      if (!allowed) p.unMute = () => { p.muted = false; p.state = 2; }; // browser pauses unmuted media without a gesture
      roomGlobals(ctx, p, {targetOffsetSec: 0});
      Object.assign(ctx, {autoplayWasBlocked: true, userGesturePrimeUsed: false, authoritativeRoomAudio: () => ({volume: 72, muted: false}),
        applyRoomAudioState: () => true});
      vm.runInContext('var autoplayWasBlocked=true,userGesturePrimeUsed=false;', ctx);
      vm.runInContext(read('public/client/room-audio-unlock.js'), ctx);
      ctx.advance(6000);
      if (allowed) { assert.equal(p.muted, false); assert.equal(p.volume, 72); assert.equal(ctx.autoplayWasBlocked, false); }
      else { assert.equal(p.muted, true, 'falls back to muted playback'); assert.equal(p.state, 1, 'keeps playing');
        assert.equal(ctx.nodes.get('watchfusionEnableRoomAudio')?.hidden, false, 'shows Enable room audio'); }
    }
  });
  await check('V13107-08:source-tab-mute-is-verified-and-reasserted', () => {
    const src = read('browser-extension/worker.js');
    assert.ok(!/chrome\.tabs\.update\(tabId,\{muted:true\}\)\.catch\(\(\)=>\{\}\)/.test(src), 'mute failures are no longer swallowed');
    assert.match(src, /muteVerified=after\?\.mutedInfo\?\.muted===true/, 'mute is read back after the update');
    assert.match(src, /if\(muted===false\)void ensureSourceTabMuted\(tabId\)/, 'an audible source sample re-asserts the mute');
    assert.match(src, /chrome\.tabs\.update\(tabId,\{muted:previousMuted\}\)/, 'unlink restores the original mute state');
  });
  await check('V13107-09:new-modules-are-in-the-served-bundle-in-order', () => {
    const b = read('src/server/static-files.js');
    const order = ['client/linked-playback-sync.js', 'client/linked-tab.js', 'client/solo-link-sync.js', 'playback-sync.js', 'client/tv-decoder-rescue.js', 'client/zero-converge.js', 'client/room-audio-unlock.js']
      .map(n => b.indexOf("'" + n + "'"));
    assert.ok(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), 'bundle order ' + order.join(','));
  });
}
