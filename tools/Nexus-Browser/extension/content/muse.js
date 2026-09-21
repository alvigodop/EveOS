(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeMuseLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeMuseLoaded = true;

  const input = globalThis.BrowserAiBridgeMuseInput
    || (typeof module !== 'undefined' && module.exports ? require('./muse-input.js') : null);
  const answer = globalThis.BrowserAiBridgeMuseAnswer
    || (typeof module !== 'undefined' && module.exports ? require('./muse-answer.js') : null);
  const promptDelivery = globalThis.BrowserAiBridgePromptDelivery
    || (typeof module !== 'undefined' && module.exports ? require('./prompt-delivery.js') : null);

  if (!input || !answer || !promptDelivery) throw new Error('Muse bridge modules were not loaded in the expected order.');

  const active = new Map();
  const GENERATION_HEARTBEAT_MS = 15000;
  const RELIABLE_GENERATION_SETTLE_MS = 1500;
  const COMPLETE_NO_SIGNAL_SETTLE_MS = 5000;
  const NO_SIGNAL_SETTLE_MS = 15000;
  const DEX_RELAY_PREFIX = '[DEX ROOM RELAY]';

  function isDexRelayPrompt(value) {
    return String(value || '').trimStart().startsWith(DEX_RELAY_PREFIX);
  }

  function asyncProgressText(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 1200 || /\[\[DEX:(?:DONE|USER|NOTE)\]\]$/i.test(text)) return false;
    const activeWork = /\b(?:still\s+)?(?:running|working|underway|in progress|in flight|processing|building|researching|verifying|executing|active)\b/i.test(text);
    const explicitNonFinal = /^(?:progress|status|update)\s*\((?:not\s+final|in[- ]progress)\)\s*:/i.test(text)
      || /\b(?:not\s+(?:the\s+)?final|no\s+final\s+(?:audit|answer|report|result)\s+yet)\b/i.test(text);
    const laterResult = /\b(?:i(?:'|’)ll|i will|will)\s+(?:return|report|send|provide|follow up|respond)\b/i.test(text)
      || /\bwhen\s+(?:it|the\b.{0,60})\s+(?:lands|finishes|completes|is done|is ready)\b/i.test(text);
    return activeWork && (explicitNonFinal || laterResult);
  }

  function looksCompleteAssistantText(value) {
    const text = String(value || '').trim();
    if (!text || asyncProgressText(text)) return false;
    if (/\[\[DEX:(?:DONE|USER|NOTE)\]\]$/i.test(text)) return true;
    return /[.!?…\)\]\}"'\`]$/.test(text);
  }

  function emit(payload) {
    try { chrome.runtime.sendMessage(payload); } catch {}
  }

  function stopWatcher(requestId) {
    const watcher = active.get(requestId);
    if (!watcher) return;
    watcher.observer?.disconnect();
    clearInterval(watcher.timer);
    clearTimeout(watcher.timeout);
    active.delete(requestId);
  }

  function reportGenerationActivity(watcher, requestId, isGenerating, force = false) {
    const stamp = Date.now();
    const state = isGenerating ? 'active' : 'idle';
    if (isGenerating) {
      if (!force && watcher.lastGenerationState === 'active'
          && stamp - watcher.lastHeartbeatAt < GENERATION_HEARTBEAT_MS) return;
    } else if (!force && watcher.lastGenerationState !== 'active') {
      return;
    }
    watcher.lastGenerationState = state;
    watcher.lastHeartbeatAt = stamp;
    emit({ type: 'response_activity', requestId, isGenerating, generationState: state, observedAt: stamp });
  }

  function watchResponse(requestId, baseline) {
    const watcher = {
      baselineCount: baseline.count,
      baselineText: baseline.text,
      lastText: '',
      lastChangedAt: Date.now(),
      started: false,
      sawGenerating: false,
      generatingEndedAt: 0,
      lastHeartbeatAt: 0,
      lastGenerationState: 'unknown',
      holdAsyncProgress: !!baseline.holdAsyncProgress,
      observer: null,
      timer: null,
      timeout: null
    };

    function finalize() {
      const finalText = answer.getTurnAssistantText(answer.assistantNodes(), watcher.baselineCount) || watcher.lastText;
      const observedAt = Date.now(); emit({ type: 'response_final', requestId, text: finalText, observedAt, detail: { adapterSettleMs: Math.max(0, observedAt - (watcher.generatingEndedAt || watcher.lastChangedAt)), stableForMs: Math.max(0, observedAt - watcher.lastChangedAt), reliableGeneration: watcher.sawGenerating } });
      stopWatcher(requestId);
    }

    function sample() {
      const nativeGenerating = input.generationLooksActive();
      const nodes = answer.assistantNodes();
      const text = nodes.length ? answer.getTurnAssistantText(nodes, watcher.baselineCount) : '';
      const deferredProgress = watcher.holdAsyncProgress && asyncProgressText(text);
      const isGenerating = nativeGenerating || deferredProgress;
      reportGenerationActivity(watcher, requestId, isGenerating);
      if (isGenerating) {
        watcher.sawGenerating = true;
        watcher.generatingEndedAt = 0;
      } else if (watcher.sawGenerating && !watcher.generatingEndedAt) {
        watcher.generatingEndedAt = Date.now();
        reportGenerationActivity(watcher, requestId, false, true);
      }

      if (!nodes.length) return;
      const isNewNode = nodes.length > watcher.baselineCount;
      const changedExisting = text && text !== watcher.baselineText;
      if (!isNewNode && !changedExisting && !watcher.started) return;
      if (!text) return;

      watcher.started = true;
      if (text !== watcher.lastText) {
        watcher.lastText = text;
        watcher.lastChangedAt = Date.now();
        emit({ type: 'response_partial', requestId, text });
        return;
      }

      if (isGenerating) return;
      const now = Date.now();
      const stableFor = now - watcher.lastChangedAt;
      if (watcher.sawGenerating) {
        if (watcher.generatingEndedAt && now - watcher.generatingEndedAt >= RELIABLE_GENERATION_SETTLE_MS && stableFor >= RELIABLE_GENERATION_SETTLE_MS) finalize();
        return;
      }
      const settleMs = looksCompleteAssistantText(watcher.lastText) ? COMPLETE_NO_SIGNAL_SETTLE_MS : NO_SIGNAL_SETTLE_MS;
      if (stableFor >= settleMs) finalize();
    }

    watcher.observer = new MutationObserver(sample);
    watcher.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-busy', 'data-testid', 'data-state']
    });
    watcher.timer = setInterval(sample, 400);
    watcher.timeout = null;
    active.set(requestId, watcher);
  }

  function dispatchComposerEnter(composer) {
    const keyOptions = {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true
    };
    composer.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
    composer.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
    composer.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
  }

  async function waitForComposer({
    findComposer = input.findComposer,
    timeoutMs = 1600,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const composer = findComposer();
      if (composer) return composer;
      await sleep(80);
    }
    return findComposer();
  }

  async function resolveComposer({
    findComposer = input.findComposer,
    findChatEntryControl = input.findChatEntryControl,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    let composer = await waitForComposer({ findComposer, timeoutMs: 1400, sleep });
    if (composer) return composer;
    const chatControl = findChatEntryControl?.();
    if (!chatControl || typeof chatControl.click !== 'function') return null;
    chatControl.click();
    composer = await waitForComposer({ findComposer, timeoutMs: 7000, sleep });
    return composer || null;
  }

  async function waitForComposerText(composer, text, timeoutMs = 1200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (input.composerContainsText(composer, text)) return true;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return input.composerContainsText(composer, text);
  }

  function promptCommitted(text, baselineCount, root = document) {
    const wanted = answer.normalizeText(text);
    if (!wanted) return false;
    const nodes = answer.userNodes(root);
    if (nodes.length <= baselineCount) return false;
    const committed = answer.normalizeText(answer.getTurnUserText(nodes, baselineCount));
    return committed.includes(wanted);
  }

  function commitmentDiagnostics(text, baselineCount, composer, root = document) {
    const wanted = answer.normalizeText(text), users = answer.userNodes(root);
    let match = null;
    try {
      match = [...root.querySelectorAll('div,article,section,p,span')]
        .find((node) => answer.normalizeText(node.innerText || node.textContent || '') === wanted) || null;
    } catch {}
    return {
      baselineUserNodes: baselineCount, currentUserNodes: users.length,
      composerRetainedPrompt: !!composer && input.composerContainsText(composer, text),
      url: typeof location !== 'undefined' ? String(location.href || '') : '',
      exactDomMatch: match ? { tag: String(match.tagName || '').toLowerCase(), role: answer.roleValue(match), testId: String(match.getAttribute?.('data-testid') || '').slice(0, 80), className: String(match.className || '').replace(/\s+/g, ' ').trim().slice(0, 120) } : null
    };
  }

  async function waitForPromptDeparture(composer, text, timeoutMs = 6000, isCommitted = null) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!input.composerContainsText(composer, text) || isCommitted?.()) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return !input.composerContainsText(composer, text) || !!isCommitted?.();
  }

  function requestComposerSubmit(composer) {
    const form = composer?.closest?.('form');
    if (!form || typeof form.requestSubmit !== 'function') return false;
    try {
      form.requestSubmit();
      return true;
    } catch {
      return false;
    }
  }

  async function submitComposer(composer, text, sendControl, {
    isCommitted = null,
    exactOnce = false,
    deliveryState = null,
    commitTimeoutMs = 12000
  } = {}) {
    const state = deliveryState || promptDelivery.create({ text });
    promptDelivery.markSeeded(state, input.composerContainsText(composer, text));

    let method = null;
    let submit = null;
    if (sendControl) {
      method = 'click';
      submit = () => sendControl.click();
    } else if (exactOnce) {
      throw new Error('Muse qualification has no enabled send control; refusing fallback submission to preserve exactly-once delivery.');
    } else {
      const form = composer?.closest?.('form');
      if (form && typeof form.requestSubmit === 'function') {
        method = 'requestSubmit';
        submit = () => form.requestSubmit();
      } else {
        method = 'enter';
        submit = () => dispatchComposerEnter(composer);
      }
    }

    promptDelivery.attemptOnce(state, method, submit);
    await promptDelivery.verifyCommitted(state, {
      isCommitted,
      composer,
      composerContainsText: input.composerContainsText,
      timeoutMs: commitTimeoutMs
    });
    return method;
  }

  async function recoverQualificationComposer(composer, text, {
    findComposer = input.findComposer,
    findChatEntryControl = input.findChatEntryControl,
    findSendControl = input.findSendControl,
    setComposerText = input.setComposerText,
    composerContainsText = input.composerContainsText,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 60
  } = {}) {
    const chatControl = findChatEntryControl?.();
    if (chatControl && typeof chatControl.click === 'function') chatControl.click();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const latest = findComposer?.();
      if (latest) composer = latest;
      if (composer && !composerContainsText(composer, text)) setComposerText(composer, text);
      const sendControl = composer ? findSendControl(composer) : null;
      if (sendControl) return { composer, sendControl };
      await sleep(150);
    }
    return { composer, sendControl: null };
  }

  function managedWorkerReady({
    findComposer = input.findComposer,
    findSendControl = input.findSendControl,
    isPrehydrationComposer = input.isPrehydrationComposer,
    isUnsafeSendControl = input.isUnsafeSendControl
  } = {}) {
    const composer = findComposer?.();
    if (!composer) return { ready: false, reason: 'composer-missing' };
    if (isPrehydrationComposer?.(composer)) return { ready: false, reason: 'composer-prehydration' };
    const sendControl = findSendControl?.(composer, { allowDisabled: true });
    if (!sendControl) return { ready: false, reason: 'send-control-missing' };
    if (isUnsafeSendControl?.(sendControl)) return { ready: false, reason: 'send-control-unsafe' };
    return { ready: true, reason: 'ready' };
  }

  async function submitPrompt(requestId, text, { qualification = null } = {}) {
    const exactOnce = qualification?.exactOnce === true;
    if (qualification?.runId && !exactOnce) throw new Error('Muse qualification requires the explicit exact-once adapter contract.');
    let composer = await resolveComposer();
    if (!composer) throw new Error('Muse composer was not found after attempting to open the headed Chat view. Sign in to Muse and verify Chat is available.');

    let beforeNodes = answer.assistantNodes();
    let userBaselineCount = answer.userNodes().length;
    let baseline = {
      count: beforeNodes.length,
      text: answer.getTurnAssistantText(beforeNodes, beforeNodes.length),
      holdAsyncProgress: isDexRelayPrompt(text)
    };

    let sendControl = null;
    const deliveryState = promptDelivery.create({ requestId, text });
    input.setComposerText(composer, text);
    if (!(await waitForComposerText(composer, text))) {
      throw new Error('Muse composer did not retain the prompt text after insertion.');
    }
    promptDelivery.markSeeded(deliveryState, true);

    const started = Date.now();
    while (Date.now() - started < (exactOnce ? 1500 : 6000)) {
      const latestComposer = input.findComposer();
      if (latestComposer && latestComposer !== composer) {
        composer = latestComposer;
        if (!input.composerContainsText(composer, text)) input.setComposerText(composer, text);
      }
      sendControl = input.findSendControl(composer);
      if (sendControl) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (exactOnce && !sendControl) {
      const recovered = await recoverQualificationComposer(composer, text);
      composer = recovered.composer;
      sendControl = recovered.sendControl;
      beforeNodes = answer.assistantNodes();
      userBaselineCount = answer.userNodes().length;
      baseline = {
        count: beforeNodes.length,
        text: answer.getTurnAssistantText(beforeNodes, beforeNodes.length),
        holdAsyncProgress: isDexRelayPrompt(text)
      };
    }

    await new Promise((resolve) => setTimeout(resolve, exactOnce ? 750 : 250));
    if (exactOnce) {
      const refreshed = await recoverQualificationComposer(composer, text, { findChatEntryControl: () => null, attempts: 12 });
      composer = refreshed.composer;
      sendControl = refreshed.sendControl;
    }
    if (sendControl && input.isUnsafeSendControl(sendControl)) throw new Error('Refusing to click a Muse approval, purchase, voice, upload, or other unsafe control as the send button.');
    if (exactOnce && !sendControl) throw new Error('Muse qualification send control stayed disabled after the hydrated composer received the prompt.');
    watchResponse(requestId, baseline);
    try {
      return await submitComposer(composer, text, sendControl, {
        isCommitted: () => promptCommitted(text, userBaselineCount), exactOnce, deliveryState
      });
    } catch (error) {
      if (error?.code === 'PROMPT_DELIVERY_UNCOMMITTED') {
        const e = commitmentDiagnostics(text, userBaselineCount, composer);
        error.detail = { ...(error.detail || {}), commitmentEvidence: e };
        error.message += ` Muse evidence: users ${e.baselineUserNodes}->${e.currentUserNodes}; composerRetained=${e.composerRetainedPrompt}; url=${e.url || '(unknown)'}; exactDomMatch=${e.exactDomMatch ? JSON.stringify(e.exactDomMatch) : 'none'}.`;
      }
      throw error;
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'bridge_ping') {
        sendResponse({ ok: true, adapter: 'muse' });
        return;
      }
      if (msg.type === 'managed_worker_ready') {
        sendResponse({ ok: true, ...managedWorkerReady() });
        return;
      }
      if (msg.type === 'capture_latest') {
        const text = answer.latestAssistantText();
        const nativeGenerating = !!input.generationLooksActive();
        const isGenerating = nativeGenerating || asyncProgressText(text);
        sendResponse({
          ok: true,
          text,
          isGenerating,
          generationState: isGenerating ? 'active' : 'idle',
          observedAt: Date.now(),
          completenessHint: isGenerating ? 'unknown' : (looksCompleteAssistantText(text) ? 'complete' : 'unknown')
        });
        return;
      }
      if (msg.type === 'send_prompt') {
        submitPrompt(msg.requestId, msg.text, { qualification: msg.qualification || null })
          .then((submissionMode) => sendResponse({
            ok: true,
            submissionMode,
            deliveryProof: { seeded: true, submitAttempted: true, submitMethod: submissionMode, committed: true }
          }))
          .catch((error) => {
            stopWatcher(msg.requestId);
            emit({ type: 'adapter_error', requestId: msg.requestId, code: error.code || 'PROMPT_SEND_FAILED', message: error.message, detail: error.detail || null });
            sendResponse({ ok: false, error: error.message, code: error.code || 'PROMPT_SEND_FAILED', detail: error.detail || null });
          });
        return true;
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ...input,
      ...answer,
      isDexRelayPrompt,
      asyncProgressText,
      looksCompleteAssistantText,
      RELIABLE_GENERATION_SETTLE_MS,
      COMPLETE_NO_SIGNAL_SETTLE_MS,
      NO_SIGNAL_SETTLE_MS,
      watchResponse,
      submitPrompt,
      managedWorkerReady,
      stopWatcher,
      dispatchComposerEnter,
      waitForComposer,
      resolveComposer,
      recoverQualificationComposer,
      waitForComposerText,
      waitForPromptDeparture,
      promptCommitted,
      commitmentDiagnostics,
      requestComposerSubmit,
      submitComposer
    };
  }
})();
