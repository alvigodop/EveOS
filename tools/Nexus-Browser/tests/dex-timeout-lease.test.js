const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const failurePolicy = require('../public/dex-failure-policy.js');
const {
  TURN_IDLE_TIMEOUT_MS,
  TURN_ABSOLUTE_TIMEOUT_MS,
  LEASE_PERSIST_INTERVAL_MS,
  activityFromTransport,
  createServerTurnLease
} = require('../dex/server-turn-lease.js');

test('response timeouts enter capture recovery instead of replay or incident handling', () => {
  for (const code of ['RESPONSE_TIMEOUT', 'RESPONSE_TIMEOUT_ACTIVE', 'RESPONSE_TIMEOUT_ABSOLUTE']) {
    const decision = failurePolicy.decision(code, { dispatched: true, retryCount: 0 });
    assert.equal(decision.action, 'recover', code);
    assert.equal(decision.retry, false, code);
  }
});

test('server turn lease refreshes on provider activity and distinguishes active stalls', async () => {
  let nowMs = 1000;
  let current = { requestId: 'turn-1', roomId: 'room-1' };
  let snapshot = { rooms: [{ id: 'room-1', recovery: { dispatched: true } }] };
  const timers = [], timeouts = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const lease = createServerTurnLease({
    load: () => clone(snapshot),
    save: (value) => { snapshot = clone(value); return clone(snapshot); },
    roomById: (state, id) => state.rooms.find((room) => room.id === id),
    getCurrent: () => current,
    onTimeout: async (msg) => { timeouts.push(msg); },
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
    setTimer(fn, delay) { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearTimer() {}
  });

  lease.begin();
  assert.equal(timers.at(-1).delay, TURN_IDLE_TIMEOUT_MS);
  nowMs += TURN_IDLE_TIMEOUT_MS - 1000;
  lease.touch({ event: 'response_activity', generating: true });
  assert.equal(snapshot.rooms[0].recovery.generationState, 'active');
  assert.equal(snapshot.rooms[0].recovery.lastActivityEvent, 'response_activity');
  assert.equal(timers.at(-1).delay, TURN_IDLE_TIMEOUT_MS);

  nowMs += TURN_IDLE_TIMEOUT_MS;
  await timers.at(-1).fn();
  assert.equal(timeouts.at(-1).code, 'RESPONSE_TIMEOUT_ACTIVE');
});

test('server turn lease checkpoints rapid progress without rewriting the durable room on every sample', () => {
  let nowMs = 1000;
  let current = { requestId: 'turn-checkpoint', roomId: 'room-1' };
  let snapshot = { rooms: [{ id: 'room-1', recovery: { dispatched: true } }] };
  let saves = 0;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const lease = createServerTurnLease({
    load: () => clone(snapshot),
    save: (value) => { saves += 1; snapshot = clone(value); return clone(snapshot); },
    roomById: (state, id) => state.rooms.find((room) => room.id === id),
    getCurrent: () => current,
    onTimeout() {},
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
    setTimer(fn, delay) { return { fn, delay }; },
    clearTimer() {}
  });

  lease.begin();
  assert.equal(saves, 1);

  for (let index = 0; index < 20; index += 1) {
    nowMs += 400;
    lease.touch({ event: 'response_partial', progress: true });
  }
  assert.equal(saves, 1);
  assert.equal(current.lastActivityAtMs, nowMs);

  nowMs = 1000 + LEASE_PERSIST_INTERVAL_MS;
  lease.touch({ event: 'response_partial', progress: true });
  assert.equal(saves, 2);
  assert.equal(snapshot.rooms[0].recovery.lastActivityEvent, 'response_partial');

  nowMs += 400;
  lease.touch({ event: 'response_activity', generating: true });
  assert.equal(saves, 3);
  assert.equal(snapshot.rooms[0].recovery.generationState, 'active');
});

test('server turn lease keeps an independent bounded absolute ceiling', async () => {
  let nowMs = 0;
  let current = { requestId: 'turn-2', roomId: 'room-1' };
  let snapshot = { rooms: [{ id: 'room-1', recovery: { dispatched: true } }] };
  const timers = [], timeouts = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const lease = createServerTurnLease({
    load: () => clone(snapshot),
    save: (value) => { snapshot = clone(value); return clone(snapshot); },
    roomById: (state, id) => state.rooms.find((room) => room.id === id),
    getCurrent: () => current,
    onTimeout: async (msg) => { timeouts.push(msg); },
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
    setTimer(fn, delay) { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearTimer() {}
  });
  lease.begin();
  nowMs = TURN_ABSOLUTE_TIMEOUT_MS;
  await timers[0].fn();
  assert.equal(timeouts.at(-1).code, 'RESPONSE_TIMEOUT_ABSOLUTE');
});

test('transport activity mapping is provider-neutral', () => {
  assert.deepEqual(activityFromTransport({ type: 'prompt_accepted' }), { event: 'prompt_accepted' });
  assert.deepEqual(activityFromTransport({ type: 'response_partial' }), { event: 'response_partial', progress: true });
  assert.deepEqual(activityFromTransport({ type: 'response_activity', isGenerating: true }), {
    event: 'response_activity', generating: true, progress: false
  });
  assert.deepEqual(activityFromTransport({ type: 'activity_update' }), { event: 'activity_update' });
  assert.equal(activityFromTransport({ type: 'response_final' }), null);
});

test('online provider adapters report activity and do not own hard response timeout errors', () => {
  const providers = ['deepseek', 'grok', 'claude', 'chatgpt', 'gemini', 'muse'];
  for (const provider of providers) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', provider + '.js'), 'utf8');
    assert.match(source, /response_activity/, provider);
    assert.match(source, /capture_latest[\s\S]{0,700}generationState/, provider);
    assert.doesNotMatch(source, /code:\s*['"]RESPONSE_TIMEOUT(?:_ACTIVE)?['"]/, provider);
  }
  const worker = fs.readFileSync(path.join(__dirname, '..', 'extension', 'service-worker.js'), 'utf8');
  assert.match(worker, /response_activity/);
  assert.match(worker, /capture_result[\s\S]{0,500}generationState/);
});
