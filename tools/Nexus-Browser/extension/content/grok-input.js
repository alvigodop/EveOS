(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeGrokInputLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeGrokInputLoaded = true;

  function visible(element) {
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect?.();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && (!rect || (rect.width > 0 && rect.height > 0));
  }

  function currentUrl() {
    if (typeof location === 'undefined') return '';
    return String(location.href || '');
  }

  function isXGrokUrl(url) {
    return /^https:\/\/(?:www\.)?x\.com\/i\/grok(?:[/?#]|$)/i.test(String(url || ''));
  }

  function composerSelectorsForUrl(url) {
    if (isXGrokUrl(url)) {
      return [
        'textarea[placeholder="Ask anything"]',
        'textarea[placeholder*="Ask" i]',
        'textarea[aria-label*="Ask" i]',
        '[data-testid="grokInput"] textarea',
        '[data-testid="grokInput"][contenteditable="true"]',
        '[data-testid="grokInput"] [contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        'textarea',
        '[contenteditable="true"]'
      ];
    }

    return [
      '[data-testid="chat-input"] [contenteditable="true"]',
      'div[aria-label="Ask Grok anything"]',
      'div.tiptap.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="Grok" i]',
      'textarea'
    ];
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
    return /\b(mic|microphone|voice|audio|record|recording|dictat|speech|listen)\b|麦克风|语音/.test(meta);
  }

  function sendControlScore(control) {
    if (!control || isDisabledControl(control) || isUnsafeSendControl(control)) return -1000;
    const meta = controlMetadata(control);
    let score = 0;
    if (control.getAttribute?.('data-testid') === 'chat-submit') score += 200;
    if (control.getAttribute?.('data-testid') === 'send-button') score += 180;
    if (/\b(submit|send|send message)\b|提交|发送/.test(meta)) score += 100;
    if (control.getAttribute?.('type') === 'submit') score += 60;
    if (control.matches?.('button, [role="button"]')) score += 10;
    return score;
  }

  function findComposer() {
    for (const selector of composerSelectorsForUrl(currentUrl())) {
      const match = [...document.querySelectorAll(selector)].find(visible);
      if (match) return match;
    }
    return null;
  }

  function setComposerText(composer, text) {
    composer.focus();
    const isTextarea = composer.tagName === 'TEXTAREA' || composer instanceof HTMLTextAreaElement;
    const isInput = composer.tagName === 'INPUT' || composer instanceof HTMLInputElement;

    if (isTextarea || isInput) {
      const proto = Object.getPrototypeOf(composer);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        || Object.getOwnPropertyDescriptor((isTextarea ? HTMLTextAreaElement : HTMLInputElement).prototype, 'value')?.set;
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

    if (composer.isContentEditable) {
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
      return;
    }

    throw new Error('Unsupported Grok composer element.');
  }

  function findSendControl(composer) {
    const selectors = [
      '[data-testid="chat-submit"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Submit"]',
      '[role="button"][aria-label="Submit"]',
      'button[aria-label="Send"]',
      '[role="button"][aria-label="Send"]',
      'button[aria-label="Send message"]',
      '[role="button"][aria-label="Send message"]',
      'button[aria-label="提交"]',
      'button[aria-label="发送"]',
      'button[type="submit"]'
    ];

    for (const selector of selectors) {
      const matches = [...document.querySelectorAll(selector)]
        .filter(visible)
        .filter((control) => sendControlScore(control) >= 60)
        .sort((a, b) => sendControlScore(b) - sendControlScore(a));
      if (matches[0]) return matches[0];
    }

    const scope = composer.closest?.('form')
      || composer.closest?.('[data-testid="chat-input"]')?.parentElement
      || composer.closest?.('[data-testid="grokInput"]')?.parentElement
      || composer.parentElement?.parentElement
      || document;
    const candidates = [...scope.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .map((control) => ({ control, score: sendControlScore(control) }))
      .filter((entry) => entry.score >= 60)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.control || null;
  }

  function generationLooksActive() {
    const selectors = [
      'button[aria-label*="stop" i]',
      '[role="button"][aria-label*="stop" i]',
      'button[aria-label*="停止"]',
      '[data-testid*="stop" i]'
    ];
    return selectors.some((selector) => [...document.querySelectorAll(selector)].some(visible));
  }

  const api = {
    visible,
    currentUrl,
    isXGrokUrl,
    composerSelectorsForUrl,
    controlMetadata,
    isDisabledControl,
    isUnsafeSendControl,
    sendControlScore,
    findComposer,
    setComposerText,
    findSendControl,
    generationLooksActive
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeGrokInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
