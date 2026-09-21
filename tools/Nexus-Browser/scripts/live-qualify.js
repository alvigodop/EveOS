const { randomUUID } = require('node:crypto');
const { getProvider } = require('../extension/providers.js');
const protocol = require('../public/dex-protocol.js');
const { QualificationClient, delay, diagnostics, waitForRestart, withTimeout } = require('./live-qualification-client.js');
const { cleanupQualification } = require('./live-qualification-cleanup.js');
const {
  QualificationStop,
  blockedResponse,
  createQualificationRoom,
  createQualificationRecoveryController,
  finalizeResult,
  parseArgs,
  providerUrl,
  requireOk,
  resultTemplate,
  settleProviderTarget
} = require('./live-qualification-support.js');

async function runQualification({ providerId = 'muse', timeoutMs, recoveryTarget = 'disposable', warmTabId = null } = {}) {
  const runId = randomUUID();
  const result = resultTemplate(runId, providerId);
  const recoveryTargetMode = recoveryTarget === 'warm' ? 'preexisting-warm' : 'disposable-background';
  result.postDispatchRecovery = { ...result.postDispatchRecovery, targetMode: recoveryTargetMode };
  const provider = getProvider(providerId);
  let client = null;
  let room = null;
  let fingerprintBefore = null;
  let beginAttempted = false;
  let beginSucceeded = false;
  let currentStage = 'targetResurrection';

  if (!provider || !provider.capabilities?.chat || !provider.capabilities?.captureLatest
    || provider.qualification?.live !== true || provider.qualification?.exactOnce !== true
    || (recoveryTarget === 'warm' && provider.qualification?.warmRecovery !== true)) {
    result.targetResurrection = { status: 'BLOCKED', reason: 'Provider has not opted into the requested live exact-once qualification contract.' };
    result.cleanup = {
      status: 'PASS', roomRemoved: true, qualificationTabsRemoved: true,
      permanentRoomsUntouched: true, previousTargetRestored: true
    };
    return finalizeResult(result);
  }

  const requestedUrl = providerUrl(provider, runId);

  try {
    const before = await diagnostics();
    if (!before.extensionConnected) {
      throw new QualificationStop('BLOCKED', { code: 'EXTENSION_OFFLINE', message: 'Browser extension is not connected.' });
    }

    client = await new QualificationClient().connect();
    beginAttempted = true;
    const opened = requireOk(await client.rpc({
      type: 'qualification_begin', runId, providerId, url: requestedUrl
    }, 30000), 'Could not create the qualification target.');
    beginSucceeded = true;
    const owned = opened.data;

    const fingerprint = requireOk(await client.rpc({
      type: 'qualification_state_fingerprint', runId
    }), 'Could not snapshot permanent Dex room state.');
    fingerprintBefore = fingerprint.data?.roomFingerprint || null;

    await settleProviderTarget('initial', delay, provider);

    const closed = requireOk(await client.rpc({
      type: 'qualification_close_target', runId, providerId,
      tabId: owned.tabId, url: owned.url
    }), 'Owned qualification target could not be closed safely.');

    const ensured = requireOk(await client.rpc({
      type: 'qualification_ensure_target', runId
    }, 30000), 'Production target resurrection did not recreate the qualification target.');
    const replacement = ensured.data;

    const exactUrl = replacement.url === owned.url;
    const providerMatch = replacement.providerId === providerId;
    const focusSteal = Number(owned.foregroundBefore) !== Number(closed.data?.foregroundAfter)
      || Number(owned.foregroundBefore) !== Number(replacement.foregroundNow);
    const targetPass = Number(owned.tabId) !== Number(replacement.tabId)
      && replacement.created === true
      && replacement.backgroundOnly === true
      && owned.createdActive === false
      && exactUrl
      && providerMatch
      && !focusSteal
      && Number(closed.data?.unrelatedTabsMissing || 0) === 0;

    result.targetResurrection = {
      status: targetPass ? 'PASS' : 'FAIL',
      targetMode: 'disposable-background',
      originalTabId: owned.tabId,
      replacementTabId: replacement.tabId,
      exactUrl,
      providerMatch,
      backgroundOnly: replacement.backgroundOnly === true && owned.createdActive === false,
      focusSteal,
      unrelatedTabsTouched: Number(closed.data?.unrelatedTabsMissing || 0)
    };

    if (!targetPass) {
      throw new QualificationStop('FAIL', {
        code: 'QUALIFICATION_TARGET_ASSERTION_FAILED',
        message: 'Target resurrection invariants did not all pass.'
      });
    }

    currentStage = 'postDispatchRecovery';
    let recoveryTargetData = replacement;
    if (recoveryTarget === 'warm') {
      const warm = requireOk(await client.rpc({
        type: 'qualification_select_recovery_target', runId, providerId,
        ...(warmTabId != null ? { tabId: warmTabId } : {})
      }, 20000), 'No safe pre-existing warm provider target is available for recovery qualification.');
      recoveryTargetData = warm.data;
      if (recoveryTargetData?.targetMode !== 'preexisting-warm'
        || recoveryTargetData?.focusSteal !== false || recoveryTargetData?.exactUrl !== true) {
        throw new QualificationStop('FAIL', {
          code: 'QUALIFICATION_WARM_TARGET_ASSERTION_FAILED',
          message: 'Warm recovery target selection did not preserve target/focus invariants.'
        });
      }
    } else {
      await settleProviderTarget('replacement', delay, provider);
    }

    const baselineRequestId = 'qualification-baseline-' + runId;
    const baseline = await client.requestEvent(
      { type: 'qualification_capture_latest', runId, requestId: baselineRequestId },
      (msg) => msg.type === 'capture_result' || msg.type === 'error',
      20000
    );
    if (baseline.type === 'error') {
      throw new QualificationStop(blockedResponse(baseline) ? 'BLOCKED' : 'FAIL', baseline, 'Provider capture preflight failed.');
    }

    const built = createQualificationRoom({ runId, provider, target: recoveryTargetData, baselineText: baseline.text || '' });
    room = built.room;
    const target = {
      id: recoveryTargetData.tabId, providerId, providerName: provider.name,
      url: recoveryTargetData.url, targetClassId: 'online-origin'
    };
    const state = { turn: null, rooms: [room], queue: [], tabs: [target], onlineTarget: target, localTargets: [] };

    room.relay.remaining -= 1;
    const turnRequestId = 'qualification-turn-' + runId;
    const turn = {
      room, member: built.member, sourceMessage: built.sourceMessage,
      requestId: turnRequestId, prompt: 'QUALIFY_' + runId
    };
    state.turn = turn;

    let replyInsertions = 0;
    let recoveryCaptures = 0;
    let unexpectedEnqueues = 0;
    let currentClient = client;
    let recoveredResolve;
    const recovered = new Promise((resolve) => { recoveredResolve = resolve; });
    let uidSeq = 0;

    const controller = createQualificationRecoveryController({
      state,
      protocol,
      send(payload) {
        if (!currentClient?.isOpen()) return false;
        if (payload.type === 'turn_ledger_query') {
          return currentClient.send({
            type: 'qualification_ledger_query', runId,
            requestId: payload.requestId, turnRequestId: payload.turnRequestId
          });
        }
        if (payload.type === 'capture_latest') {
          recoveryCaptures += 1;
          return currentClient.send({
            type: 'qualification_capture_latest', runId, requestId: payload.requestId
          });
        }
        if (payload.type === 'record_incident') return true;
        return false;
      },
      resolveOnline: () => state.onlineTarget,
      resolveLocal: () => null,
      persist() {},
      renderAll() {},
      log() {},
      roomMessage(targetRoom, kind, id, name, text) {
        const message = {
          id: 'qualification-reply-' + (++uidSeq), senderKind: kind,
          senderId: id, senderName: name, text, at: new Date().toISOString()
        };
        targetRoom.messages.push(message);
        if (kind === 'agent') { replyInsertions += 1; recoveredResolve(message); }
        return message;
      },
      stopRoom(targetRoom, reason) {
        targetRoom.relay.active = false;
        targetRoom.relay.remaining = 0;
        targetRoom.relay.waitingFor = null;
        targetRoom.relay.lastStopReason = reason;
      },
      enqueueNext() { unexpectedEnqueues += 1; },
      processQueue() {},
      markPending() {},
      uid: () => 'qualification-' + (++uidSeq)
    });

    controller.begin(turn);
    const armed = requireOk(await client.rpc({
      type: 'qualification_arm_restart', runId, turnRequestId
    }), 'Supervisor restart hook could not be armed.');
    if (!armed.data?.turnRequestId) {
      throw new QualificationStop('FAIL', {
        code: 'QUALIFICATION_RESTART_ARM_INVALID',
        message: 'Restart arm did not echo the turn request id.'
      });
    }

    const oldSessionId = client.sessionId;
    let settleProviderOutcome;
    const providerOutcome = new Promise((resolve) => { settleProviderOutcome = resolve; });
    const stopWatchingProvider = client.onMessage((msg) => {
      if (msg?.type === 'error' && msg.requestId === turnRequestId) settleProviderOutcome({ error: msg });
    });
    client.waitForClose(15000).then(
      () => settleProviderOutcome({ closed: true }),
      (error) => settleProviderOutcome({ timeout: error })
    );
    requireOk(await client.rpc({
      type: 'qualification_send_prompt', runId, turnRequestId, text: turn.prompt
    }), 'Qualification prompt did not cross the durable dispatch boundary.');

    const providerResult = await providerOutcome;
    stopWatchingProvider();
    if (providerResult.error) {
      throw new QualificationStop(
        blockedResponse(providerResult.error) ? 'BLOCKED' : 'FAIL',
        providerResult.error,
        'Qualification provider rejected the disposable prompt before restart.'
      );
    }
    if (providerResult.timeout) throw providerResult.timeout;
    controller.interrupt(turn);
    state.turn = null;
    state.queue.length = 0;
    currentClient = null;

    const restarted = await waitForRestart(oldSessionId, 30000);
    client = await new QualificationClient().connect();
    currentClient = client;
    const resumed = requireOk(await client.rpc({
      type: 'qualification_resume', runId, providerId
    }, 20000), 'Qualification ownership could not be resumed after restart.');

    const resumedTarget = recoveryTarget === 'warm' ? resumed.data?.recoveryTarget : resumed.data;
    if (!resumedTarget?.tabId || !resumedTarget?.url) {
      throw new QualificationStop('FAIL', {
        code: 'QUALIFICATION_RECOVERY_TARGET_LOST',
        message: 'Authorized recovery target was not preserved across the supervised restart.'
      });
    }
    state.onlineTarget = {
      id: resumedTarget.tabId, providerId, providerName: provider.name,
      url: resumedTarget.url, targetClassId: 'online-origin'
    };
    state.tabs = [state.onlineTarget];

    client.onMessage((msg) => controller.handleMessage(msg));
    controller.maybeRecover();
    await withTimeout(recovered, timeoutMs, 'Capture-without-resend recovery');

    const ledgerRequestId = 'qualification-ledger-final-' + runId;
    const ledger = await client.requestEvent(
      { type: 'qualification_ledger_query', runId, requestId: ledgerRequestId, turnRequestId },
      (msg) => msg.type === 'turn_ledger_result' || msg.type === 'error',
      12000
    );
    if (ledger.type === 'error') {
      throw new QualificationStop('FAIL', ledger, 'Could not inspect the durable turn ledger.');
    }

    const inspected = requireOk(await client.rpc({
      type: 'qualification_inspect', runId
    }), 'Could not inspect qualification prompt counters.');

    const dispatchAttempts = Number(ledger.entry?.dispatchAttempts || 0);
    const promptSubmissions = Number(inspected.data?.promptSubmissions || 0);
    const duplicateDispatches = Math.max(0, promptSubmissions - 1);
    const budgetDoubleDecrement = room.relay.remaining < 0 || unexpectedEnqueues > 0;
    const postPass = restarted.serverSessionId !== oldSessionId
      && dispatchAttempts === 1
      && promptSubmissions === 1
      && recoveryCaptures > 0
      && replyInsertions === 1
      && duplicateDispatches === 0
      && !budgetDoubleDecrement;

    result.postDispatchRecovery = {
      status: postPass ? 'PASS' : 'FAIL',
      targetMode: recoveryTargetMode,
      targetTabId: Number(recoveryTargetData.tabId),
      targetUrl: recoveryTargetData.url,
      qualificationMarkerSent: promptSubmissions === 1,
      requestId: turnRequestId,
      serverSessionChanged: restarted.serverSessionId !== oldSessionId,
      dispatchAttempts,
      promptSubmissions,
      captureRecovery: recoveryCaptures > 0 && replyInsertions === 1,
      replyInsertions,
      duplicateDispatches,
      relayBudgetDoubleDecrement: budgetDoubleDecrement
    };

    if (!postPass) {
      throw new QualificationStop('FAIL', {
        code: 'QUALIFICATION_RECOVERY_ASSERTION_FAILED',
        message: 'Post-dispatch recovery invariants did not all pass.'
      });
    }
  } catch (error) {
    const status = error instanceof QualificationStop ? error.status : 'FAIL';
    const section = result[currentStage];
    if (section?.status !== 'PASS') {
      result[currentStage] = {
        ...section, status, reason: error.message,
        code: error.code || 'QUALIFICATION_FAILED'
      };
    }
    result.reason = error.message;
    result.code = error.code || 'QUALIFICATION_FAILED';
  } finally {
    if (room) {
      room.qualification = { ...room.qualification, removedAt: new Date().toISOString() };
      room = null;
    }
    result.cleanup = await cleanupQualification({
      client, runId, providerId, beginAttempted, beginSucceeded, fingerprintBefore
    });
  }

  return finalizeResult(result);
}

async function main() {
  const result = await runQualification(parseArgs());
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'BLOCKED' ? 2 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(JSON.stringify({
      ok: false, status: 'FAIL',
      code: error.code || 'QUALIFICATION_FATAL',
      reason: error.message
    }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { runQualification };
