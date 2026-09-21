const DEFAULT_TIMEOUT_MS = 180000;
const RECOVERY_TARGETS = new Set(['disposable', 'warm']);
const PROVIDER_SETTLE_MS = { initial: 4000, replacement: 8000 };

function providerUrl(provider, runId) {
  const base = new URL(provider.qualification?.urlPrefix || provider.urlPrefixes[0]);
  base.searchParams.set('dex_qualification', runId);
  return base.toString();
}

async function settleProviderTarget(stage, sleep, provider = null) {
  const override = Number(provider?.qualification?.settleMs?.[stage]);
  const ms = Number.isFinite(override) && override >= 0 ? override : PROVIDER_SETTLE_MS[stage];
  if (!Number.isFinite(ms)) throw new Error('Unknown qualification provider settlement stage: ' + stage);
  await sleep(ms);
  return ms;
}

function createQualificationRoom({ runId, provider, target, baselineText = '' }) {
  const createdAt = new Date().toISOString();
  const member = {
    id: 'qualification-agent-' + runId,
    name: provider.name + ' Qualification',
    relayEnabled: true,
    binding: {
      targetClassId: 'online-origin',
      targetId: target.tabId,
      providerId: provider.id,
      providerName: provider.name,
      title: provider.name + ' Qualification',
      url: target.url
    }
  };
  const messages = [];
  if (String(baselineText || '').trim()) {
    messages.push({
      id: 'qualification-baseline-' + runId,
      senderKind: 'agent',
      senderId: member.id,
      senderName: member.name,
      text: String(baselineText).trim(),
      at: createdAt
    });
  }
  const sourceMessage = {
    id: 'qualification-source-' + runId,
    senderKind: 'user',
    senderId: null,
    senderName: 'Qualification',
    text: 'Run deterministic live qualification ' + runId + '.',
    at: createdAt
  };
  messages.push(sourceMessage);
  const room = {
    id: 'qualification-room-' + runId,
    name: 'Dex Live Qualification',
    userName: 'Qualification',
    members: [member],
    messages,
    settings: { autoRelay: true, maxTurns: 1, contextMessages: 2 },
    relay: { active: true, remaining: 1, waitingFor: member.id, lastStopReason: 'Qualification' },
    qualification: { runId, disposable: true, createdAt, purpose: 'live-self-qualification' },
    createdAt,
    updatedAt: createdAt
  };
  return { room, member, sourceMessage };
}

function resultTemplate(runId, providerId) {
  return {
    ok: false,
    status: 'BLOCKED',
    runId,
    providerId,
    targetResurrection: { status: 'BLOCKED', reason: 'not run' },
    postDispatchRecovery: { status: 'BLOCKED', reason: 'not run' },
    cleanup: { status: 'BLOCKED', reason: 'not run' }
  };
}

function finalizeResult(result) {
  const statuses = [result.targetResurrection?.status, result.postDispatchRecovery?.status, result.cleanup?.status];
  result.status = statuses.includes('FAIL') ? 'FAIL' : statuses.every((status) => status === 'PASS') ? 'PASS' : 'BLOCKED';
  result.ok = result.status === 'PASS';
  return result;
}

function blockedResponse(response) {
  const code = String(response?.code || '');
  if ([
    'EXTENSION_OFFLINE',
    'QUALIFICATION_UNSUPERVISED',
    'HOST_ACCESS_REQUIRED',
    'QUALIFICATION_STORAGE_UNAVAILABLE',
    'QUALIFICATION_PROVIDER_MISMATCH',
    'QUALIFICATION_REUSED_UNOWNED_TAB',
    'QUALIFICATION_WARM_TARGET_NOT_FOUND',
    'QUALIFICATION_WARM_TARGET_NOT_READY',
    'QUALIFICATION_WARM_TARGET_AMBIGUOUS',
    'QUALIFICATION_WARM_TARGET_PIN_INVALID',
    'QUALIFICATION_WARM_TARGET_PIN_NOT_READY',
    'QUALIFICATION_WARM_TARGET_UNSUPPORTED',
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_CONVERSATION_LIMIT',
    'PROVIDER_AUTH_REQUIRED',
    'PROVIDER_UNAVAILABLE'
  ].includes(code)) return true;
  const message = String(response?.message || '');
  return ['QUALIFICATION_FAILED', 'COMMAND_FAILED'].includes(code)
    && /site access|permission|sign in|login|adapter|did not respond|provider unavailable/i.test(message);
}

class QualificationStop extends Error {
  constructor(status, response, fallback) {
    super(response?.message || fallback);
    this.status = status;
    this.code = response?.code || 'QUALIFICATION_FAILED';
  }
}

function requireOk(response, fallback) {
  if (response?.ok) return response;
  throw new QualificationStop(blockedResponse(response) ? 'BLOCKED' : 'FAIL', response, fallback);
}

function parseArgs(argv = process.argv.slice(2)) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  const providerId = value('--provider') || 'muse';
  const timeout = Number(value('--timeout-ms') || DEFAULT_TIMEOUT_MS);
  const recoveryTarget = String(value('--recovery-target') || 'disposable').trim().toLowerCase();
  const warmTabRaw = value('--warm-tab-id');
  const warmTabId = warmTabRaw == null ? null : Number(warmTabRaw);
  if (!RECOVERY_TARGETS.has(recoveryTarget)) {
    throw Object.assign(new Error('--recovery-target must be "disposable" or "warm".'), { code: 'QUALIFICATION_BAD_RECOVERY_TARGET' });
  }
  if (warmTabRaw != null && (!Number.isInteger(warmTabId) || warmTabId <= 0)) {
    throw Object.assign(new Error('--warm-tab-id must be a positive numeric browser tab id.'), { code: 'QUALIFICATION_BAD_WARM_TARGET' });
  }
  if (warmTabId != null && recoveryTarget !== 'warm') {
    throw Object.assign(new Error('--warm-tab-id requires --recovery-target warm.'), { code: 'QUALIFICATION_BAD_WARM_TARGET' });
  }
  return {
    providerId,
    recoveryTarget,
    warmTabId,
    timeoutMs: Math.max(30000, Math.min(11 * 60 * 1000, Number.isFinite(timeout) ? timeout : DEFAULT_TIMEOUT_MS))
  };
}

function createQualificationRecoveryController({
  state, protocol, send, roomMessage, stopRoom, uid
}) {
  let retryTimer = null;
  const RETRY_MS = 2500;
  const STABLE_MS = 1200;

  function pendingRoom() {
    return (state.rooms || []).find((room) => room?.recovery) || null;
  }

  function priorReply(room, member, sourceMessageId) {
    const messages = Array.isArray(room?.messages) ? room.messages : [];
    const sourceIndex = messages.findIndex((message) => message.id === sourceMessageId);
    const before = sourceIndex >= 0 ? messages.slice(0, sourceIndex + 1) : messages;
    return [...before].reverse().find((message) =>
      message.senderKind === 'agent' && message.senderId === member?.id
    ) || null;
  }

  function begin(turn) {
    if (!turn?.room || !turn?.member || !turn?.sourceMessage) return;
    const binding = turn.member.binding || {};
    turn.room.recovery = {
      requestId: turn.requestId,
      memberId: turn.member.id,
      sourceMessageId: turn.sourceMessage.id,
      targetClassId: binding.targetClassId || 'online-origin',
      providerId: binding.providerId || null,
      relayActive: !!turn.room.relay?.active,
      relayRemaining: Number(turn.room.relay?.remaining || 0),
      dispatched: false,
      startedAt: new Date().toISOString(),
      interruptedAt: null,
      captureRequestId: null,
      candidateText: null,
      candidateAt: 0,
      ledgerQueryId: null
    };
  }

  function interrupt(turn) {
    const recovery = turn?.room?.recovery;
    if (!recovery) return;
    recovery.interruptedAt = new Date().toISOString();
    recovery.captureRequestId = null;
    recovery.candidateText = null;
    recovery.candidateAt = 0;
  }

  function schedule(delay = RETRY_MS) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => maybeRecover(), delay);
  }

  function capture(room, member) {
    const recovery = room.recovery;
    if (!recovery) return false;
    const requestId = `dex-recover-${uid('turn')}`;
    recovery.captureRequestId = requestId;
    send({ type: 'capture_latest', requestId });
    return true;
  }

  function maybeRecover() {
    const room = pendingRoom();
    const recovery = room?.recovery;
    if (!room || !recovery) return false;
    const member = (room.members || []).find((entry) => entry.id === recovery.memberId);
    if (!member) return false;

    if (!recovery.dispatched) {
      recovery.ledgerQueryId = `dex-query-${uid('turn')}`;
      send({ type: 'turn_ledger_query', requestId: recovery.ledgerQueryId, turnRequestId: recovery.requestId });
      return true;
    }
    return capture(room, member);
  }

  function finish(room, recovery, text) {
    const member = (room.members || []).find((entry) => entry.id === recovery.memberId);
    if (!member) return false;
    const parsed = protocol.parseAgentReply(text);
    const body = String(parsed.text || '').replace(/\r\n?/g, '\n').trim();
    if (!body) {
      recovery.captureRequestId = null;
      schedule();
      return false;
    }
    const prior = priorReply(room, member, recovery.sourceMessageId);
    if (prior && String(prior.text || '').replace(/\r\n?/g, '\n').trim() === body) {
      recovery.captureRequestId = null;
      recovery.candidateText = null;
      recovery.candidateAt = 0;
      schedule();
      return false;
    }
    const now = Date.now();
    if (recovery.candidateText !== body || !recovery.candidateAt) {
      recovery.candidateText = body;
      recovery.candidateAt = now;
      recovery.captureRequestId = null;
      schedule(1400);
      return false;
    }
    if (now - recovery.candidateAt < STABLE_MS) {
      recovery.captureRequestId = null;
      schedule(1400);
      return false;
    }
    delete room.recovery;
    roomMessage(room, 'agent', member.id, member.name, body);
    return true;
  }

  function handleMessage(msg) {
    const room = pendingRoom();
    const recovery = room?.recovery;
    if (!recovery) return false;

    if (msg?.type === 'response_final' && msg.requestId === recovery.requestId) {
      const member = (room.members || []).find((entry) => entry.id === recovery.memberId);
      const parsed = protocol.parseAgentReply(msg.text || '');
      const body = String(parsed.text || '').replace(/\r\n?/g, '\n').trim();
      if (!member || !body) return false;
      delete room.recovery;
      roomMessage(room, 'agent', member.id, member.name, body);
      return true;
    }

    if (msg?.type === 'turn_ledger_result' && msg.requestId === recovery.ledgerQueryId) {
      recovery.ledgerQueryId = null;
      recovery.dispatched = true;
      schedule(0);
      return true;
    }

    if (!msg?.requestId || msg.requestId !== recovery.captureRequestId) return false;
    if (msg.type === 'capture_result') {
      recovery.captureRequestId = null;
      finish(room, recovery, msg.text || '');
      return true;
    }
    if (msg.type === 'error') {
      recovery.captureRequestId = null;
      schedule();
      return true;
    }
    return false;
  }

  return { begin, interrupt, maybeRecover, handleMessage };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  RECOVERY_TARGETS,
  PROVIDER_SETTLE_MS,
  QualificationStop,
  blockedResponse,
  createQualificationRoom,
  createQualificationRecoveryController,
  finalizeResult,
  parseArgs,
  providerUrl,
  settleProviderTarget,
  requireOk,
  resultTemplate
};
