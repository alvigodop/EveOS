const test = require('node:test');
const assert = require('node:assert/strict');
const {
  blockedResponse,
  createQualificationRoom,
  createQualificationRecoveryController,
  finalizeResult,
  parseArgs,
  providerUrl,
  settleProviderTarget
} = require('../scripts/live-qualification-support.js');
const { cleanPass, cleanupQualification } = require('../scripts/live-qualification-cleanup.js');

test('live qualification room carries explicit disposable run ownership metadata', () => {
  const provider = { id: 'muse', name: 'Muse', urlPrefixes: ['https://muse.ai/'] };
  const built = createQualificationRoom({
    runId: 'run-1',
    provider,
    target: { tabId: 42, url: 'https://muse.ai/?dex_qualification=run-1' },
    baselineText: 'old reply'
  });
  assert.equal(built.room.qualification.runId, 'run-1');
  assert.equal(built.room.qualification.disposable, true);
  assert.equal(built.room.qualification.purpose, 'live-self-qualification');
  assert.equal(built.room.members[0].binding.targetId, 42);
  assert.equal(built.room.relay.remaining, 1);
});

test('live qualification provider URL gets a run-unique marker', () => {
  const provider = { urlPrefixes: ['https://muse.ai/'] };
  const url = providerUrl(provider, 'run-1');
  assert.match(url, /^https:\/\/muse\.ai\//);
  assert.match(url, /dex_qualification=run-1/);
});

test('result schema distinguishes PASS, BLOCKED, and FAIL', () => {
  const pass = finalizeResult({
    targetResurrection: { status: 'PASS' },
    postDispatchRecovery: { status: 'PASS' },
    cleanup: { status: 'PASS' }
  });
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.ok, true);

  const blocked = finalizeResult({
    targetResurrection: { status: 'PASS' },
    postDispatchRecovery: { status: 'BLOCKED' },
    cleanup: { status: 'PASS' }
  });
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.ok, false);

  const failed = finalizeResult({
    targetResurrection: { status: 'PASS' },
    postDispatchRecovery: { status: 'PASS' },
    cleanup: { status: 'FAIL' }
  });
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.ok, false);
});

test('provider readiness and supervisor absence classify as BLOCKED', () => {
  assert.equal(blockedResponse({ code: 'QUALIFICATION_UNSUPERVISED' }), true);
  assert.equal(blockedResponse({ code: 'HOST_ACCESS_REQUIRED' }), true);
  assert.equal(blockedResponse({
    code: 'QUALIFICATION_FAILED',
    message: 'Muse adapter did not respond after injection.'
  }), true);
  assert.equal(blockedResponse({
    code: 'COMMAND_FAILED',
    message: 'Muse adapter did not respond after injection.'
  }), true);
  assert.equal(blockedResponse({ code: 'QUALIFICATION_RESTART_TIMEOUT' }), false);
});

test('cleanup PASS schema makes all safety invariants explicit', () => {
  assert.deepEqual(cleanPass(), {
    status: 'PASS',
    roomRemoved: true,
    qualificationTabsRemoved: true,
    permanentRoomsUntouched: true,
    previousTargetRestored: true,
    warmTargetPreserved: null,
    warmTargetUrlUnchanged: null,
    focusSteal: false
  });
});


test('cleanup treats a run that never acquired ownership as safely cleaned', async () => {
  let closed = 0;
  const result = await cleanupQualification({
    client: { close() { closed += 1; } },
    runId: 'run-never-owned', providerId: 'muse',
    beginAttempted: false, beginSucceeded: false, fingerprintBefore: null
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.qualificationTabsRemoved, true);
  assert.equal(closed, 1);
});

test('cleanup verifies permanent room fingerprint and prior-target restoration on success', async () => {
  const replies = [
    { ok: true, data: { tabId: 10 } },
    { ok: true, data: { roomFingerprint: 'same', previousTargetRestored: true } }
  ];
  const client = {
    isOpen: () => true,
    async rpc() { return replies.shift(); },
    close() {}
  };
  const result = await cleanupQualification({
    client, runId: 'run-success', providerId: 'muse',
    beginAttempted: true, beginSucceeded: true, fingerprintBefore: 'same'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.permanentRoomsUntouched, true);
  assert.equal(result.previousTargetRestored, true);
});

test('cleanup reports FAIL when ownership recovery fails after a run had begun', async () => {
  const client = {
    isOpen: () => true,
    async rpc() { return { ok: false, code: 'QUALIFICATION_NOT_OWNED', message: 'lost ownership' }; },
    close() {}
  };
  const result = await cleanupQualification({
    client, runId: 'run-lost', providerId: 'muse',
    beginAttempted: true, beginSucceeded: true, fingerprintBefore: 'same'
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.qualificationTabsRemoved, false);
});


test('live qualification gives cold provider tabs deterministic settlement time before close and after resurrection', async () => {
  const waits = [];
  assert.equal(await settleProviderTarget('initial', async (ms) => { waits.push(ms); }), 4000);
  assert.equal(await settleProviderTarget('replacement', async (ms) => { waits.push(ms); }), 8000);
  assert.deepEqual(waits, [4000, 8000]);
});


test('late authoritative provider final completes qualification recovery without capture polling', () => {
  const room = {
    id: 'qualification-room',
    members: [{ id: 'agent-1', name: 'ChatGPT Qualification' }],
    messages: [{ id: 'source-1', senderKind: 'user', senderId: null, text: 'Run qualification.' }],
    relay: { active: false, remaining: 0, waitingFor: null },
    recovery: {
      requestId: 'turn-late',
      memberId: 'agent-1',
      sourceMessageId: 'source-1',
      dispatched: true,
      captureRequestId: null,
      candidateText: null,
      candidateAt: 0
    }
  };
  const state = { rooms: [room] };
  const inserted = [];
  const controller = createQualificationRecoveryController({
    state,
    protocol: {
      parseAgentReply(text) { return { text }; }
    },
    send() { throw new Error('authoritative final should not require another capture'); },
    roomMessage(targetRoom, kind, id, name, text) {
      const message = { senderKind: kind, senderId: id, senderName: name, text };
      targetRoom.messages.push(message);
      inserted.push(message);
      return message;
    },
    stopRoom() {},
    uid: () => 'x'
  });

  const handled = controller.handleMessage({
    type: 'response_final',
    requestId: 'turn-late',
    text: 'Late authoritative final.'
  });

  assert.equal(handled, true);
  assert.equal(room.recovery, undefined);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].text, 'Late authoritative final.');
});

test('live qualification CLI exposes explicit warm recovery-target mode', () => {
  const parsed = parseArgs(['--provider', 'muse', '--recovery-target', 'warm']);
  assert.equal(parsed.providerId, 'muse');
  assert.equal(parsed.recoveryTarget, 'warm');
});

test('live qualification CLI accepts an explicit warm tab pin', () => {
  const parsed = parseArgs(['--provider', 'chatgpt', '--recovery-target', 'warm', '--warm-tab-id', '42']);
  assert.equal(parsed.providerId, 'chatgpt');
  assert.equal(parsed.recoveryTarget, 'warm');
  assert.equal(parsed.warmTabId, 42);
});

test('warm tab pins require warm mode and a positive numeric tab id', () => {
  assert.throws(
    () => parseArgs(['--warm-tab-id', '42']),
    (error) => error.code === 'QUALIFICATION_BAD_WARM_TARGET'
  );
  assert.throws(
    () => parseArgs(['--recovery-target', 'warm', '--warm-tab-id', 'nope']),
    (error) => error.code === 'QUALIFICATION_BAD_WARM_TARGET'
  );
});

test('live qualification CLI keeps disposable recovery as the backwards-compatible default', () => {
  const parsed = parseArgs(['--provider', 'muse']);
  assert.equal(parsed.recoveryTarget, 'disposable');
});

test('invalid recovery-target modes fail before destructive qualification begins', () => {
  assert.throws(
    () => parseArgs(['--recovery-target', 'guess']),
    (error) => error.code === 'QUALIFICATION_BAD_RECOVERY_TARGET'
  );
});

test('warm target discovery blockers classify as BLOCKED rather than destructive FAIL', () => {
  assert.equal(blockedResponse({ code: 'QUALIFICATION_WARM_TARGET_NOT_FOUND' }), true);
  assert.equal(blockedResponse({ code: 'QUALIFICATION_WARM_TARGET_NOT_READY' }), true);
  assert.equal(blockedResponse({ code: 'QUALIFICATION_WARM_TARGET_AMBIGUOUS' }), true);
  assert.equal(blockedResponse({ code: 'QUALIFICATION_WARM_TARGET_PIN_INVALID' }), true);
  assert.equal(blockedResponse({ code: 'QUALIFICATION_WARM_TARGET_PIN_NOT_READY' }), true);
  assert.equal(blockedResponse({ code: 'QUALIFICATION_WARM_TARGET_UNSUPPORTED' }), true);
});

test('cleanup validates warm target preservation, exact URL, and no focus steal when warm mode was used', async () => {
  const replies = [
    { ok: true, data: { tabId: 10, recoveryTarget: { tabId: 2, url: 'https://muse.ai/' } } },
    {
      ok: true,
      data: {
        roomFingerprint: 'same', previousTargetRestored: true,
        recoveryTargetUsed: true, warmTargetPreserved: true,
        warmTargetUrlUnchanged: true, focusSteal: false
      }
    }
  ];
  const client = {
    isOpen: () => true,
    async rpc() { return replies.shift(); },
    close() {}
  };
  const result = await cleanupQualification({
    client, runId: 'run-warm', providerId: 'muse',
    beginAttempted: true, beginSucceeded: true, fingerprintBefore: 'same'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.warmTargetPreserved, true);
  assert.equal(result.warmTargetUrlUnchanged, true);
  assert.equal(result.focusSteal, false);
});

test('cleanup fails if a used warm target navigated or disappeared', async () => {
  const replies = [
    { ok: true, data: { tabId: 10, recoveryTarget: { tabId: 2, url: 'https://muse.ai/' } } },
    {
      ok: true,
      data: {
        roomFingerprint: 'same', previousTargetRestored: true,
        recoveryTargetUsed: true, warmTargetPreserved: true,
        warmTargetUrlUnchanged: false, focusSteal: false
      }
    }
  ];
  const client = {
    isOpen: () => true,
    async rpc() { return replies.shift(); },
    close() {}
  };
  const result = await cleanupQualification({
    client, runId: 'run-warm-url-changed', providerId: 'muse',
    beginAttempted: true, beginSucceeded: true, fingerprintBefore: 'same'
  });
  assert.equal(result.status, 'FAIL');
});


test('provider qualification policy can override settlement windows without engine changes', async () => {
  const waits = [];
  const provider = { qualification: { settleMs: { initial: 1250, replacement: 2750 } } };
  assert.equal(await settleProviderTarget('initial', async (ms) => waits.push(ms), provider), 1250);
  assert.equal(await settleProviderTarget('replacement', async (ms) => waits.push(ms), provider), 2750);
  assert.deepEqual(waits, [1250, 2750]);
});


test('provider health blocks classify as environment BLOCKED conditions', () => {
  for (const code of [
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_CONVERSATION_LIMIT',
    'PROVIDER_AUTH_REQUIRED',
    'PROVIDER_UNAVAILABLE'
  ]) assert.equal(blockedResponse({ code }), true, code);
});
