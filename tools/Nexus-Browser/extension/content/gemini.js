(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeGeminiLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeGeminiLoaded = true;

  const input = globalThis.BrowserAiBridgeGeminiInput
    || (typeof module !== 'undefined' && module.exports ? require('./gemini-input.js') : null);
  const answer = globalThis.BrowserAiBridgeGeminiAnswer
    || (typeof module !== 'undefined' && module.exports ? require('./gemini-answer.js') : null);

  if (!input || !answer) throw new Error('Gemini bridge modules were not loaded in the expected order.');

  const active = new Map();
  const GENERATION_HEARTBEAT_MS = 15000;

  function emit(payload) {
    try { chrome.runtime.sendMessage(payload); } catch {}
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function stopWatcher(requestId) {
    const watcher = active.get(requestId);
    if (!watcher) return;
    watcher.observer?.disconnect();
    clearInterval(watcher.timer);
    clearTimeout(watcher.timeout);
    active.delete(requestId);
  }

  function stopStaleWatchers(exceptRequestId = null) {
    for (const requestId of [...active.keys()]) {
      if (requestId !== exceptRequestId) stopWatcher(requestId);
    }
  }

  function aiStudioCanFinalize({ frontend, isGenerating, submissionReady, hasResponse, sawGenerating = true }) {
    return frontend === 'aistudio' && !isGenerating && submissionReady && hasResponse && sawGenerating !== false;
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
      frontend: baseline.frontend,
      baselineCount: baseline.count,
      baselineText: baseline.text,
      lastText: '',
      lastChangedAt: Date.now(),
      started: false,
      sawGenerating: false,
      generatingEndedAt: 0,
      lastHeartbeatAt: 0,
      lastGenerationState: 'unknown',
      observer: null,
      timer: null,
      timeout: null
    };

    function currentText() {
      const nodes = answer.assistantNodes(document, watcher.frontend);
      return {
        nodes,
        text: answer.getTurnAssistantText(nodes, watcher.baselineCount, watcher.frontend)
      };
    }

    function finalize() {
      const sample = currentText();
      const finalText = sample.text || watcher.lastText;
      emit({ type: 'response_final', requestId, text: finalText });
      stopWatcher(requestId);
    }

    function sample() {
      const isGenerating = input.generationLooksActive(watcher.frontend);
      reportGenerationActivity(watcher, requestId, isGenerating);
      if (isGenerating) {
        watcher.sawGenerating = true;
        watcher.generatingEndedAt = 0;
      } else if (watcher.sawGenerating && !watcher.generatingEndedAt) {
        watcher.generatingEndedAt = Date.now();
        reportGenerationActivity(watcher, requestId, false, true);
      }

      const { nodes, text } = currentText();
      if (!nodes.length) return;
      const isNewNode = nodes.length > watcher.baselineCount;
      const changedExisting = text && text !== watcher.baselineText;
      if (!isNewNode && !changedExisting && !watcher.started) return;
      if (!text) return;

      watcher.started = true;
      const changed = text !== watcher.lastText;
      if (changed) {
        watcher.lastText = text;
        watcher.lastChangedAt = Date.now();
        emit({ type: 'response_partial', requestId, text });
      }

      const studioReady = watcher.frontend === 'aistudio'
        && input.submissionReady?.('aistudio');
      if (aiStudioCanFinalize({
        frontend: watcher.frontend,
        isGenerating,
        submissionReady: studioReady,
        hasResponse: isNewNode || changedExisting || watcher.started,
        sawGenerating: watcher.sawGenerating
      })) return finalize();

      if (changed || isGenerating) return;
      const now = Date.now();
      const stableFor = now - watcher.lastChangedAt;
      if (watcher.sawGenerating) {
        if (watcher.generatingEndedAt && now - watcher.generatingEndedAt >= 1500 && stableFor >= 1500) return finalize();
      }
      if (!watcher.sawGenerating && studioReady && stableFor >= 1500) return finalize();
      if (!watcher.sawGenerating && stableFor >= 15000) finalize();
    }

    watcher.observer = new MutationObserver(sample);
    watcher.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    watcher.timer = setInterval(sample, 400);
    watcher.timeout = null;
    active.set(requestId, watcher);
  }

  function triggerClick(element) {
    if (!element) return;
    for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      try {
        element.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, composed: true, view: window }));
      } catch {}
    }
    try { element.click(); } catch {}
    try { element.form?.requestSubmit?.(element); } catch {}
  }

  function triggerAiStudioRun(control) {
    if (!control || input.isDisabledControl?.(control)) return false;
    try { control.focus?.(); } catch {}
    try {
      control.click();
      return true;
    } catch {}
    try {
      control.form?.requestSubmit?.(control);
      return true;
    } catch {}
    return false;
  }

  function aiStudioShortcutModifiers(platform = globalThis.navigator?.platform || globalThis.navigator?.userAgent || '') {
    const mac = /mac|iphone|ipad|ipod/i.test(String(platform));
    return { ctrlKey: !mac, metaKey: mac };
  }

  function dispatchComposerEnter(composer, frontend = input.frontendFromUrl()) {
    const studio = frontend === 'aistudio';
    const modifiers = studio ? aiStudioShortcutModifiers() : { ctrlKey: false, metaKey: false };
    const keyOptions = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      ...modifiers,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    try { composer.focus(); } catch {}
    composer.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
    composer.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
    composer.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
  }

  async function waitForComposerText(composer, text, timeoutMs = 900) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (input.composerContainsText(composer, text)) return true;
      await sleep(40);
    }
    return input.composerContainsText(composer, text);
  }

  async function waitForPromptDeparture(composer, text, timeoutMs = 1600) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!input.composerContainsText(composer, text)) return true;
      await sleep(50);
    }
    return !input.composerContainsText(composer, text);
  }

  async function waitForSendControl(composer, timeoutMs = 1400, {
    findImpl = input.findSendControl,
    refreshImpl = input.refreshComposerState,
    sleepImpl = sleep
  } = {}) {
    const started = Date.now();
    refreshImpl?.(composer);
    while (Date.now() - started < timeoutMs) {
      const control = findImpl?.(composer);
      if (control) return control;
      await sleepImpl(50);
    }
    return findImpl?.(composer) || null;
  }

  async function waitForAiStudioSubmission(composer, text, baselineUserTurns, timeoutMs = 1800) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const cleared = !input.composerContainsText(composer, text);
      const userAdvanced = input.aiStudioUserTurnCount?.() > baselineUserTurns;
      const generating = input.generationLooksActive?.('aistudio');
      if (cleared || userAdvanced || generating) return true;
      await sleep(50);
    }
    return false;
  }

  async function waitForAiStudioRun(composer, timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const control = input.findSendControl(composer);
      if (control && !input.isDisabledControl?.(control)) return control;
      await sleep(50);
    }
    return null;
  }

  async function clickAiStudioRun(composer) {
    input.refreshComposerState?.(composer);
    await sleep(180);
    const control = await waitForAiStudioRun(composer, 2200);
    if (!control) return false;
    return triggerAiStudioRun(control);
  }

  async function submitAiStudioPrompt(composer, text, baselineUserTurns) {
    if (await clickAiStudioRun(composer)) {
      if (await waitForAiStudioSubmission(composer, text, baselineUserTurns)) return true;
    }

    input.refreshComposerState?.(composer);
    await sleep(180);
    if (await clickAiStudioRun(composer)) {
      if (await waitForAiStudioSubmission(composer, text, baselineUserTurns)) return true;
    }

    try { composer.focus(); } catch {}
    dispatchComposerEnter(composer, 'aistudio');
    return waitForAiStudioSubmission(composer, text, baselineUserTurns);
  }

  async function submitPrompt(requestId, text, { qualification = null } = {}) {
    stopStaleWatchers(requestId);
    const frontend = input.frontendFromUrl();
    const exactOnce = qualification?.exactOnce === true;
    const composer = input.findComposer();
    if (!composer) {
      throw new Error(frontend === 'aistudio'
        ? 'Google AI Studio composer was not found. Expected a visible prompt textarea.'
        : 'Gemini composer was not found. Expected a visible Quill/rich-textarea prompt editor.');
    }

    if (frontend === 'aistudio') {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true
        }));
      } catch {}
      try { composer.focus(); } catch {}
    }

    const beforeNodes = answer.assistantNodes(document, frontend);
    const baselineUserTurns = frontend === 'aistudio' ? input.aiStudioUserTurnCount?.() || 0 : 0;
    const baseline = {
      frontend,
      count: beforeNodes.length,
      text: answer.getTurnAssistantText(beforeNodes, beforeNodes.length, frontend)
    };

    input.setComposerText(composer, text);
    if (!(await waitForComposerText(composer, text))) {
      throw new Error('Gemini composer did not retain the prompt text after insertion.');
    }

    watchResponse(requestId, baseline);

    if (frontend === 'aistudio') {
      if (exactOnce) {
        stopWatcher(requestId);
        throw new Error('AI Studio is excluded from exact-once qualification because its submission path uses multi-step window controls.');
      }
      const submitted = await submitAiStudioPrompt(composer, text, baselineUserTurns);
      if (!submitted) {
        stopWatcher(requestId);
        const control = input.findSendControl(composer);
        const detail = control ? input.controlMetadata?.(control) : 'no enabled Run control found';
        throw new Error(`AI Studio retained the prompt but did not submit it (${detail}).`);
      }
      return;
    }

    const sendControl = await waitForSendControl(composer);
    if (sendControl) {
      if (input.isUnsafeSendControl?.(sendControl)) {
        stopWatcher(requestId);
        throw new Error('Refusing to click a Gemini voice/upload control as the send button.');
      }
      if (!exactOnce) {
        triggerClick(sendControl);
        return;
      }
      sendControl.click();
      if (await waitForPromptDeparture(composer, text)) return;
      stopWatcher(requestId);
      throw new Error('Gemini qualification prompt was not committed after the single allowed send-button click.');
    }

    dispatchComposerEnter(composer, frontend);
    if (exactOnce && !(await waitForPromptDeparture(composer, text))) {
      stopWatcher(requestId);
      throw new Error('Gemini qualification prompt was not committed after the single allowed Enter submission.');
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'bridge_ping') {
        sendResponse({ ok: true, adapter: 'gemini' });
        return;
      }
      if (msg.type === 'capture_latest') {
        const text = answer.latestAssistantText();
        const isGenerating = !!input.generationLooksActive(input.frontendFromUrl());
        sendResponse({
          ok: true,
          text,
          isGenerating,
          generationState: isGenerating ? 'active' : 'idle',
          observedAt: Date.now(),
          completenessHint: isGenerating ? 'unknown' : 'settled'
        });
        return;
      }
      if (msg.type === 'send_prompt') {
        submitPrompt(msg.requestId, msg.text, { qualification: msg.qualification || null })
          .then(() => sendResponse({ ok: true }))
          .catch((error) => {
            stopWatcher(msg.requestId);
            emit({ type: 'adapter_error', requestId: msg.requestId, code: 'PROMPT_SEND_FAILED', message: error.message });
            sendResponse({ ok: false, error: error.message });
          });
        return true;
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ...input,
      ...answer,
      watchResponse,
      submitPrompt,
      stopWatcher,
      stopStaleWatchers,
      aiStudioCanFinalize,
      aiStudioShortcutModifiers,
      dispatchComposerEnter,
      waitForComposerText,
      waitForPromptDeparture,
      waitForSendControl,
      waitForAiStudioSubmission,
      waitForAiStudioRun,
      clickAiStudioRun,
      submitAiStudioPrompt,
      triggerAiStudioRun
    };
  }
})();
