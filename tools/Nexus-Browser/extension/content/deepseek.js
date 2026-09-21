(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeDeepSeekLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeDeepSeekLoaded = true;

  const input = globalThis.BrowserAiBridgeDeepSeekInput
    || (typeof module !== 'undefined' && module.exports ? require('./deepseek-input.js') : null);
  const answer = globalThis.BrowserAiBridgeDeepSeekAnswer
    || (typeof module !== 'undefined' && module.exports ? require('./deepseek-answer.js') : null);

  if (!input || !answer) throw new Error('DeepSeek bridge modules were not loaded in the expected order.');

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
      requestId,
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

    function finalizeResponse() {
      const nodes = answer.assistantNodes();
      const finalText = answer.getTurnAssistantText(nodes, watcher.baselineCount) || watcher.lastText;
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
        const timeSinceGenEnd = now - watcher.generatingEndedAt;
        if (timeSinceGenEnd >= 1500 && stableFor >= 1500) {
          finalizeResponse();
          return;
        }
      }

      if (!watcher.sawGenerating && stableFor >= 15000) finalizeResponse();
    }

    watcher.observer = new MutationObserver(() => sample());
    watcher.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    watcher.timer = setInterval(sample, 400);
    watcher.timeout = null;
    active.set(requestId, watcher);
  }

  async function submitPrompt(requestId, text, { qualification = null } = {}) {
    const composer = input.findComposer();
    if (!composer) {
      throw new Error('DeepSeek composer was not found. Expected #chat-input, a visible textarea, or a contenteditable textbox.');
    }

    const beforeNodes = answer.assistantNodes();
    const baseline = {
      count: beforeNodes.length,
      text: answer.getTurnAssistantText(beforeNodes, beforeNodes.length)
    };

    input.setComposerText(composer, text);

    let sendControl = null;
    const startWait = Date.now();
    while (Date.now() - startWait < 1200) {
      sendControl = input.findSendControl(composer);
      if (sendControl) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const exactOnce = qualification?.exactOnce === true;
    const composerText = () => String(composer?.value ?? composer?.innerText ?? composer?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const departed = async () => {
      const wanted = String(text || '').replace(/\s+/g, ' ').trim();
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline) {
        if (!composerText().includes(wanted)) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return !composerText().includes(wanted);
    };
    watchResponse(requestId, baseline);

    if (sendControl) {
      sendControl.click();
      if (!exactOnce || await departed()) return;
      stopWatcher(requestId);
      throw new Error('DeepSeek qualification prompt was not committed after the single allowed send-button click.');
    }

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
    if (exactOnce && !(await departed())) {
      stopWatcher(requestId);
      throw new Error('DeepSeek qualification prompt was not committed after the single allowed Enter submission.');
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'bridge_ping') {
        sendResponse({ ok: true, adapter: 'deepseek' });
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
            emit({
              type: 'adapter_error',
              requestId: msg.requestId,
              code: 'PROMPT_SEND_FAILED',
              message: error.message
            });
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
      stopWatcher
    };
  }
})();
