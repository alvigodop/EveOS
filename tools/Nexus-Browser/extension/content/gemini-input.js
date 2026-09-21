(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeGeminiInputLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeGeminiInputLoaded = true;

  function frontendFromUrl(url = globalThis.location?.href || '') {
    try {
      const host = new URL(url).hostname;
      if (host === 'aistudio.google.com') return 'aistudio';
      if (host === 'gemini.google.com') return 'gemini';
    } catch {}
    return 'gemini';
  }

  function visible(element) {
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    try {
      const style = getComputedStyle(element);
      const hidden = typeof document !== 'undefined' && !!document.hidden;
      const rect = element.getBoundingClientRect?.();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && (hidden || !rect || (rect.width > 0 && rect.height > 0));
    } catch {
      return true;
    }
  }

  function composerSelectors(frontend = frontendFromUrl()) {
    if (frontend === 'aistudio') {
      return [
        '.testing-request textarea[aria-label="Type something"]',
        'textarea[aria-label="Type something"]',
        '#chat-input-field',
        'ms-prompt-box textarea[aria-label="Enter a prompt"]',
        'textarea[aria-label="Enter a prompt"]',
        'ms-prompt-box ms-autosize-textarea textarea',
        'ms-prompt-box textarea',
        'ms-autosize-textarea textarea'
      ];
    }
    return [
      'div.ql-editor.textarea[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]',
      '[aria-label="Enter a prompt here"]',
      '[contenteditable="true"][role="textbox"]'
    ];
  }

  function findComposer() {
    const frontend = frontendFromUrl();
    for (const selector of composerSelectors(frontend)) {
      const match = [...document.querySelectorAll(selector)].find(visible);
      if (match) return match;
    }
    return null;
  }

  function composerText(composer) {
    if (!composer) return '';
    const tag = String(composer.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') return String(composer.value || '');
    return String(composer.innerText || composer.textContent || '');
  }

  function dispatchInputEvents(composer, text) {
    try {
      composer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    } catch {}
    try {
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    } catch {
      composer.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
    composer.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  function setComposerText(composer, text) {
    if (!composer) throw new Error('Gemini composer is missing.');
    composer.focus();
    const tag = String(composer.tagName || '').toUpperCase();

    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const proto = Object.getPrototypeOf(composer);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
      if (composer.value !== text) composer.value = text;
      dispatchInputEvents(composer, text);
      return;
    }

    if (!composer.isContentEditable) throw new Error('Unsupported Gemini composer element.');
    const range = document.createRange();
    range.selectNodeContents(composer);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch {}
    if (!inserted) {
      composer.textContent = '';
      const lines = String(text).split('\n');
      for (const line of lines) {
        const p = document.createElement('p');
        p.textContent = line || '';
        composer.appendChild(p);
      }
    }
    dispatchInputEvents(composer, text);
  }

  function refreshComposerState(composer) {
    if (!composer) return;
    const text = composerText(composer);
    try { composer.focus?.(); } catch {}
    dispatchInputEvents(composer, text);
    try { composer.blur?.(); } catch {}
  }

  function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function composerContainsText(composer, text) {
    const wanted = normalized(text);
    const actual = normalized(composerText(composer));
    return !!wanted && (actual === wanted || actual.includes(wanted));
  }

  function aiStudioUserTurnCount(root = globalThis.document) {
    if (!root?.querySelectorAll) return 0;
    return [...root.querySelectorAll('ms-chat-turn')].filter((turn) => {
      const role = String(turn.getAttribute?.('data-turn-role') || '').toLowerCase();
      if (role === 'user') return true;
      if (turn.querySelector?.('[data-turn-role="User"], [data-turn-role="user"], .chat-turn-container.user')) return true;
      return String(turn.className || '').toLowerCase().includes('user');
    }).length;
  }

  function controlMetadata(control) {
    if (!control) return '';
    return [
      control.getAttribute?.('aria-label'),
      control.getAttribute?.('data-testid'),
      control.getAttribute?.('data-test-id'),
      control.getAttribute?.('name'),
      control.getAttribute?.('type'),
      control.getAttribute?.('title'),
      control.className,
      control.textContent
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isDisabledControl(control) {
    return !!control?.disabled || control?.getAttribute?.('aria-disabled') === 'true';
  }

  function isUnsafeSendControl(control) {
    const meta = controlMetadata(control);
    return /\b(mic|microphone|voice|audio|record|dictat\w*|speech|listen|attach|upload|camera|webcam|screen share|live)\b/.test(meta);
  }

  function sendControlScore(control, frontend = frontendFromUrl()) {
    if (!control || isUnsafeSendControl(control)) return -1000;
    const disabled = isDisabledControl(control);
    const aria = String(control.getAttribute?.('aria-label') || '').trim().toLowerCase();
    const type = String(control.getAttribute?.('type') || '').trim().toLowerCase();
    const testId = String(control.getAttribute?.('data-test-id') || control.getAttribute?.('data-testid') || '').toLowerCase();
    const classes = String(control.className || '').toLowerCase();
    let score = 0;

    if (frontend === 'aistudio') {
      const isRun = aria === 'run' || /\brun\b/.test(aria) || classes.includes('run-button') || !!control.closest?.('ms-run-button');
      if (!isRun || disabled) return -1000;
      if (aria === 'run') score += 320;
      else if (/\brun\b/.test(aria)) score += 180;
      if (classes.includes('run-button')) score += 220;
      if (control.closest?.('.testing-request')) score += 140;
      if (control.closest?.('ms-prompt-box')) score += 120;
    } else {
      if (disabled) return -1000;
      if (aria === 'send message') score += 280;
      else if (aria === 'send') score += 240;
      else if (/\bsend\b/.test(aria)) score += 160;
      if (classes.includes('send-button')) score += 180;
      if (testId.includes('send')) score += 140;
    }
    if (type === 'submit') score += 40;
    if (control.matches?.('button, [role="button"]')) score += 10;
    return score;
  }

  function sendSelectors(frontend = frontendFromUrl()) {
    if (frontend === 'aistudio') {
      return [
        '.testing-request button.run-button[aria-label="Run"]',
        'ms-prompt-box button.run-button[aria-label="Run"]',
        'button.run-button[aria-label="Run"]',
        'ms-prompt-box ms-run-button button[aria-label="Run"]',
        'ms-run-button button[aria-label="Run"]',
        'button[aria-label="Run"]',
        'ms-prompt-box ms-run-button button',
        'ms-run-button button',
        'button.run-button',
        'button[aria-label*="Run" i]',
        'button[title*="Run" i]'
      ];
    }
    return [
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'button[aria-label*="Send" i]',
      'button.send-button',
      '.send-button'
    ];
  }

  function rankedControlsInScope(scope, frontend, requireVisible = true) {
    if (!scope?.querySelectorAll) return [];
    const seen = new Set();
    const ranked = [];
    for (const selector of sendSelectors(frontend)) {
      for (const control of scope.querySelectorAll(selector)) {
        if (seen.has(control)) continue;
        seen.add(control);
        if (requireVisible && !visible(control)) continue;
        const score = sendControlScore(control, frontend);
        if (score >= 100) ranked.push({ control, score });
      }
    }
    return ranked.sort((a, b) => b.score - a.score);
  }

  function rankedSendControls(frontend = frontendFromUrl(), requireVisible = true) {
    return rankedControlsInScope(document, frontend, requireVisible);
  }

  function aiStudioComposerScope(composer) {
    return composer?.closest?.('.testing-request')
      || composer?.closest?.('ms-prompt-box')
      || composer?.closest?.('form')
      || composer?.parentElement?.parentElement
      || document;
  }

  function findSendControl(composer) {
    const frontend = frontendFromUrl();
    if (frontend === 'aistudio') {
      const local = rankedControlsInScope(aiStudioComposerScope(composer), frontend, true)[0]?.control;
      if (local) return local;
    }

    const direct = rankedSendControls(frontend, true)[0]?.control;
    if (direct) return direct;

    const scope = composer.closest?.('form')
      || composer.closest?.('ms-prompt-box')
      || composer.parentElement?.parentElement
      || document;
    const scoped = [...scope.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .map((control) => ({ control, score: sendControlScore(control, frontend) }))
      .filter((entry) => entry.score >= 100)
      .sort((a, b) => b.score - a.score)[0]?.control;
    if (scoped) return scoped;

    if (frontend === 'aistudio') return rankedSendControls(frontend, false)[0]?.control || null;
    return null;
  }

  function submissionReady(frontend = frontendFromUrl()) {
    if (frontend !== 'aistudio') return false;
    for (const selector of sendSelectors('aistudio')) {
      for (const control of document.querySelectorAll(selector)) {
        if (isUnsafeSendControl(control)) continue;
        const aria = String(control.getAttribute?.('aria-label') || '').trim().toLowerCase();
        if (aria === 'run' || /\brun\b/.test(aria) || control.closest?.('ms-run-button') || String(control.className || '').includes('run-button')) {
          return true;
        }
      }
    }
    return false;
  }

  function generationLooksActive(frontend = frontendFromUrl()) {
    const selectors = frontend === 'aistudio'
      ? [
          'ms-prompt-box ms-run-button button[aria-label*="Stop" i]',
          'ms-prompt-box button[aria-label*="Stop" i]',
          'ms-run-button button[aria-label*="Stop" i]',
          'button.run-button[aria-label*="Stop" i]',
          'button[aria-label*="Stop" i]',
          'button[aria-label*="Cancel" i]'
        ]
      : [
          '[aria-busy="true"]',
          'button[aria-label*="Stop" i]',
          '[role="button"][aria-label*="Stop" i]'
        ];
    return selectors.some((selector) => [...document.querySelectorAll(selector)].some(visible));
  }

  const api = {
    frontendFromUrl,
    visible,
    composerSelectors,
    findComposer,
    composerText,
    setComposerText,
    refreshComposerState,
    composerContainsText,
    aiStudioUserTurnCount,
    controlMetadata,
    isDisabledControl,
    isUnsafeSendControl,
    sendControlScore,
    sendSelectors,
    rankedSendControls,
    aiStudioComposerScope,
    findSendControl,
    submissionReady,
    generationLooksActive
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeGeminiInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();