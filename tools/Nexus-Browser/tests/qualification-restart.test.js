const test = require('node:test');
const assert = require('node:assert/strict');
const { createQualificationRestartHook } = require('../dex/qualification-restart.js');

test('restart hook is dormant without supervisor IPC', () => {
  const hook = createQualificationRestartHook({ send: null });
  const result = hook.arm('run-1', 'request-1');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'QUALIFICATION_UNSUPERVISED');
});

test('restart hook requires an exact arm and is one-shot', () => {
  const sent = [];
  const hook = createQualificationRestartHook({ send: (message) => sent.push(message) });
  assert.equal(hook.arm('run-1', 'request-1').ok, true);
  assert.equal(hook.commit('run-1', 'wrong').ok, false);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { type: 'qualification_restart_arm', runId: 'run-1', requestId: 'request-1' });
  assert.equal(hook.commit('run-1', 'request-1').ok, true);
  assert.deepEqual(sent[1], { type: 'qualification_restart', runId: 'run-1', requestId: 'request-1' });
  assert.equal(hook.commit('run-1', 'request-1').ok, false);
});


test('restart hook cancellation disarms both local state and supervisor IPC without consuming the run', () => {
  const sent = [];
  const hook = createQualificationRestartHook({ send: (message) => sent.push(message) });
  assert.equal(hook.arm('run-cancel', 'request-cancel').ok, true);
  const cancelled = hook.cancel('run-cancel');
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(sent[1], { type: 'qualification_restart_cancel', runId: 'run-cancel', requestId: 'request-cancel' });
  assert.equal(hook.isArmed('run-cancel', 'request-cancel'), false);
  assert.equal(hook.arm('run-next', 'request-next').ok, true);
});
