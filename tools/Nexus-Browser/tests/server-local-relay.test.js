const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerLocalRelay } = require('../dex/server-local-relay.js');

test('server local relay preserves prompt mirror, status and emitted event hooks', async () => {
  const calls = [];
  const target = { id: 'local:one', providerId: 'local-agent', title: 'Agent' };
  const localTargets = {
    async getLocalTarget(id) {
      calls.push(['target', id]);
      return id === target.id ? target : null;
    },
    async sendLocalPrompt({ targetId, requestId, text, emit }) {
      calls.push(['send', targetId, requestId, text]);
      emit({ type: 'prompt_accepted', requestId });
      emit({ type: 'response_final', requestId, text: 'done' });
    }
  };
  const relayed = [];
  const relay = createServerLocalRelay({
    localTargets,
    mirrorPrompt(targetId, msg, resolved) { calls.push(['mirror', targetId, msg.requestId, resolved.id]); },
    emitEvent(targetId, payload) { calls.push(['event', targetId, payload.type]); },
    broadcastStatus(targetId) { calls.push(['status', targetId]); }
  });

  await relay.sendLocalPrompt({
    targetId: target.id,
    requestId: 'dex-turn-1',
    text: 'hello',
    emit(payload) { relayed.push(payload.type); }
  });

  assert.deepEqual(relayed, ['prompt_accepted', 'response_final']);
  assert.equal(calls.filter((item) => item[0] === 'mirror').length, 1);
  assert.deepEqual(calls.filter((item) => item[0] === 'status').map((item) => item[1]), [target.id, target.id]);
  assert.deepEqual(calls.filter((item) => item[0] === 'event').map((item) => item[2]), ['prompt_accepted', 'response_final']);
});

test('server local relay refuses a vanished exact local target before side effects', async () => {
  const relay = createServerLocalRelay({
    localTargets: {
      async getLocalTarget() { return null; },
      async sendLocalPrompt() { throw new Error('must not send'); }
    }
  });
  await assert.rejects(
    relay.sendLocalPrompt({ targetId: 'missing', requestId: 'dex-turn-2', text: 'x', emit() {} }),
    (error) => error.code === 'LOCAL_TARGET_NOT_FOUND'
  );
});


test('Local-Origin emitted events are serialized even when scheduler handling is async', async () => {
  const order = [];
  const relay = createServerLocalRelay({
    localTargets: {
      async getLocalTarget() { return { id: 'local:one', providerId: 'local-agent' }; },
      async sendLocalPrompt({ emit }) {
        emit({ type: 'prompt_accepted', requestId: 'dex-turn-3' });
        emit({ type: 'response_final', requestId: 'dex-turn-3', text: 'done' });
      }
    },
    async emitEvent(_targetId, payload) { order.push('mirror:' + payload.type); }
  });

  await relay.sendLocalPrompt({
    targetId: 'local:one',
    requestId: 'dex-turn-3',
    text: 'hello',
    async emit(payload) {
      if (payload.type === 'prompt_accepted') await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('scheduler:' + payload.type);
    }
  });

  assert.deepEqual(order, [
    'scheduler:prompt_accepted',
    'mirror:prompt_accepted',
    'scheduler:response_final',
    'mirror:response_final'
  ]);
});
