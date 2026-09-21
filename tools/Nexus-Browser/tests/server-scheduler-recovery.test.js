const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerSchedulerRecovery, UNCERTAIN_STABLE_MS, MAX_RECOVERY_MS } = require('../dex/server-scheduler-recovery.js');

function snapshot() {
  return {
    version: 1,
    activeRoomId: 'room-1',
    rooms: [{
      id: 'room-1',
      name: 'Recovery',
      members: [{
        id: 'eve', name: 'Eve',
        binding: { targetClassId: 'online-origin', providerId: 'future-provider', targetId: 9, url: 'https://future.example/chat/1' }
      }],
      messages: [
        { id: 'old', senderKind: 'agent', senderId: 'eve', senderName: 'Eve', text: 'Previous answer.' },
        { id: 'source', senderKind: 'user', senderId: 'user', senderName: 'Drift', text: 'Continue.' }
      ],
      relay: { active: false, remaining: 0, waitingFor: null, lastStopReason: 'Provider transport restart · recovering interrupted turn' },
      recovery: {
        requestId: 'dex-turn-1',
        memberId: 'eve',
        sourceMessageId: 'source',
        targetClassId: 'online-origin',
        providerId: 'future-provider',
        relayActive: true,
        relayRemaining: 0,
        retryCount: 0,
        dispatched: true,
        expectedPrompt: 'UNIQUE RECOVERY PROMPT dex-turn-1',
        startedAt: '2026-09-18T23:50:00.000Z',
        interruptedAt: '2026-09-18T23:50:10.000Z',
        captureRequestId: null,
        candidateText: null,
        candidateAt: 0,
        ensureTargetRequestId: null,
        selectingTargetId: null
      }
    }]
  };
}

function harness() {
  let current = snapshot();
  let nowMs = Date.parse('2026-09-18T23:50:20.000Z');
  const sent = [], incidents = [], scheduled = [], enqueued = [], timedOut = [];
  const target = { id: 9, providerId: 'future-provider', providerName: 'Future Provider', url: 'https://future.example/chat/1' };
  const load = () => JSON.parse(JSON.stringify(current));
  const save = (value) => { current = JSON.parse(JSON.stringify(value)); return load(); };
  const recovery = createServerSchedulerRecovery({
    load, save,
    uid: (prefix) => prefix + '-1',
    nowMs: () => nowMs,
    getOnlineTargets: () => [target],
    getProviders: () => [{
      id: 'future-provider',
      adapterContract: {
        version: 1,
        operations: {
          probe: true, ensureReady: true, send: true, observe: true,
          captureLatest: true, recover: true, health: true
        }
      }
    }],
    getSelectedOnlineTarget: () => target,
    getLocalTargets: async () => [],
    isExtensionAvailable: () => true,
    sendExtension(payload) { sent.push(payload); return true; },
    captureLocalLatest: async () => ({ text: '' }),
    recordIncident(input) { incidents.push(input); },
    markTimedOut(input) { timedOut.push({ ...input }); },
    addMessage(room, input) {
      const message = { id: 'recovered', at: new Date(nowMs).toISOString(), ...input };
      room.messages.push(message);
      return message;
    },
    enqueueNext(room, message) { enqueued.push({ roomId: room.id, message }); },
    setStopped(room, reason) {
      room.relay = { active: false, remaining: 0, waitingFor: null, lastStopReason: reason };
      delete room.recovery;
    },
    processSoon(delay) { scheduled.push(delay); }
  });
  const durability = {
    query() { return { reliable: true, entry: { requestId: 'dex-turn-1', state: 'accepted' } }; }
  };
  return {
    recovery, durability, sent, incidents, scheduled, enqueued, timedOut,
    value: () => load(),
    advance(ms) { nowMs += ms; }
  };
}

test('server recovery performs capture-without-resend and stitches stable reply back into room', async () => {
  const h = harness();
  await h.recovery.resume(h.durability);
  assert.equal(h.sent[0].type, 'capture_latest');
  assert.equal(h.sent[0].expectedPrompt, 'UNIQUE RECOVERY PROMPT dex-turn-1');
  assert.equal(h.sent.some((item) => item.type === 'send_prompt'), false);

  const firstRequest = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({ type: 'capture_result', requestId: firstRequest, text: 'Recovered answer.', isGenerating: false, generationState: 'idle', completenessHint: 'settled' });
  assert.equal(h.value().rooms[0].recovery.candidateText, 'Recovered answer.');

  h.advance(1300);
  await h.recovery.resume(h.durability);
  const secondRequest = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({ type: 'capture_result', requestId: secondRequest, text: 'Recovered answer.', isGenerating: false, generationState: 'idle', completenessHint: 'settled' });

  const room = h.value().rooms[0];
  assert.equal(room.recovery, undefined);
  assert.equal(room.messages.at(-1).text, 'Recovered answer.');
  assert.equal(h.sent.some((item) => item.type === 'send_prompt'), false);
});

test('uncertain one-word capture waits for later body growth before recovery finalizes', async () => {
  const h = harness();
  await h.recovery.resume(h.durability);

  let requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId,
    text: 'That',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'unknown'
  });
  assert.equal(h.value().rooms[0].recovery.candidateText, 'That');

  h.advance(1300);
  await h.recovery.resume(h.durability);
  requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId,
    text: 'That',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'unknown'
  });
  assert.ok(h.value().rooms[0].recovery);
  assert.equal(h.value().rooms[0].messages.at(-1).id, 'source');

  h.advance(1000);
  await h.recovery.resume(h.durability);
  requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId,
    text: 'That is the complete recovered response.',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'complete'
  });
  assert.equal(h.value().rooms[0].recovery.candidateText, 'That is the complete recovered response.');

  h.advance(1300);
  await h.recovery.resume(h.durability);
  requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId,
    text: 'That is the complete recovered response.',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'complete'
  });
  assert.equal(h.value().rooms[0].recovery, undefined);
  assert.equal(h.value().rooms[0].messages.at(-1).text, 'That is the complete recovered response.');
  assert.ok(UNCERTAIN_STABLE_MS > 1300);
  assert.equal(h.sent.some((item) => item.type === 'send_prompt'), false);
});


test('explicitly incomplete recovery capture never becomes a stable candidate', async () => {
  const h = harness();
  await h.recovery.resume(h.durability);
  let requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId,
    text: 'R',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'incomplete'
  });
  let recovery = h.value().rooms[0].recovery;
  assert.equal(recovery.candidateText, null);
  assert.equal(recovery.candidateAt, 0);

  h.advance(UNCERTAIN_STABLE_MS + 1000);
  await h.recovery.resume(h.durability);
  requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId,
    text: 'R',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'incomplete'
  });
  recovery = h.value().rooms[0].recovery;
  assert.equal(recovery.candidateText, null);
  assert.equal(h.value().rooms[0].messages.at(-1).id, 'source');
});

test('extension disconnect releases active recovery worker but preserves durable journal', async () => {
  const h = harness();
  await h.recovery.resume(h.durability);
  assert.ok(h.recovery.diagnostics().active);
  assert.equal(h.recovery.transportLost(), true);
  assert.equal(h.recovery.diagnostics().active, null);
  const recovery = h.value().rooms[0].recovery;
  assert.ok(recovery);
  assert.equal(recovery.captureRequestId, null);
  assert.equal(recovery.ensureTargetRequestId, null);
  assert.equal(recovery.selectingTargetId, null);
});

test('recovery timeout enters passive late-final watch and stops active polling', async () => {
  const h = harness();
  h.advance(MAX_RECOVERY_MS + 1);
  await h.recovery.resume(h.durability);
  let room = h.value().rooms[0];
  assert.ok(room.recovery?.passiveAt);
  assert.equal(room.recovery.stopRequested, true);
  assert.match(room.relay.lastStopReason, /awaiting late provider final/);
  assert.equal(h.incidents[0].code, 'RECOVERY_TIMEOUT');
  assert.equal(h.timedOut[0].requestId, 'dex-turn-1');
  assert.equal(h.recovery.diagnostics().active, null);

  const sentBefore = h.sent.length;
  await h.recovery.resume(h.durability);
  room = h.value().rooms[0];
  assert.ok(room.recovery?.passiveAt);
  assert.equal(h.sent.length, sentBefore);
});

test('late provider final after passive timeout is stitched without restarting the relay', async () => {
  const h = harness();
  h.advance(MAX_RECOVERY_MS + 1);
  await h.recovery.resume(h.durability);

  const handled = h.recovery.handleEvent({
    type: ['response', 'final'].join('_'),
    requestId: 'dex-turn-1',
    text: 'Late but authoritative final.',
    observedAt: Date.parse('2026-09-19T01:00:00.000Z')
  });

  const room = h.value().rooms[0];
  assert.equal(handled, true);
  assert.equal(room.recovery, undefined);
  assert.equal(room.messages.at(-1).text, 'Late but authoritative final.');
  assert.equal(room.relay.active, false);
  assert.equal(h.enqueued.length, 0);
  assert.match(room.relay.lastStopReason, /awaiting late provider final/);
});


test('recovery fails closed when provider omits recover/capture contract support', async () => {
  let current = snapshot();
  const incidents = [];
  const recovery = createServerSchedulerRecovery({
    load: () => JSON.parse(JSON.stringify(current)),
    save(value) { current = JSON.parse(JSON.stringify(value)); return JSON.parse(JSON.stringify(current)); },
    uid: (prefix) => prefix + '-x',
    nowMs: () => Date.parse('2026-09-18T23:50:20.000Z'),
    getOnlineTargets: () => [{ id: 9, providerId: 'future-provider', url: 'https://future.example/chat/1' }],
    getProviders: () => [{
      id: 'future-provider',
      adapterContract: { version: 1, operations: { recover: false, captureLatest: false } }
    }],
    getSelectedOnlineTarget: () => null,
    getLocalTargets: async () => [],
    isExtensionAvailable: () => true,
    sendExtension() { throw new Error('must not transport'); },
    captureLocalLatest: async () => ({ text: '' }),
    recordIncident(input) { incidents.push(input); },
    addMessage() {},
    enqueueNext() {},
    setStopped(room, reason) {
      room.relay = { active: false, remaining: 0, waitingFor: null, lastStopReason: reason };
      delete room.recovery;
    },
    processSoon() {}
  });
  await recovery.resume({ query: () => ({ reliable: true, entry: { state: 'accepted' } }) });
  assert.equal(current.rooms[0].recovery, undefined);
  assert.match(current.rooms[0].relay.lastStopReason, /recovery contract is unsupported/);
  assert.equal(incidents[0].code, 'PROVIDER_OPERATION_UNSUPPORTED');
});

test('generation-aware recovery never finalizes a capture while the provider is still generating', async () => {
  const h = harness();
  await h.recovery.resume(h.durability);
  const activeRequest = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId: activeRequest,
    text: 'Partial answer that paused.',
    isGenerating: true,
    generationState: 'active',
    observedAt: Date.now()
  });

  let recovery = h.value().rooms[0].recovery;
  assert.equal(recovery.candidateText, null);
  assert.equal(recovery.lastCaptureGenerationState, 'active');
  assert.ok(h.scheduled.length > 0);

  await h.recovery.resume(h.durability);
  const firstIdleRequest = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId: firstIdleRequest,
    text: 'Final recovered answer.',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'settled'
  });
  recovery = h.value().rooms[0].recovery;
  assert.equal(recovery.candidateText, 'Final recovered answer.');

  h.advance(1300);
  await h.recovery.resume(h.durability);
  const settledRequest = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result',
    requestId: settledRequest,
    text: 'Final recovered answer.',
    isGenerating: false,
    generationState: 'idle',
    completenessHint: 'settled'
  });
  assert.equal(h.value().rooms[0].messages.at(-1).text, 'Final recovered answer.');
  assert.equal(h.sent.some((item) => item.type === 'send_prompt'), false);
});

test('original provider final arriving during recovery clears the recovery journal without replay', () => {
  const h = harness();

  const handled = h.recovery.handleEvent({
    type: ['response', 'final'].join('_'),
    requestId: 'dex-turn-1',
    text: 'Recovered through original final.',
    observedAt: Date.parse('2026-09-18T23:50:20.000Z')
  });

  const room = h.value().rooms[0];
  assert.equal(handled, true);
  assert.equal(room.recovery, undefined);
  assert.equal(room.messages.at(-1).text, 'Recovered through original final.');
  assert.equal(h.sent.some((item) => item.type === 'send_prompt'), false);
});

test('normal in-flight provider final is left to the scheduler instead of recovery interception', () => {
  const h = harness();
  const current = h.value();
  current.rooms[0].recovery.interruptedAt = null;
  current.rooms[0].recovery.startedAt = '2026-09-18T23:50:10.000Z';

  let snapshotValue = current;
  const recovery = createServerSchedulerRecovery({
    load: () => JSON.parse(JSON.stringify(snapshotValue)),
    save(value) { snapshotValue = JSON.parse(JSON.stringify(value)); return JSON.parse(JSON.stringify(snapshotValue)); },
    uid: (prefix) => prefix + '-normal',
    nowMs: () => Date.parse('2026-09-18T23:50:20.000Z'),
    getOnlineTargets: () => [],
    getProviders: () => [],
    getSelectedOnlineTarget: () => null,
    getLocalTargets: async () => [],
    isExtensionAvailable: () => true,
    sendExtension() { return true; },
    captureLocalLatest: async () => ({ text: '' }),
    recordIncident() {},
    addMessage() { throw new Error('normal final must not be consumed by recovery'); },
    enqueueNext() {},
    setStopped() {},
    processSoon() {}
  });

  const handled = recovery.handleEvent({
    type: ['response', 'final'].join('_'),
    requestId: 'dex-turn-1',
    text: 'Healthy final.'
  });
  assert.equal(handled, false);
  assert.ok(snapshotValue.rooms[0].recovery);
});



test('recovered provider-control reply preserves exact origin correlation intent', async () => {
  const h = harness();
  const reply = 'Recovered control. [[DEX:CMD {"action":"status","room":"room-1"}]]';
  await h.recovery.resume(h.durability);
  let requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result', requestId, text: reply,
    isGenerating: false, generationState: 'idle', completenessHint: 'complete'
  });
  h.advance(1300);
  await h.recovery.resume(h.durability);
  requestId = h.value().rooms[0].recovery.captureRequestId;
  h.recovery.handleEvent({
    type: 'capture_result', requestId, text: reply,
    isGenerating: false, generationState: 'idle', completenessHint: 'complete'
  });
  const room = h.value().rooms[0];
  assert.equal(room.messages.at(-1).text, 'Recovered control.');
  assert.equal(room.pendingProviderControlReceipt.action, 'status');
  assert.equal(room.pendingProviderControlReceipt.turnRequestId, 'dex-turn-1');
  assert.equal(room.pendingProviderControlReceipt.agentMessageId, 'recovered');
});


test('manual passive recovery resolution is exact-id, passive-only, and never replays', async () => {
  const h = harness();
  h.advance(MAX_RECOVERY_MS + 1);
  await h.recovery.resume(h.durability);

  let room = h.value().rooms[0];
  assert.ok(room.recovery?.passiveAt);

  const mismatch = h.recovery.resolvePassive({
    roomId: 'room-1', requestId: 'dex-turn-wrong', reason: 'manual handoff'
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'RECOVERY_REQUEST_MISMATCH');
  assert.ok(h.value().rooms[0].recovery);

  const sentBefore = h.sent.length;
  const resolved = h.recovery.resolvePassive({
    roomId: 'room-1', requestId: 'dex-turn-1', reason: 'manual handoff'
  });
  assert.equal(resolved.ok, true);
  room = h.value().rooms[0];
  assert.equal(room.recovery, undefined);
  assert.equal(room.relay.active, false);
  assert.equal(room.relay.waitingFor, null);
  assert.match(room.relay.lastStopReason, /Passive recovery resolved/);
  assert.equal(h.sent.length, sentBefore);
});
