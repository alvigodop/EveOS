const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TARGET_PREFIX,
  waitForReadySnapshot,
  sendPrompt
} = require('../local-targets/antigravity-existing');

test('existing-session readiness waits for a manual/local turn to return to an empty prompt', async () => {
  const snapshots = [
    { ok: true, text: 'Working...\nGemini 3.8 Flash · high' },
    { ok: true, text: '> unsent draft\n? for shortcuts' },
    { ok: true, text: 'Earlier\n>\n? for shortcuts' }
  ];
  let waits = 0;
  let clock = 0;
  const ready = await waitForReadySnapshot(86660, {
    snapshotImpl: () => snapshots.shift() || { ok: true, text: 'Earlier\n>\n? for shortcuts' },
    sleepImpl: async () => {},
    nowImpl: () => ++clock,
    timeoutMs: 30,
    pollMs: 0,
    onWait: () => { waits += 1; }
  });
  assert.match(ready.text, />\n\? for shortcuts/);
  assert.equal(waits, 1, 'waiting activity is announced once rather than spamming the room');
});

test('existing-session queued bridge turn dispatches only after the headed terminal becomes ready', async () => {
  const snapshots = [
    { ok: true, text: 'Working...\nGemini 3.8 Flash · high' },
    { ok: true, text: 'Earlier\n>\n? for shortcuts' },
    { ok: true, text: 'Earlier\n> queued hello\nQueued ack arrived.\n>\n? for shortcuts' }
  ];
  const sent = [];
  const events = [];
  let clock = 0;
  const code = await sendPrompt({
    requestId: 'queued-ready',
    text: 'queued hello',
    target: {
      id: `${TARGET_PREFIX}86660`,
      pid: 86660,
      providerId: 'local-antigravity-existing',
      providerName: 'Antigravity CLI'
    },
    snapshotImpl: () => snapshots.shift() || { ok: true, text: 'Earlier\n> queued hello\nQueued ack arrived.\n>\n? for shortcuts' },
    sendImpl: (_pid, text) => { sent.push(text); return { ok: true }; },
    emit: (event) => events.push(event),
    sleepImpl: async () => {},
    nowImpl: () => ++clock,
    readyTimeoutMs: 30,
    readyPollMs: 0,
    timeoutMs: 30,
    pollMs: 0,
    stableMs: 0
  });
  assert.equal(code, 0);
  assert.deepEqual(sent, ['queued hello']);
  assert.equal(events.filter((event) => event.type === 'activity_update').length, 1);
  assert.equal(events.at(-1).type, 'response_final');
  assert.equal(events.at(-1).text, 'Queued ack arrived.');
});

test('readiness timeout is explicit and preserves a machine-readable local error code', async () => {
  let clock = 0;
  await assert.rejects(
    waitForReadySnapshot(86660, {
      snapshotImpl: () => ({ ok: true, text: '> unsent draft\n? for shortcuts' }),
      sleepImpl: async () => {},
      nowImpl: () => ++clock,
      timeoutMs: 2,
      pollMs: 0
    }),
    (error) => error.code === 'LOCAL_EXISTING_NOT_READY'
  );

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /code: error\.code \|\| 'LOCAL_TARGET_ERROR'/);
});
