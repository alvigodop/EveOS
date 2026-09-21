(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeDeepSeekInputLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeDeepSeekInputLoaded = true;

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function findComposer() {
    const selectors = [
      '#chat-input',
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="DeepSeek" i]',
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]'
    ];
    for (const selector of selectors) {
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
      if (composer._valueTracker) {
        try { composer._valueTracker.setValue(''); } catch {}
      }
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
      return;
    }

    throw new Error('Unsupported DeepSeek composer element.');
  }

  function findSendControl(composer) {
    const directSelectors = [
      'button[data-testid*="send" i]:not([disabled])',
      '[role="button"][data-testid*="send" i]:not([aria-disabled="true"])',
      'button[aria-label*="send" i]:not([disabled])',
      '[role="button"][aria-label*="send" i]:not([aria-disabled="true"])',
      'button[aria-label*="发送"]:not([disabled])',
      '[role="button"][aria-label*="发送"]:not([aria-disabled="true"])',
      '[class*="send-btn" i]:not([disabled]):not([aria-disabled="true"])',
      '[class*="sendBtn" i]:not([disabled]):not([aria-disabled="true"])',
      '[class*="send-button" i]:not([disabled]):not([aria-disabled="true"])'
    ];
    for (const selector of directSelectors) {
      const match = [...document.querySelectorAll(selector)].find(visible);
      if (match) return match;
    }

    const sendGlyph = [...document.querySelectorAll('.ds-icon svg[viewBox="0 0 14 16"]')].find(visible);
    if (sendGlyph) {
      const control = sendGlyph.closest('button, [role="button"]');
      if (control && control.getAttribute('aria-disabled') !== 'true' && !control.disabled) return control;
    }

    const scope = composer.closest('form')
      || composer.closest('div[class*="input"]')
      || composer.parentElement?.parentElement?.parentElement
      || document;
    const candidates = [...scope.querySelectorAll('button:not([disabled]), [role="button"]:not([aria-disabled="true"])')]
      .filter(visible);
    const byLabel = candidates.find((candidate) => /send|发送|submit/i.test(
      `${candidate.getAttribute('aria-label') || ''} ${candidate.title || ''} ${candidate.className || ''}`
    ));
    if (byLabel) return byLabel;

    const withSvg = candidates.filter((candidate) => candidate.querySelector('svg'));
    if (withSvg.length > 0) return withSvg[withSvg.length - 1];
    return null;
  }

  function generationLooksActive() {
    const selectors = [
      'button[aria-label*="stop" i]',
      '[role="button"][aria-label*="stop" i]',
      '[data-testid*="stop" i]',
      '[class*="stop-button" i]',
      '[class*="stopBtn" i]'
    ];
    if (selectors.some((selector) => [...document.querySelectorAll(selector)].some(visible))) return true;

    const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(visible);
    if (buttons.some((node) => /stop generating|停止生成|\bstop\b/i.test(
      `${node.getAttribute('aria-label') || ''} ${node.title || ''} ${node.textContent || ''}`
    ))) return true;

    const stopSquare = [...document.querySelectorAll('button svg rect, [role="button"] svg rect')].find(visible);
    if (stopSquare) return true;

    const composer = findComposer();
    if (composer && composer.closest('[class*="generating" i], [class*="loading" i]')) return true;
    return false;
  }

  const api = {
    visible,
    findComposer,
    setComposerText,
    findSendControl,
    generationLooksActive
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeDeepSeekInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
