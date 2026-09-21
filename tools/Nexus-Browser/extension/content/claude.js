(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeClaudeLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeClaudeLoaded = true;

  const input = globalThis.BrowserAiBridgeClaudeInput
    || (typeof module !== 'undefined' && module.exports ? require('./claude-input.js') : null);
  const answer = globalThis.BrowserAiBridgeClaudeAnswer
    || (typeof module !== 'undefined' && module.exports ? require('./claude-answer.js') : null);

  if (!input || !answer) throw new Error('Claude bridge modules were not loaded in the expected order.');

  const active = new Map();
  const GENERATION_HEARTBEAT_MS = 15000;

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
      observer: null,
      timer: null,
      timeout: null
    };

    function finalize() {
      const finalText = answer.getTurnAssistantText(answer.assistantNodes(), watcher.baselineCount) || watcher.lastText;
      emit({ type: 'response_final', requestId, text: finalText });
      stopWatcher(requestId);
    }

    function sample() {
      const isGenerating = input.generationLooksActive();
      reportGenerationActivity(watcher, requestId, isGenerating);
      if (isGenerating) {
        watcher.sawGenerating = true;
        watcher.generatingEndedAt = 0;
      } else if (watcher.sawGenerating && !watcher.generatingEndedAt) {
        watcher.generatingEndedAt = Date.now();
        reportGenerationActivity(watcher, requestId, false, true);
      }

      const nodes = answer.assistantNodes();
      if (!nodes.length) return;
      const text = answer.getTurnAssistantText(nodes, watcher.baselineCount);
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
        if (now - watcher.generatingEndedAt >= 1500 && stableFor >= 1500) return finalize();
      }
      if (!watcher.sawGenerating && stableFor >= 15000) finalize();
    }

    watcher.observer = new MutationObserver(sample);
    watcher.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    watcher.timer = setInterval(sample, 400);
    watcher.timeout = null;
    active.set(requestId, watcher);
  }

  function dispatchComposerEnter(composer) {
    const keyOptions = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };
    composer.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
    composer.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
    composer.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
  }

  async function waitForComposerText(composer, text, timeoutMs = 700) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (input.composerContainsText(composer, text)) return true;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return input.composerContainsText(composer, text);
  }

  async function waitForPromptDeparture(composer, text, timeoutMs = 1600) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!input.composerContainsText(composer, text)) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return !input.composerContainsText(composer, text);
  }

  async function submitPrompt(requestId, text, { qualification = null } = {}) {
    const composer = input.findComposer();
    if (!composer) {
      throw new Error('Claude composer was not found. Expected [data-testid="chat-input"] or a visible ProseMirror textbox.');
    }

    const beforeNodes = answer.assistantNodes();
    const baseline = {
      count: beforeNodes.length,
      text: answer.getTurnAssistantText(beforeNodes, beforeNodes.length)
    };

    input.setComposerText(composer, text);
    if (!(await waitForComposerText(composer, text))) {
      throw new Error('Claude composer did not retain the prompt text after insertion.');
    }

    let sendControl = null;
    const started = Date.now();
    while (Date.now() - started < 1500) {
      sendControl = input.findSendControl(composer);
      if (sendControl) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const exactOnce = qualification?.exactOnce === true;
    watchResponse(requestId, baseline);
    if (sendControl) {
      if (input.isUnsafeSendControl?.(sendControl)) {
        stopWatcher(requestId);
        throw new Error('Refusing to click a Claude voice/upload control as the send button.');
      }
      sendControl.click();
      if (!exactOnce) return;
      const departed = await waitForPromptDeparture(composer, text);
      if (departed) return;
      stopWatcher(requestId);
      throw new Error('Claude qualification prompt was not committed after the single allowed send-button click.');
    }

    dispatchComposerEnter(composer);
    if (exactOnce) {
      const departed = await waitForPromptDeparture(composer, text);
      if (!departed) {
        stopWatcher(requestId);
        throw new Error('Claude qualification prompt was not committed after the single allowed Enter submission.');
      }
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'bridge_ping') {
        sendResponse({ ok: true, adapter: 'claude' });
        return;
      }
      if (msg.type === 'capture_latest') {
        const text = answer.latestAssistantText();
        const isGenerating = !!input.generationLooksActive();
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
      dispatchComposerEnter,
      waitForComposerText,
      waitForPromptDeparture
    };
  }
})();
