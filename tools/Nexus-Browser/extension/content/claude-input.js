(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeClaudeInputLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeClaudeInputLoaded = true;

  function visible(element) {
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect?.();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && (!rect || (rect.width > 0 && rect.height > 0));
  }

  function composerSelectors() {
    return [
      '[data-testid="chat-input"][contenteditable="true"]',
      '[data-testid="chat-input"] [contenteditable="true"]',
      '[data-testid="chat-input-ssr"][contenteditable="true"]',
      '[data-testid="chat-input-ssr"] [contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="plaintext-only"][role="textbox"]'
    ];
  }

  function findComposer() {
    for (const selector of composerSelectors()) {
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

  function setComposerText(composer, text) {
    if (!composer) throw new Error('Claude composer is missing.');
    composer.focus();
    const tag = String(composer.tagName || '').toUpperCase();

    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const proto = Object.getPrototypeOf(composer);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
      try {
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch {
        composer.dispatchEvent(new Event('input', { bubbles: true }));
      }
      composer.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (!composer.isContentEditable) throw new Error('Unsupported Claude composer element.');

    const range = document.createRange();
    range.selectNodeContents(composer);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch {}
    if (!inserted) composer.textContent = text;

    try {
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } catch {
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    }
    composer.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function composerContainsText(composer, text) {
    const wanted = normalized(text);
    const actual = normalized(composerText(composer));
    return !!wanted && (actual === wanted || actual.includes(wanted));
  }

  function controlMetadata(control) {
    if (!control) return '';
    return [
      control.getAttribute?.('aria-label'),
      control.getAttribute?.('data-testid'),
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
    return /\b(mic|microphone|voice|audio|record|dictat|speech|listen|attach|upload)\b/.test(meta);
  }

  function sendControlScore(control) {
    if (!control || isDisabledControl(control) || isUnsafeSendControl(control)) return -1000;
    const aria = String(control.getAttribute?.('aria-label') || '').trim().toLowerCase();
    const testId = String(control.getAttribute?.('data-testid') || '').trim().toLowerCase();
    const type = String(control.getAttribute?.('type') || '').trim().toLowerCase();
    let score = 0;
    if (aria === 'send message') score += 250;
    else if (aria === 'send') score += 220;
    else if (/\bsend\b/.test(aria)) score += 150;
    if (testId === 'send-button') score += 220;
    else if (testId.includes('send')) score += 120;
    if (type === 'submit') score += 40;
    if (control.matches?.('button, [role="button"]')) score += 10;
    return score;
  }

  function findSendControl(composer) {
    const selectors = [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      '[role="button"][aria-label="Send message"]',
      'button[data-testid="send-button"]',
      '[data-testid="send-button"]',
      'button[aria-label*="Send" i]'
    ];

    for (const selector of selectors) {
      const matches = [...document.querySelectorAll(selector)]
        .filter(visible)
        .map((control) => ({ control, score: sendControlScore(control) }))
        .filter((entry) => entry.score >= 100)
        .sort((a, b) => b.score - a.score);
      if (matches[0]) return matches[0].control;
    }

    const scope = composer.closest?.('form')
      || composer.closest?.('fieldset')
      || composer.closest?.('[data-testid="chat-input"]')?.parentElement
      || composer.parentElement?.parentElement
      || document;
    const candidates = [...scope.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .map((control) => ({ control, score: sendControlScore(control) }))
      .filter((entry) => entry.score >= 100)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.control || null;
  }

  function generationLooksActive() {
    if ([...document.querySelectorAll('[data-is-streaming="true"]')].some(visible)) return true;
    const selectors = [
      'button[aria-label*="Stop" i]',
      '[role="button"][aria-label*="Stop" i]',
      'button[data-testid="stop-button"]',
      '[data-testid="stop-button"]'
    ];
    return selectors.some((selector) => [...document.querySelectorAll(selector)].some(visible));
  }

  const api = {
    visible,
    composerSelectors,
    findComposer,
    composerText,
    setComposerText,
    composerContainsText,
    controlMetadata,
    isDisabledControl,
    isUnsafeSendControl,
    sendControlScore,
    findSendControl,
    generationLooksActive
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeClaudeInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
