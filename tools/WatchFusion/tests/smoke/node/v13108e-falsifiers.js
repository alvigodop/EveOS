// v13.10.8e falsifiers: timing-sensor integrity. Red on v13.10.8d (0d69e111): the presentation route drops
// hostRecovery, Trace v3 cannot carry the source-led controller or its events, nothing separates a shared
// room-clock offset from player-vs-player disagreement, and a volume-only source change rewrites the room anchor.
// Evidence type: Node VM + in-process route only. Not Playwright, not Windows, not audible playback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.WF_FALSIFIER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

async function routes() {
  const {handleRoomRoute} = await import(pathToFileURL(path.join(ROOT, 'src/server/room-routes.js')).href);
  return async function request(room, action, body, memberId) {
    const url = new URL('http://localhost/api/rooms/' + room + (action ? '/' + action : ''));
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body ?? {}))]), {
      method: body ? 'POST' : 'GET', headers: memberId ? {'x-member-id': memberId} : {}});
    const res = {writeHead(code, headers) { this.status = code; this.headers = headers; }, end(text) { this.body = JSON.parse(text); }};
    await handleRoomRoute(req, res, url, url.pathname.split('/').filter(Boolean));
    return res;
  };
}

async function room(request, tag) {
  const id = (await request('E-' + tag, 'create', {})).body.roomId;
  const host = (await request(id, 'join', {name: 'Laptop-Side', accountId: 'host-' + tag + '-acct'})).body.session;
  const tv = (await request(id, 'join', {name: 'TV', accountId: 'tv-' + tag + '-acct'})).body.session;
  const cmd = (body, who = host) => request(id, 'command', body, who.memberId);
  const {state} = (await cmd({type: 'source', input: 'rm7UdTLKt5Y'})).body;
  const report = (who, extra = {}) => ({mode: 'youtube', outputSession: 'device-for-' + who.publicId, sampledAt: Date.now(), rate: 1,
    positionMs: 5000, roomPositionMs: 5000, rttMs: 8, ready: true, playing: true, follows: who !== host, ...extra});
  const post = (who, extra = {}, epoch = state.presentationEpoch) =>
    request(id, 'presentation', {epoch, diagnostics: true, report: report(who, extra)}, who.memberId);
  const peek = (who, epoch = state.presentationEpoch) => request(id, 'presentation', {epoch, diagnostics: true}, who.memberId);
  return {id, host, tv, cmd, post, peek, state, request};
}

function roomLog(hostDiag = {}) {
  const element = () => ({value: '', textContent: '', open: false, addEventListener() {}, focus() {}, select() {}});
  const nodes = {syncRoomLog: element(), syncRoomLogText: element(), syncRoomLogCopy: element(), syncRoomLogClear: element(), syncRoomLogCount: element()};
  let now = 100000;
  const ctx = {document: {getElementById: id => nodes[id] || null}, navigator: {}, performance: {now: () => now},
    roomId: 'room-1', session: {memberId: 'h'}, isHost: () => true,
    state: {presentationEpoch: 1, playoutSegment: 6, hostId: 'h', playback: {rate: 1},
      members: [{id: 'h', name: 'Laptop-Side'}, {id: 'tv', name: 'TV'}, {id: 'ph', name: 'Phone'}]},
    estimatedServerNow: () => now, setTimeout, console, Date, JSON, Math, Object, Number, Array, String, RegExp};
  ctx.window = ctx;
  ctx.WatchFusionHostPeerRecovery = {diagnostics: () => ({outcome: 'source-not-trusted', stage: 'observe', attempts: 0, peerCount: 0})};
  ctx.WatchFusionHostSourceConverge = {diagnostics: () => ({outcome: 'solo-source-verifying', stage: 'verifying', attempts: 1, witnesses: 8, errorMs: -341, ...hostDiag})};
  vm.runInNewContext(read('public/client/sync-room-log.js'), ctx, {filename: 'sync-room-log.js'});
  return {log: ctx.window.watchFusionRoomSyncLog, advance: ms => { now += ms; }, at: () => now};
}
const peer = (member, at, targetError, extra = {}) => ({member, sampledAt: at - 10, positionMs: 60000 + targetError, roomPositionMs: 60000,
  targetPositionMs: 60000, ready: true, playing: true, buffering: false, rttMs: 10, rate: 1, audible: true,
  sensor: {domain: 'player-timeline', heldMs: 0, clockUncertaintyMs: 5, audibleOutput: 'player'}, ...extra});

export async function runV13108eChecks(check) {
  await check('V13108E-01:presentation-route-keeps-bounded-host-recovery-and-sensor-and-drops-it-for-viewers', async () => {
    const request = await routes(), r = await room(request, 'e01');
    const hostRecovery = {outcome: 'source-not-trusted', stage: 'observe', reference: 'linked-tab', attempts: 0, peerCount: 0, hostErrorMs: -130,
      url: 'https://youtube.com/watch?v=x', linkedSource: {outcome: 'solo-source-verifying', stage: 'verifying', attempts: 1, witnesses: 8,
      errorMs: -341, verifyMs: 900, acceptedAt: 1234.5, token: 'secret-token', note: 'Free Text!'}};
    const sensor = {domain: 'player-timeline', heldMs: 40, cadenceMs: 250, clockUncertaintyMs: 5, audibleOutput: 'player', raw: [1, 2]};
    assert.equal((await r.post(r.host, {hostRecovery, sensor})).status, 200);
    assert.equal((await r.post(r.tv, {hostRecovery, sensor: {domain: 'speaker', audibleOutput: 'microphone', heldMs: -5}})).status, 200);
    const peers = (await r.peek(r.tv)).body.peers;
    const h = peers.find(p => p.member === r.host.publicId), t = peers.find(p => p.member === r.tv.publicId);
    assert.equal(h.hostRecovery?.linkedSource?.outcome, 'solo-source-verifying', 'source-led host recovery must survive the route');
    assert.equal(h.hostRecovery.linkedSource.errorMs, -341);
    assert.equal(h.hostRecovery.reference, 'linked-tab');
    assert.equal(h.sensor?.audibleOutput, 'player');
    assert.equal(h.sensor.heldMs, 40);
    assert.doesNotMatch(JSON.stringify(peers), /youtube\.com|secret-token|Free Text|acceptedAt|"raw"/);
    assert.equal(t.hostRecovery, null, 'a viewer never speaks for host recovery');
    assert.deepEqual([t.sensor.domain, t.sensor.audibleOutput, t.sensor.heldMs], [null, 'unknown', null], 'unknown domains never become speaker claims');
    // Handoff: the former host loses its recovery voice at once.
    const moved = await r.cmd({type: 'transfer-host', targetMemberId: r.tv.publicId});
    assert.equal(moved.status, 200);
    const epoch = moved.body.state.presentationEpoch;
    assert.equal((await r.post(r.host, {hostRecovery}, epoch)).status, 200);
    const old = (await r.peek(r.tv, epoch)).body.peers.find(p => p.member === r.host.publicId);
    assert.equal(old.hostRecovery, null, 'after a handoff the former host no longer reports host recovery');
  });

  await check('V13108E-02:trace-v3-carries-source-led-host-recovery-from-the-wire-and-the-local-fallback', () => {
    const {log, at} = roomLog();
    const wire = peer('h', at(), -341, {hostRecovery: {outcome: 'source-not-trusted', stage: 'observe', attempts: 0,
      linkedSource: {outcome: 'solo-source-landing-incomplete', stage: 'retry-wait', attempts: 1, witnesses: 8, errorMs: -937, verifyMs: 8000}}});
    log.observe([wire], {reference: 'linked-tab', source: 'live'});
    let row = JSON.parse(log.export()).snapshots.at(-1).peers[0];
    assert.equal(row.hostRecovery?.linkedSource?.outcome, 'solo-source-landing-incomplete');
    assert.equal(row.hostRecovery.linkedSource.errorMs, -937);
    const fallback = roomLog();
    fallback.log.observe([peer('h', fallback.at(), -341)], {reference: 'linked-tab', source: 'live'});
    row = JSON.parse(fallback.log.export()).snapshots.at(-1).peers[0];
    assert.equal(row.hostRecovery?.outcome, 'source-not-trusted', 'legacy path still reported');
    assert.equal(row.hostRecovery?.linkedSource?.stage, 'verifying', 'the new controller is read when the server omits it');
  });

  await check('V13108E-03:host-source-and-mirror-drift-events-reach-the-trace', () => {
    const {log} = roomLog();
    log.note('host-source-rejoin-triggered', {errorMs: -341, dwellMs: 3300, attempts: 1});
    log.note('host-source-landing-incomplete', {errorMs: -525, attempts: 1});
    log.note('mirror-drift-observing', {driftMs: 220});
    const events = JSON.parse(log.export()).events;
    assert.deepEqual(events.map(e => e.kind), ['host-source-rejoin-triggered', 'host-source-landing-incomplete', 'mirror-drift-observing']);
    assert.equal(events[0].errorMs, -341);
    assert.equal(events[2].driftMs, 220);
  });

  await check('V13108E-04:group-phase-separates-common-mode-offset-disagreement-stale-and-single-player', () => {
    const snap = rows => { const {log, at} = roomLog(); log.observe(rows(at()), {reference: 'peer-cohort', source: 'live'}); return JSON.parse(log.export()).snapshots.at(-1); };
    let s = snap(at => [peer('h', at, -130), peer('tv', at, -128), peer('ph', at, -133)]);
    assert.equal(s.groupPhase, 'common-mode-offset', 'same-phase players at -130 ms agree with each other');
    assert.equal(s.groupSpreadMs, 5); assert.equal(s.commonModeMs, -130); assert.equal(s.speakerPhase, 'not-measured');
    s = snap(at => [peer('h', at, -10), peer('tv', at, 190)]);
    assert.equal(s.groupPhase, 'players-disagree'); assert.equal(s.groupSpreadMs, 200);
    s = snap(at => [peer('h', at, 190), peer('tv', at, -10)]);
    assert.equal(s.groupPhase, 'players-disagree', 'reversed drift is still disagreement');
    s = snap(at => [peer('h', at, -130), peer('tv', at - 5000, 400)]);
    assert.equal(s.groupPhase, 'unmeasured-single-player', 'a stale peer is never a phase witness');
    s = snap(at => [peer('h', at, -130), peer('tv', at, -1680, {buffering: true, playing: false})]);
    assert.equal(s.groupPhase, 'unmeasured-single-player', 'a buffering transient is excluded');
    s = snap(at => [peer('h', at, -130)]);
    assert.equal(s.groupPhase, 'unmeasured-single-player'); assert.equal(s.groupSpreadMs, null);
    s = snap(at => [peer('h', at, -8), peer('tv', at, 12)]);
    assert.equal(s.groupPhase, 'aligned');
    s = snap(at => [peer('h', at, -130), peer('tv', at, -130, {audible: false, sensor: {audibleOutput: 'none'}})]);
    assert.equal(s.groupPhase, 'unmeasured-single-player', 'a silent player cannot vouch for audible alignment');
  });

  await check('V13108E-05:volume-only-source-change-keeps-the-mirror-anchor-timeline', () => {
    const ctx = {window: {}, Math, Number, Date, performance: {now: () => 0}, console};
    ctx.globalThis = ctx; vm.runInNewContext(read('public/client/linked-playback-sync.js'), ctx);
    const sync = ctx.window.WatchFusionLinkedPlaybackSync || ctx.WatchFusionLinkedPlaybackSync;
    const t0 = 1000000, meta = (at, current, extra = {}) => ({sampledAt: at, currentTime: current, paused: false, rate: 1, volume: .31, ...extra});
    let plan = sync.mirrorPlan(meta(t0, 80), null, {now: t0});
    const anchor = plan.anchor;
    // Drift's 05:04:42 burst: 31 -> 40 -> 33 with a source sample that reads 120 ms behind its own clock.
    plan = sync.mirrorPlan(meta(t0 + 80, 79.96, {volume: .40}), anchor, {now: t0 + 80});
    assert.equal(plan.reason, 'volume'); assert.equal(plan.volumeOnly, true);
    assert.ok(Math.abs(plan.anchor.position - 80.08) < 1e-6, 'the anchor timeline is projected, not replaced by the sample');
    assert.equal(plan.anchor.volume, .40);
    plan = sync.mirrorPlan(meta(t0 + 400, 80.4, {volume: .40, paused: true}), plan.anchor, {now: t0 + 400});
    assert.equal(plan.reason, 'state', 'pause stays a transport change'); assert.notEqual(plan.volumeOnly, true);
    plan = sync.mirrorPlan(meta(t0 + 400, 83.5, {volume: .33}), anchor, {now: t0 + 400});
    assert.notEqual(plan.volumeOnly, true, 'a real source seek with a volume change still moves the timeline');
  });

  await check('V13108E-06:server-volume-only-mirror-changes-audio-not-the-anchor-or-segment', async () => {
    const request = await routes(), r = await room(request, 'e06');
    assert.equal((await r.cmd({type: 'play', position: 80})).status, 200);
    const before = (await r.cmd({type: 'mirror', position: 80.5, paused: false, rate: 1, volume: 31})).body.state;
    const after = (await r.cmd({type: 'mirror', position: 81.7, paused: false, rate: 1, volume: 40, volumeOnly: true})).body.state;
    assert.equal(after.playback.volume, 40);
    assert.equal(after.playback.updatedAt, before.playback.updatedAt, 'volume-only must not republish the anchor');
    assert.ok(Math.abs(after.playback.position - before.playback.position) < .05, 'the stale 81.7 s sample must not move the room');
    assert.equal(after.playoutSegment, before.playoutSegment);
    const paused = (await r.cmd({type: 'mirror', position: 82, paused: true, rate: 1, volume: 40, volumeOnly: true})).body.state;
    assert.equal(paused.playback.paused, true, 'a volume-only flag cannot hide a transport change');
  });

  await check('V13108E-07:sensor-provenance-reports-held-reads-cadence-and-which-output-is-audible', () => {
    assert.ok(exists('public/client/sensor-provenance.js'), 'sensor-provenance.js missing');
    const ctx = {Math, Number, performance: {now: () => 0}};
    ctx.globalThis = ctx; vm.runInNewContext(read('public/client/sensor-provenance.js'), ctx);
    const s = ctx.WatchFusionSensorProvenance, player = {getVolume: () => 60, isMuted: () => false};
    for (let t = 0; t <= 2000; t += 50) s.track(player, t, Math.floor(t / 250) * .25, true);
    const d = s.describe({media: player, now: 2120, rttMs: 10, source: {tabMuted: true, paused: false, volume: .4}});
    assert.equal(d.domain, 'player-timeline'); assert.equal(d.cadenceMs, 250); assert.equal(d.heldMs, 120);
    assert.equal(d.clockUncertaintyMs, 5); assert.equal(d.audibleOutput, 'player');
    assert.equal(s.audibleOutput({playerAudible: true, source: {tabMuted: false, paused: false, volume: .4}}), 'both');
    assert.equal(s.audibleOutput({playerAudible: false, source: {tabMuted: false, paused: false, volume: .4}}), 'source-tab');
    assert.equal(s.audibleOutput({playerAudible: true, source: {paused: false}}), 'unknown', 'unknown tab mute is not a claim');
    s.track(player, 2200, 2.25, false);
    assert.equal(s.describe({media: player, now: 2300}).heldMs, null, 'no held claim while paused');
  });

  await check('V13108E-08:roster-explains-a-missing-device-instead-of-dropping-it-silently', async () => {
    const request = await routes(), r = await room(request, 'e08');
    assert.equal((await r.post(r.host)).status, 200);
    assert.equal((await r.post(r.tv, {sampledAt: Date.now() + 900})).status, 400);
    assert.equal((await r.post(r.tv, {}, r.state.presentationEpoch + 7)).status, 409);
    const body = (await r.post(r.host)).body;
    assert.ok(body.roster, 'roster missing');
    assert.equal(body.roster.members, 2); assert.equal(body.roster.reporting, 1);
    assert.equal(body.roster.rejections['clock-skew'], 1); assert.equal(body.roster.rejections['epoch-changed'], 1);
    assert.doesNotMatch(JSON.stringify(body.roster), /acct|device-for|TV/);
    const big = {hostRecovery: {outcome: 'source-not-trusted', stage: 'observe', reference: 'linked-tab', attempts: 0, witnesses: 0, peerCount: 0,
      hostErrorMs: -130.12, dwellMs: 0, linkedSource: {outcome: 'solo-source-landing-incomplete', stage: 'retry-wait', attempts: 1, witnesses: 8, errorMs: -937, segment: 6, verifyMs: 12345}},
      sensor: {domain: 'player-timeline', heldMs: 12, cadenceMs: 250, clockUncertaintyMs: 5, audibleOutput: 'player'}, timingReference: 'Shared cohort ±125 ms',
      recentCorrection: 'fine-drift-awaiting-capability', seekHealth: {reason: 'seek-awaiting-proof', attempts: 3, failures: 0, overshoots: 0, cooldownRemainingMs: 0, recoveryAttempts: 1, lastRecoveryBiasMs: 1955}};
    assert.equal((await r.post(r.host, big)).status, 200, 'a full host diagnostic still fits the 2048-byte route cap');
  });
}
