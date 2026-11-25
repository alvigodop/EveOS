// v13.10.5 policy falsifiers: 50 ms lock, 50-100 ms soft refining, >100 ms must act,
// and linked-playlist Play continuity. Each check is red on v13.10.3/v13.10.4.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'client');
const load = (name, ctx) => { vm.runInContext(fs.readFileSync(path.join(CLIENT, name), 'utf8'), ctx); return ctx; };
function context(extra = {}) {
  const ctx = {Date, Math, JSON, ...extra}; ctx.window = ctx.globalThis = ctx;
  return vm.createContext(ctx);
}
function arbiterRun({errorSec, rates = [.75, 1, 1.25], uncertaintyMs = 20, trusted = true, ms = 9000}) {
  const ctx = context({setTimeout: () => 0, clearTimeout() {}});
  // Load the actual production dependencies, never a stub/mocked controller.
  load('viewer-release-evidence.js', ctx);
  load('viewer-timing-math.js', ctx);
  load('viewer-sync-arbiter.js', ctx);
  const arbiter = ctx.WatchFusionViewerSyncArbiter.createViewerSyncArbiter({store: null,
    timers: {setTimeout: () => 0, clearTimeout() {}}});
  let position = 30 - errorSec, rate = 1;
  const actions = [];
  let clock = 0;
  const io = {now: () => clock, target: t => 30 + t / 1000, current: () => position, state: () => 1, baseRate: 1,
    availableRates: () => rates, buffered: () => 1,
    seek: v => actions.push(['seek', v]), pause: () => actions.push(['pause']), play: () => actions.push(['play']),
    rate: r => { rate = r; actions.push(['rate', r]); },
    referenceUncertaintyMs: () => uncertaintyMs, referenceTrusted: () => trusted, sourceBuffering: () => false};
  let last = null;
  for (let t = 0; t <= ms; t += 250) { clock = t; if (t) position += .25 * rate; last = arbiter.tick('scope', t, io); }
  return {actions, reason: arbiter.snapshot().reason, last, residualMs: Math.round((30 + ms / 1000 - position) * 1000)};
}

export async function runV13105PolicyChecks(check) {
  await check('V13105-01:locked-band-is-left-alone', () => {
    const r = arbiterRun({errorSec: .04});
    assert.deepEqual(r.actions, [], '<=50 ms is Locked: nothing is actuated');
  });
  await check('V13105-02:refining-band-makes-soft-attempts-toward-zero', () => {
    const r = arbiterRun({errorSec: .08});
    assert.ok(r.actions.some(([kind]) => kind === 'rate'), '50-100 ms Refining must try a gentle rate nudge (' + r.reason + ')');
    assert.ok(!r.actions.some(([kind]) => kind === 'seek' || kind === 'pause'), 'Refining never seeks or pauses');
    assert.ok(Math.abs(r.residualMs) < 50, 'soft attempts bring the residual under 50 ms, got ' + r.residualMs);
  });
  await check('V13105-03:over-100ms-on-a-noisy-reference-still-acts-softly', () => {
    const r = arbiterRun({errorSec: .12, uncertaintyMs: 110});
    assert.ok(r.actions.some(([kind]) => kind === 'rate'), '>100 ms must act even when the reference is noisy (' + r.reason + ')');
    assert.ok(!r.actions.some(([kind]) => kind === 'seek'), 'a noisy reference never earns a seek');
  });
  await check('V13105-04:exactly-100ms-is-still-refining-not-a-seek', () => {
    const r = arbiterRun({errorSec: .1000000001, rates: [1], ms: 4000});
    assert.ok(!r.actions.some(([kind]) => kind === 'seek' || kind === 'pause'), 'floating-point 100.0 ms is not >100 ms');
  });

  const continuity = () => {
    const notes = [];
    const ctx = context({watchFusionRoomSyncLog: {note: kind => notes.push(kind)}});
    return {api: load('playlist-continuity.js', ctx).WatchFusionPlaylistContinuity, notes};
  };
  const A = 'https://www.youtube.com/watch?v=AAAAAAAAAAA&list=PL1', B = 'https://www.youtube.com/watch?v=BBBBBBBBBBB&list=PL1';
  const opts = (now, sent) => ({eligible: true, connected: true, pending: false, now, send: () => { sent.push(now); return true; }});

  await check('V13105-05:late-preview-echo-pause-after-autoplay-is-resumed', () => {
    const {api} = continuity(), sent = [];
    api.observe({pageUrl: A, paused: false}, opts(0, sent));
    api.onTransition({pageUrl: A, paused: false}, {pageUrl: B, paused: false}, {eligible: true, now: 1000});
    api.observe({pageUrl: B, paused: false}, opts(1000, sent));          // YouTube autoplayed the next video
    assert.equal(api.manualPause(2500), false, 'the preview echo pause inside the transition is not deliberate');
    api.observe({pageUrl: B, paused: true}, opts(3000, sent));           // ...but it paused the source tab
    assert.deepEqual(sent, [3000], 'the source gets one Play without the user pressing it');
    api.observe({pageUrl: B, paused: false}, opts(4000, sent));
    api.observe({pageUrl: B, paused: false}, opts(7500, sent));
    assert.equal(api.diagnostics().active, false, 'continuity disarms after the new video plays steadily');
  });
  await check('V13105-06:a-pause-made-in-the-source-tab-is-preserved-across-next', () => {
    const {api} = continuity(), sent = [];
    api.observe({pageUrl: A, paused: false}, opts(0, sent));
    api.observe({pageUrl: A, paused: true}, opts(20000, sent));
    api.observe({pageUrl: A, paused: true}, opts(23000, sent));          // still paused: deliberate
    api.onTransition({pageUrl: A, paused: true}, {pageUrl: B, paused: true}, {eligible: true, now: 30000});
    for (const now of [31500, 34500, 38000]) api.observe({pageUrl: B, paused: true}, opts(now, sent));
    assert.deepEqual(sent, [], 'a deliberate source-tab pause is never overridden');
  });
  await check('V13105-07:a-pause-sample-at-track-end-is-not-a-deliberate-pause', () => {
    const {api} = continuity(), sent = [];
    api.observe({pageUrl: A, paused: false}, opts(0, sent));
    api.observe({pageUrl: A, paused: true}, opts(1000, sent));           // ended-ish pause sample right before the change
    api.onTransition({pageUrl: A, paused: true}, {pageUrl: B, paused: true}, {eligible: true, now: 1400});
    api.observe({pageUrl: B, paused: true}, opts(2600, sent));
    assert.equal(sent.length, 1, 'the playlist keeps playing intent through the transition');
  });
  await check('V13105-08:room-pause-outside-a-transition-wins-and-attempts-are-bounded', () => {
    const {api} = continuity(), sent = [];
    api.observe({pageUrl: A, paused: false}, opts(0, sent));
    assert.equal(api.manualPause(60000), true);
    api.onTransition({pageUrl: A, paused: true}, {pageUrl: B, paused: true}, {eligible: true, now: 61000});
    api.observe({pageUrl: B, paused: true}, opts(63000, sent));
    assert.deepEqual(sent, []);
    const second = continuity(), blocked = [];
    second.api.observe({pageUrl: A, paused: false}, opts(0, blocked));
    second.api.onTransition({pageUrl: A, paused: false}, {pageUrl: B, paused: true}, {eligible: true, now: 1000});
    for (let now = 2200; now <= 13000; now += 300) second.api.observe({pageUrl: B, paused: true}, opts(now, blocked));
    assert.equal(blocked.length, 2, 'autoplay refusal gets at most two Play requests, never a loop');
  });
  await check('V13105-09:preview-load-pause-is-guarded-but-a-later-real-pause-is-not', () => {
    const {api} = continuity();
    api.guardPreviewEvent(1, {paused: false}, 'AAAAAAAAAAA', 'AAAAAAAAAAA', 0);
    assert.equal(api.guardPreviewEvent(2, {paused: false}, 'BBBBBBBBBBB', 'BBBBBBBBBBB', 20000), true,
      'the first PAUSED of a newly loaded preview (after a slow resolve) is not sent to the source');
    assert.equal(api.guardPreviewEvent(2, {paused: false}, 'BBBBBBBBBBB', 'BBBBBBBBBBB', 40000), false,
      'a host pause long after the load is a real pause');
  });
}
