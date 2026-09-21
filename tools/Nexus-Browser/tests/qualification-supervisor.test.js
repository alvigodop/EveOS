const test = require('node:test');
const assert = require('node:assert/strict');
const { createQualificationSupervisorControl } = require('../scripts/qualification-supervisor.js');

test('supervisor ignores malformed, unarmed, and non-current qualification restart messages', () => {
  const current = { id: 1 };
  const other = { id: 2 };
  const killed = [];
  const control = createQualificationSupervisorControl({
    isCurrent: (child) => child === current,
    kill: (child) => killed.push(child)
  });
  assert.equal(control.handle(other, { type: 'qualification_restart_arm', runId: 'run-1', requestId: 'request-1' }), false);
  assert.equal(control.handle(current, { type: 'qualification_restart', runId: 'run-1', requestId: 'request-1' }), false);
  assert.equal(control.handle(current, { type: 'qualification_restart_arm', runId: '', requestId: 'request-1' }), false);
  assert.equal(killed.length, 0);
});

test('supervisor kills only its current child after the exact one-shot arm', () => {
  const current = { id: 1 };
  const killed = [];
  const control = createQualificationSupervisorControl({
    isCurrent: (child) => child === current,
    kill: (child) => killed.push(child)
  });
  assert.equal(control.handle(current, { type: 'qualification_restart_arm', runId: 'run-1', requestId: 'request-1' }), true);
  assert.equal(control.handle(current, { type: 'qualification_restart', runId: 'run-1', requestId: 'wrong' }), false);
  assert.equal(control.handle(current, { type: 'qualification_restart', runId: 'run-1', requestId: 'request-1' }), true);
  assert.deepEqual(killed, [current]);
  assert.equal(control.handle(current, { type: 'qualification_restart', runId: 'run-1', requestId: 'request-1' }), false);
});


test('supervisor cancel clears only the exact current armed run without killing the child', () => {
  const current = { id: 1 };
  const killed = [];
  const control = createQualificationSupervisorControl({
    isCurrent: (child) => child === current,
    kill: (child) => killed.push(child)
  });
  assert.equal(control.handle(current, { type: 'qualification_restart_arm', runId: 'run-1', requestId: 'request-1' }), true);
  assert.equal(control.handle(current, { type: 'qualification_restart_cancel', runId: 'run-1', requestId: 'wrong' }), false);
  assert.equal(control.handle(current, { type: 'qualification_restart_cancel', runId: 'run-1', requestId: 'request-1' }), true);
  assert.equal(killed.length, 0);
  assert.equal(control.handle(current, { type: 'qualification_restart_arm', runId: 'run-2', requestId: 'request-2' }), true);
});
