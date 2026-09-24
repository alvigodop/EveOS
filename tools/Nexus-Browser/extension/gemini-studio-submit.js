(() => {
  const COMPOSER_SELECTORS = [
    '.testing-request textarea[aria-label="Type something"]',
    'textarea[aria-label="Type something"]',
    '#chat-input-field',
    'ms-prompt-box textarea[aria-label="Enter a prompt"]',
    'textarea[aria-label="Enter a prompt"]',
    'ms-prompt-box ms-autosize-textarea textarea',
    'ms-prompt-box textarea',
    'ms-autosize-textarea textarea'
  ];

  const RUN_SELECTORS = [
    '.testing-request button.run-button[aria-label="Run"]',
    'ms-prompt-box button.run-button[aria-label="Run"]',
    'button.run-button[aria-label="Run"]',
    'ms-prompt-box ms-run-button button[aria-label="Run"]',
    'ms-run-button button[aria-label="Run"]',
    'button[aria-label="Run"]',
    'button.run-button',
    'ms-run-button button'
  ];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function submissionObserved(snapshot, text, baselineUserTurns, wasGenerating = false) {
    if (!snapshot) return false;
    const userAdvanced = Number(snapshot.userTurns || 0) > Number(baselineUserTurns || 0);
    const startedGenerating = !wasGenerating && !!snapshot.generating;
    return userAdvanced || startedGenerating;
  }

  async function executeMain(tabId, func, args = [], scriptingApi = globalThis.chrome?.scripting) {
    if (!scriptingApi?.executeScript) throw new Error('Chrome scripting API is unavailable.');
    const [execution] = await scriptingApi.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args
    });
    return execution?.result ?? null;
  }

  async function ensureAiStudioActive(tabId, scriptingApi = globalThis.chrome?.scripting) {
    return executeMain(tabId, () => {
      if (globalThis.__browserAiBridgeKeepActive) return true;
      globalThis.__browserAiBridgeKeepActive = true;
      try {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
      } catch {}
      try {
        window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
        document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
      } catch {}
      try {
        const nativeRAF = window.requestAnimationFrame.bind(window);
        const nativeCAF = window.cancelAnimationFrame.bind(window);
        let idSeq = 1;
        const map = new Map();
        let worker = null;
        try {
          const blob = new Blob([
            'let t; onmessage = (e) => { if (e.data === "start") { t = setInterval(() => postMessage(0), 16); } else if (e.data === "stop") { clearInterval(t); } };'
          ], { type: 'application/javascript' });
          worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = () => {
            if (map.size === 0) {
              try { worker.postMessage('stop'); } catch {}
              return;
            }
            const now = performance.now();
            for (const [id, entry] of [...map.entries()]) {
              if (!entry.done) {
                entry.done = true;
                clearTimeout(entry.timer);
                map.delete(id);
                try { entry.cb(now); } catch {}
              }
            }
          };
        } catch {}

        window.requestAnimationFrame = function(cb) {
          const id = idSeq++;
          const entry = { cb, done: false, timer: null, rafId: null };
          entry.timer = setTimeout(() => {
            if (!entry.done && map.has(id)) {
              entry.done = true;
              map.delete(id);
              try { cb(performance.now()); } catch {}
            }
          }, 50);
          entry.rafId = nativeRAF((ts) => {
            if (!entry.done && map.has(id)) {
              entry.done = true;
              clearTimeout(entry.timer);
              map.delete(id);
              try { cb(ts); } catch {}
            }
          });
          map.set(id, entry);
          if (worker && map.size === 1) {
            try { worker.postMessage('start'); } catch {}
          }
          return id;
        };
        window.cancelAnimationFrame = function(id) {
          const entry = map.get(id);
          if (entry) {
            entry.done = true;
            clearTimeout(entry.timer);
            nativeCAF(entry.rafId);
            map.delete(id);
            if (worker && map.size === 0) {
              try { worker.postMessage('stop'); } catch {}
            }
          }
        };
      } catch {}
      return true;
    }, [], scriptingApi);
  }

  async function inspectAiStudio(tabId, scriptingApi = globalThis.chrome?.scripting) {
    return executeMain(tabId, (composerSelectors, runSelectors) => {
      const composer = composerSelectors
        .map((selector) => document.querySelector(selector))
        .find((node) => node && !node.disabled) || null;
      const scope = composer?.closest?.('.testing-request, ms-prompt-box, form') || document;
      const run = runSelectors
        .map((selector) => scope.querySelector?.(selector) || document.querySelector(selector))
        .find(Boolean) || null;
      const scopeButtons = [...scope.querySelectorAll('ms-run-button button, button.run-button, button[aria-label]')];
      const stop = scopeButtons.find((button) => {
        const aria = String(button.getAttribute?.('aria-label') || '').toLowerCase();
        return /stop|cancel/i.test(aria) && !/\brun\b/.test(aria);
      });
      const welcome = document.querySelector('ms-g1-welcome-dialog');
      const welcomeVisible = !!welcome && (() => {
        const style = getComputedStyle(welcome);
        return welcome.hidden !== true && welcome.getAttribute?.('aria-hidden') !== 'true'
          && style.display !== 'none' && style.visibility !== 'hidden';
      })();
      const userTurns = [...document.querySelectorAll('ms-chat-turn')].filter((turn) => {
        const role = String(turn.getAttribute?.('data-turn-role') || '').toLowerCase();
        return role === 'user'
          || !!turn.querySelector?.('[data-turn-role="User"], [data-turn-role="user"], .chat-turn-container.user')
          || String(turn.className || '').toLowerCase().includes('user');
      }).length;
      return {
        composerFound: !!composer,
        value: String(composer?.value || ''),
        runFound: !!run,
        runDisabled: !!run?.disabled || run?.getAttribute?.('aria-disabled') === 'true',
        userTurns,
        generating: !!stop,
        blocker: welcomeVisible ? 'first_run_welcome' : ''
      };
    }, [COMPOSER_SELECTORS, RUN_SELECTORS], scriptingApi);
  }

  async function setAiStudioPrompt(tabId, text, scriptingApi = globalThis.chrome?.scripting) {
    return executeMain(tabId, (composerSelectors, value) => {
      const composer = composerSelectors
        .map((selector) => document.querySelector(selector))
        .find((node) => node && !node.disabled) || null;
      if (!composer) return { ok: false, reason: 'composer_missing' };
      try { composer.focus(); } catch {}

      // AI Studio's Angular form state currently reacts most consistently when the real
      // textarea value is updated and then receives plain input/change events.
      try { composer.value = value; }
      catch {
        const proto = Object.getPrototypeOf(composer);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
          || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(composer, value);
      }
      try { composer.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); } catch {}
      try { composer.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); } catch {}
      try { composer.focus(); composer.blur(); composer.focus(); } catch {}
      return { ok: true, value: String(composer.value || '') };
    }, [COMPOSER_SELECTORS, text], scriptingApi);
  }

  async function clickAiStudioRun(tabId, scriptingApi = globalThis.chrome?.scripting) {
    return executeMain(tabId, async (composerSelectors, runSelectors) => {
      const composer = composerSelectors
        .map((selector) => document.querySelector(selector))
        .find((node) => node && !node.disabled) || null;
      const scope = composer?.closest?.('.testing-request, ms-prompt-box, form') || document;
      const run = runSelectors
        .map((selector) => scope.querySelector?.(selector) || document.querySelector(selector))
        .find(Boolean) || null;
      if (!run) return { ok: false, reason: 'run_missing' };

      try {
        // Refresh Angular's view of the textarea immediately before Run. Current AI Studio
        // userscripts use this same input/change + focus/blur pattern before clicking Run.
        if (composer) {
          composer.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          composer.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          composer.focus();
          composer.blur();
        }

        // AI Studio can leave the real Run button disabled after programmatic textarea
        // insertion even though the visible composer contains text. Temporarily clear that
        // stale disabled state, click the real button, then let Angular replace/update it.
        if (run.disabled) run.disabled = false;
        if (run.getAttribute?.('aria-disabled') === 'true') run.setAttribute('aria-disabled', 'false');
        try { run.removeAttribute?.('disabled'); } catch {}
        await new Promise((resolve) => setTimeout(resolve, 180));
        try { run.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window })); } catch {}
        try { run.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 })); } catch {}
        try { run.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window })); } catch {}
        try { run.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0 })); } catch {}
        run.click();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error?.message || 'run_click_failed' };
      }
    }, [COMPOSER_SELECTORS, RUN_SELECTORS], scriptingApi);
  }

  async function shortcutAiStudioSubmit(tabId, scriptingApi = globalThis.chrome?.scripting, modified = false) {
    return executeMain(tabId, (composerSelectors, useModifiedShortcut) => {
      const composer = composerSelectors
        .map((selector) => document.querySelector(selector))
        .find((node) => node && !node.disabled) || null;
      if (!composer) return { ok: false, reason: 'composer_missing' };
      const isMac = /mac|iphone|ipad|ipod/i.test(String(navigator.platform || navigator.userAgent || ''));
      const options = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        ctrlKey: useModifiedShortcut && !isMac,
        metaKey: useModifiedShortcut && isMac,
        bubbles: true,
        cancelable: true,
        composed: true
      };
      try { composer.focus(); } catch {}
      composer.dispatchEvent(new KeyboardEvent('keydown', options));
      composer.dispatchEvent(new KeyboardEvent('keypress', options));
      composer.dispatchEvent(new KeyboardEvent('keyup', options));
      return { ok: true };
    }, [COMPOSER_SELECTORS, modified], scriptingApi);
  }

  function createDefaultOps(tabId, scriptingApi) {
    return {
      ensureActive: () => ensureAiStudioActive(tabId, scriptingApi),
      inspect: () => inspectAiStudio(tabId, scriptingApi),
      setPrompt: (text) => setAiStudioPrompt(tabId, text, scriptingApi),
      clickRun: () => clickAiStudioRun(tabId, scriptingApi),
      enter: () => shortcutAiStudioSubmit(tabId, scriptingApi, false),
      shortcut: () => shortcutAiStudioSubmit(tabId, scriptingApi, true)
    };
  }

  async function waitFor(predicate, { timeoutMs, intervalMs, delay = sleep }) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
      last = await predicate();
      if (last?.ok) return last.value;
      await delay(intervalMs);
    }
    return last?.value ?? null;
  }

  async function verifyAfter(runtime, baselineUserTurns, text, timeoutMs, delay, wasGenerating = false) {
    const submitted = await waitFor(async () => {
      const snapshot = await runtime.inspect();
      return {
        ok: submissionObserved(snapshot, text, baselineUserTurns, wasGenerating),
        value: snapshot
      };
    }, { timeoutMs, intervalMs: 120, delay });
    return submissionObserved(submitted, text, baselineUserTurns, wasGenerating);
  }

  async function submitAiStudioPrompt({
    tabId,
    text,
    scriptingApi = globalThis.chrome?.scripting,
    ops = null,
    delay = sleep,
    composerTimeoutMs = 12000,
    waitGeneratingTimeoutMs = 15000,
    runTimeoutMs = 5000,
    verifyTimeoutMs = 5000
  }) {
    const runtime = ops || createDefaultOps(tabId, scriptingApi);
    if (runtime.ensureActive) await runtime.ensureActive().catch(() => {});
    const initial = await waitFor(async () => {
      const snapshot = await runtime.inspect();
      return { ok: !!snapshot?.composerFound, value: snapshot };
    }, { timeoutMs: composerTimeoutMs, intervalMs: 150, delay });
    if (!initial?.composerFound) {
      return { ok: false, error: 'Google AI Studio composer did not become ready in the bridge popup.' };
    }
    if (initial.blocker === 'first_run_welcome') {
      return { ok: false, code: 'PROVIDER_SETUP_REQUIRED', error: 'Google AI Studio is blocked by its first-run welcome screen. Open that tab and choose Continue before sending through Nexus Browser.' };
    }

    let readySnapshot = initial;
    if (!initial.runFound && initial.generating) {
      readySnapshot = await waitFor(async () => {
        const snapshot = await runtime.inspect();
        return { ok: !!snapshot?.runFound && !snapshot?.generating, value: snapshot };
      }, { timeoutMs: waitGeneratingTimeoutMs, intervalMs: 250, delay });
      if (!readySnapshot?.runFound) {
        return { ok: false, error: 'Google AI Studio is still busy generating the previous prompt.' };
      }
    }

    const baselineUserTurns = Number(readySnapshot.userTurns || 0);
    const wasGenerating = !!readySnapshot.generating;
    const inserted = await runtime.setPrompt(text);
    if (!inserted?.ok) return { ok: false, error: 'Google AI Studio composer rejected the prompt text.' };

    // Wait for the real Run control to exist, but do not require Angular to clear its stale
    // disabled flag: clickRun refreshes form state and safely clears that flag immediately
    // before clicking the real AI Studio control.
    const runnable = await waitFor(async () => {
      const snapshot = await runtime.inspect();
      return { ok: !!snapshot?.runFound, value: snapshot };
    }, { timeoutMs: runTimeoutMs, intervalMs: 120, delay });

    if (runnable?.runFound) {
      const clicked = await runtime.clickRun();
      if (clicked?.ok && await verifyAfter(runtime, baselineUserTurns, text, verifyTimeoutMs, delay, wasGenerating)) {
        return { ok: true, method: 'run' };
      }
    }

    // Current AI Studio builds show an Enter glyph on Run in some layouts. Try plain Enter
    // before the older Ctrl/Cmd+Enter shortcut, then verify the actual User turn/generation.
    if (runtime.enter) {
      await runtime.enter();
      if (await verifyAfter(runtime, baselineUserTurns, text, verifyTimeoutMs, delay, wasGenerating)) {
        return { ok: true, method: 'enter' };
      }
    }

    await runtime.shortcut();
    if (await verifyAfter(runtime, baselineUserTurns, text, verifyTimeoutMs, delay, wasGenerating)) {
      return { ok: true, method: 'shortcut' };
    }

    return {
      ok: false,
      error: 'AI Studio did not expose a committed user turn or generation after Run, Enter, and Ctrl/Cmd+Enter attempts.'
    };
  }

  const api = {
    COMPOSER_SELECTORS,
    RUN_SELECTORS,
    normalized,
    submissionObserved,
    executeMain,
    ensureAiStudioActive,
    inspectAiStudio,
    setAiStudioPrompt,
    clickAiStudioRun,
    shortcutAiStudioSubmit,
    submitAiStudioPrompt
  };

  if (typeof globalThis !== 'undefined') globalThis.BrowserAiBridgeGeminiStudioSubmit = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
