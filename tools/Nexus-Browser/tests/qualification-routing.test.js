const test = require('node:test');
const assert = require('node:assert/strict');
const { createQualificationRouting, isLoopback, semanticRoomFingerprint } = require('../dex/qualification-routing.js');

function fixture() {
  const order = [];
  const sent = [];
  const extension = { name: 'extension' };
  const ledger = new Map();
  const restart = {
    armed: null,
    arm(runId, requestId) { this.armed = { runId, requestId }; order.push('arm'); return { ok: true }; },
    isArmed(runId, requestId) { return this.armed?.runId === runId && this.armed?.requestId === requestId; },
    commit(runId, requestId) {
      if (!this.isArmed(runId, requestId)) return { ok: false, code: 'NOT_ARMED', message: 'not armed' };
      order.push('restart'); this.armed = null; return { ok: true };
    }
  };
  const durability = {
    async beforeDispatch(msg, meta) {
      order.push('durable');
      if (ledger.has(msg.requestId)) return { ok: false, duplicate: true, entry: ledger.get(msg.requestId) };
      const entry = { requestId: msg.requestId, state: 'dispatching', dispatchAttempts: 1, ...meta };
      ledger.set(msg.requestId, entry);
      return { ok: true, entry };
    },
    query(id) { return { reliable: true, entry: ledger.get(id) || null }; }
  };
  const safeSend = (socket, payload) => {
    sent.push({ socket, payload });
    if (socket === extension && payload.type === 'send_prompt') order.push('extension-send');
    return true;
  };
  const routing = createQualificationRouting({
    safeSend,
    getExtensionSocket: () => extension,
    getDurability: () => durability,
    getStateStore: () => ({ load: () => ({ rooms: [{ id: 'permanent-room' }] }) }),
    restartHook: restart,
    serverSessionId: 'session-1',
    now: () => 1000
  });
  const ws = { remoteAddress: '127.0.0.1' };
  routing.accept(ws);
  return { routing, ws, sent, order, extension, ledger, restart };
}

function lastPayload(f, socket = f.ws) {
  return [...f.sent].reverse().find((item) => item.socket === socket)?.payload;
}

async function begin(f) {
  await f.routing.handle(f.ws, {
    type: 'qualification_begin', requestId: 'rpc-begin', runId: 'run-1',
    providerId: 'muse', url: 'https://muse.ai/?q=run-1'
  });
  f.routing.observeExtension({
    type: 'qualification_result', requestId: 'rpc-begin', runId: 'run-1', action: 'open_target', ok: true,
    data: { providerId: 'muse', url: 'https://muse.ai/?q=run-1', tabId: 10, disposable: true, expiresAt: 999999 }
  });
}

test('qualification accept is localhost-only', () => {
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('192.168.1.4'), false);
});

test('qualification room fingerprint ignores volatile updatedAt churn but catches semantic changes', () => {
  const before = [{
    id: 'room-1',
    updatedAt: '2026-09-18T19:06:50.000Z',
    members: [{ id: 'agent-1', name: 'Muse', relayEnabled: false }],
    settings: { autoRelay: true, maxTurns: 8 },
    messages: [{ id: 'msg-1', text: 'hello', at: '2026-09-18T19:00:00.000Z' }]
  }];
  const timestampOnly = JSON.parse(JSON.stringify(before));
  timestampOnly[0].updatedAt = '2026-09-18T19:06:54.962Z';
  assert.equal(semanticRoomFingerprint(before), semanticRoomFingerprint(timestampOnly));

  const semanticChange = JSON.parse(JSON.stringify(timestampOnly));
  semanticChange[0].settings.maxTurns = 9;
  assert.notEqual(semanticRoomFingerprint(before), semanticRoomFingerprint(semanticChange));
});

test('qualification fault actions require the same live run owner', async () => {
  const f = fixture();
  await begin(f);
  const stranger = { role: 'qualification', remoteAddress: '127.0.0.1' };
  await f.routing.handle(stranger, {
    type: 'qualification_close_target', requestId: 'rpc-close', runId: 'run-1',
    providerId: 'muse', tabId: 10, url: 'https://muse.ai/?q=run-1'
  });
  assert.equal(lastPayload(f, stranger).code, 'QUALIFICATION_RUN_NOT_OWNED');
});

test('qualification routing registers pending ownership before extension delivery', async () => {
  const events = [];
  const ws = { remoteAddress: '127.0.0.1' };
  const extension = {};
  let routing;
  const safeSend = (socket, payload) => {
    if (socket === extension) events.push({ type: payload.type, pending: routing.pending.has(String(payload.requestId)) });
    return true;
  };
  routing = createQualificationRouting({
    safeSend,
    getExtensionSocket: () => extension,
    getDurability: () => ({ beforeDispatch: async () => ({ ok: true, entry: { state: 'dispatching' } }), query: () => ({ reliable: true, entry: null }) }),
    getStateStore: () => ({ load: () => ({ rooms: [] }) }),
    restartHook: { arm: () => ({ ok: true }), isArmed: () => true, commit: () => ({ ok: true }) },
    serverSessionId: 'session-1',
    now: () => 1000
  });
  routing.accept(ws);
  await routing.handle(ws, {
    type: 'qualification_begin', requestId: 'rpc-begin', runId: 'run-1',
    providerId: 'muse', url: 'https://muse.ai/?q=run-1'
  });
  assert.deepEqual(events, [{ type: 'qualification_open_target', pending: true }]);
});

test('durable dispatch happens before provider side effect and restart waits for extension commit', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_arm_restart', requestId: 'rpc-arm', runId: 'run-1', turnRequestId: 'turn-1'
  });
  await f.routing.handle(f.ws, {
    type: 'qualification_send_prompt', requestId: 'rpc-send', runId: 'run-1',
    turnRequestId: 'turn-1', text: 'QUALIFY_run-1'
  });
  assert.deepEqual(f.order, ['arm', 'durable', 'extension-send']);
  assert.equal(f.routing.observeExtension({
    type: 'qualification_dispatch_committed', requestId: 'turn-1', runId: 'run-1'
  }), true);
  assert.deepEqual(f.order, ['arm', 'durable', 'extension-send', 'restart']);
});

test('qualification refuses arbitrary prompt text before a dispatch can occur', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_arm_restart', requestId: 'rpc-arm', runId: 'run-1', turnRequestId: 'turn-1'
  });
  await f.routing.handle(f.ws, {
    type: 'qualification_send_prompt', requestId: 'rpc-send', runId: 'run-1',
    turnRequestId: 'turn-1', text: 'arbitrary command'
  });
  assert.equal(lastPayload(f).code, 'QUALIFICATION_PROMPT_REFUSED');
  assert.equal(f.ledger.size, 0);
});

test('qualification state fingerprint reads permanent rooms without mutating them', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, { type: 'qualification_state_fingerprint', requestId: 'rpc-fp', runId: 'run-1' });
  const payload = lastPayload(f);
  assert.equal(payload.ok, true);
  assert.equal(payload.action, 'state_fingerprint');
  assert.equal(payload.data.roomCount, 1);
});


test('qualification cleanup cancels an armed restart so a failed provider preflight cannot poison the next run', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_arm_restart', requestId: 'rpc-arm', runId: 'run-1', turnRequestId: 'turn-1'
  });
  assert.deepEqual(f.restart.armed, { runId: 'run-1', requestId: 'turn-1' });
  f.restart.cancel = (runId) => {
    if (f.restart.armed?.runId === runId) f.restart.armed = null;
    f.order.push('cancel');
    return { ok: true, cancelled: true };
  };
  await f.routing.handle(f.ws, {
    type: 'qualification_cleanup', requestId: 'rpc-cleanup', runId: 'run-1'
  });
  assert.equal(f.restart.armed, null);
  assert.equal(f.order.includes('cancel'), true);
});


test('qualification protocol exposes no room-destruction action for permanent or non-disposable rooms', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_delete_room', requestId: 'rpc-delete-room', runId: 'run-1',
    roomId: 'permanent-room'
  });
  assert.equal(lastPayload(f).code, 'QUALIFICATION_BAD_ACTION');
  await f.routing.handle(f.ws, {
    type: 'qualification_state_fingerprint', requestId: 'rpc-fp-after', runId: 'run-1'
  });
  assert.equal(lastPayload(f).data.roomCount, 1);
});


test('warm recovery target routing refuses provider mismatch and records an authorized warm target', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_select_recovery_target', requestId: 'rpc-warm-bad',
    runId: 'run-1', providerId: 'chatgpt'
  });
  assert.equal(lastPayload(f).code, 'QUALIFICATION_WARM_PROVIDER_MISMATCH');

  await f.routing.handle(f.ws, {
    type: 'qualification_select_recovery_target', requestId: 'rpc-warm',
    runId: 'run-1', providerId: 'muse'
  });
  f.routing.observeExtension({
    type: 'qualification_result', requestId: 'rpc-warm', runId: 'run-1',
    action: 'select_recovery_target', ok: true,
    data: { tabId: 2, providerId: 'muse', url: 'https://muse.ai/', targetMode: 'preexisting-warm' }
  });
  assert.equal(f.routing.runs.get('run-1').recoveryTargetId, 2);
});

test('warm recovery routing forwards an explicit tab pin unchanged', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_select_recovery_target', requestId: 'rpc-warm-pin',
    runId: 'run-1', providerId: 'muse', tabId: 2
  });
  const forwarded = f.sent.find((item) => item.socket === f.extension
    && item.payload?.requestId === 'rpc-warm-pin');
  assert.equal(forwarded.payload.type, 'qualification_select_recovery_target');
  assert.equal(forwarded.payload.providerId, 'muse');
  assert.equal(forwarded.payload.tabId, 2);
});

test('durable qualification dispatch metadata follows the authorized warm recovery target', async () => {
  const f = fixture();
  await begin(f);
  f.routing.runs.get('run-1').recoveryTargetId = 2;
  await f.routing.handle(f.ws, {
    type: 'qualification_arm_restart', requestId: 'rpc-arm-warm', runId: 'run-1', turnRequestId: 'turn-warm'
  });
  await f.routing.handle(f.ws, {
    type: 'qualification_send_prompt', requestId: 'rpc-send-warm', runId: 'run-1',
    turnRequestId: 'turn-warm', text: 'QUALIFY_run-1'
  });
  assert.equal(f.ledger.get('turn-warm').targetId, 2);
  const sentPrompt = f.sent.find((item) => item.socket === f.extension && item.payload?.requestId === 'turn-warm');
  assert.equal(sentPrompt.payload.qualification.targetMode, 'preexisting-warm');
});


test('qualification resume reconstructs the warm recovery target after supervised server restart', async () => {
  const f = fixture();
  const ws = { remoteAddress: '127.0.0.1' };
  f.routing.accept(ws);
  await f.routing.handle(ws, {
    type: 'qualification_resume', requestId: 'rpc-resume-warm',
    runId: 'run-resume-warm', providerId: 'muse'
  });
  assert.equal(f.routing.observeExtension({
    type: 'qualification_result', requestId: 'rpc-resume-warm',
    runId: 'run-resume-warm', action: 'inspect', ok: true,
    data: {
      runId: 'run-resume-warm', providerId: 'muse',
      url: 'https://muse.ai/?dex_qualification=run-resume-warm',
      tabId: 11, disposable: true, expiresAt: 999999,
      recoveryTarget: { tabId: 2, providerId: 'muse', url: 'https://muse.ai/' }
    }
  }), true);
  const resumed = f.routing.runs.get('run-resume-warm');
  assert.equal(resumed.targetId, 11);
  assert.equal(resumed.recoveryTargetId, 2);
});


test('qualification resume rebinds the claimed prompt so late provider finals reach the new socket', async () => {
  const f = fixture();
  const ws = { remoteAddress: '127.0.0.1' };
  f.routing.accept(ws);
  await f.routing.handle(ws, {
    type: 'qualification_resume', requestId: 'rpc-resume-late',
    runId: 'run-resume-late', providerId: 'chatgpt'
  });
  assert.equal(f.routing.observeExtension({
    type: 'qualification_result', requestId: 'rpc-resume-late',
    runId: 'run-resume-late', action: 'inspect', ok: true,
    data: {
      runId: 'run-resume-late', providerId: 'chatgpt',
      url: 'https://chatgpt.com/c/example', tabId: 12,
      disposable: true, expiresAt: 999999,
      promptClaimedRequestId: 'turn-late'
    }
  }), true);

  assert.equal(f.routing.pending.get('turn-late')?.ws, ws);
  assert.equal(f.routing.pending.get('turn-late')?.kind, 'prompt');

  assert.equal(f.routing.observeExtension({
    type: 'response_final', requestId: 'turn-late', text: 'Late authoritative final.'
  }), true);
  const forwarded = f.sent.find((item) => item.socket === ws
    && item.payload?.type === 'response_final'
    && item.payload?.requestId === 'turn-late');
  assert.equal(forwarded.payload.text, 'Late authoritative final.');
  assert.equal(f.routing.pending.has('turn-late'), false);
});

test('qualification prompt transport marks exact-once semantics for provider adapters', async () => {
  const f = fixture();
  await begin(f);
  await f.routing.handle(f.ws, {
    type: 'qualification_arm_restart', requestId: 'rpc-arm-exact',
    runId: 'run-1', turnRequestId: 'turn-exact'
  });
  await f.routing.handle(f.ws, {
    type: 'qualification_send_prompt', requestId: 'rpc-send-exact',
    runId: 'run-1', turnRequestId: 'turn-exact', text: 'QUALIFY_run-1'
  });
  const sentPrompt = f.sent.find((item) => item.socket === f.extension && item.payload?.requestId === 'turn-exact');
  assert.equal(sentPrompt.payload.qualification.exactOnce, true);
});
