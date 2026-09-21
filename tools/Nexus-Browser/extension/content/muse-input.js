(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeMuseInputLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeMuseInputLoaded = true;

  function visible(element) {
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    try {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const unrendered = typeof window !== 'undefined'
        && (window.outerWidth === 0 || window.outerHeight === 0 || (typeof document !== 'undefined' && document.visibilityState === 'hidden'));
      if (unrendered) return true;
      if (style.opacity === '0') return false;
      const rect = element.getBoundingClientRect?.();
      if (!rect) return true;
      return rect.width > 0 && rect.height > 0;
    } catch {
      return true;
    }
  }

  function composerSelectors() {
    return [
      'textarea[data-hatch-composer-prehydration-input="true"]',
      'textarea[data-testid*="composer" i]',
      'textarea[aria-label*="message" i]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="Muse" i]',
      'textarea[placeholder*="ask" i]',
      '[contenteditable="true"][role="textbox"][data-testid*="composer" i]',
      '[contenteditable="true"][role="textbox"][aria-label*="Muse" i]',
      '[contenteditable="true"][role="textbox"][aria-label*="message" i]',
      '[contenteditable="true"][role="textbox"]',
      'textarea'
    ];
  }

  function metadata(element) {
    if (!element) return '';
    return [
      element.id,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('placeholder'),
      element.getAttribute?.('data-testid'),
      element.getAttribute?.('name'),
      element.getAttribute?.('role'),
      element.getAttribute?.('type'),
      element.getAttribute?.('title'),
      element.className,
      element.textContent
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function usableComposer(element) {
    if (!element || !visible(element)) return false;
    if (element.getAttribute?.('aria-hidden') === 'true') return false;
    const tag = String(element.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = String(element.getAttribute?.('type') || element.type || '').toLowerCase();
      return !type || type === 'text' || type === 'search';
    }
    return !!element.isContentEditable;
  }

  function composerScore(element) {
    if (!usableComposer(element)) return -1000;
    const meta = metadata(element);
    const tag = String(element.tagName || '').toUpperCase();
    let score = 0;
    if (/\b(muse|message|ask|chat|prompt)\b/.test(meta)) score += 180;
    if (/composer|chat-input|message-input|hatch-composer/.test(meta)) score += 140;
    if (element.getAttribute?.('role') === 'textbox') score += 90;
    if (element.isContentEditable) score += 70;
    if (tag === 'TEXTAREA') score += 60;
    if (/\b(search|filter|find)\b/.test(meta)) score -= 400;
    if (/\b(email|phone|password|login|sign in|sign up)\b/.test(meta)) score -= 500;
    return score;
  }

  function isPrehydrationComposer(element) {
    return element?.getAttribute?.('data-hatch-composer-prehydration-input') === 'true';
  }

  function findComposer(root = document) {
    const seen = new Set();
    const candidates = [];
    for (const selector of composerSelectors()) {
      let matches = [];
      try { matches = [...root.querySelectorAll(selector)]; } catch {}
      for (const element of matches) {
        if (seen.has(element)) continue;
        seen.add(element);
        candidates.push({ element, score: composerScore(element) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const viable = candidates.filter((entry) => entry.score >= 0);
    return (viable.find((entry) => !isPrehydrationComposer(entry.element)) || viable[0])?.element || null;
  }

  function composerText(composer) {
    if (!composer) return '';
    const tag = String(composer.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') return String(composer.value || '');
    return String(composer.innerText || composer.textContent || '');
  }

  function setNativeValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  function emitInput(element, text) {
    try {
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text
      }));
    } catch {
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function emitBeforeInput(element, text) {
    try {
      return element.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    } catch {
      return true;
    }
  }

  function setComposerText(composer, text) {
    if (!composer) throw new Error('Muse composer is missing.');
    composer.focus?.();
    const tag = String(composer.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      setNativeValue(composer, text);
      emitInput(composer, text);
      return;
    }
    if (!composer.isContentEditable) throw new Error('Unsupported Muse composer element.');
    const range = document.createRange();
    range.selectNodeContents(composer);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch {}
    if (!inserted) {
      emitBeforeInput(composer, text);
      composer.textContent = text;
    }
    emitInput(composer, text);
  }

  function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function composerContainsText(composer, text) {
    const wanted = normalized(text);
    const actual = normalized(composerText(composer));
    return !!wanted && (actual === wanted || actual.includes(wanted));
  }

  function isDisabledControl(control) {
    return !!control?.disabled || control?.getAttribute?.('aria-disabled') === 'true';
  }

  function isUnsafeSendControl(control) {
    const meta = metadata(control);
    return /\b(mic|microphone|voice|audio|record|attach|upload|camera|stop|cancel|approve|approval|allow|purchase|buy|confirm|checkout|authorize|permission)\b/.test(meta);
  }

  function findChatEntryControl(root = document) {
    let controls = [];
    try { controls = [...root.querySelectorAll('button, [role="button"], a')]; } catch {}
    return controls.find((control) => {
      if (!visible(control) || isDisabledControl(control)) return false;
      const aria = String(control.getAttribute?.('aria-label') || '').trim().toLowerCase();
      const title = String(control.getAttribute?.('title') || '').trim().toLowerCase();
      const text = String(control.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return aria === 'chat' || title === 'chat' || text === 'chat';
    }) || null;
  }

  function sendControlScore(control, { allowDisabled = false } = {}) {
    if (!control || !visible(control) || isUnsafeSendControl(control)) return -1000;
    if (!allowDisabled && isDisabledControl(control)) return -1000;
    const meta = metadata(control);
    const aria = String(control.getAttribute?.('aria-label') || '').trim().toLowerCase();
    const testId = String(control.getAttribute?.('data-testid') || '').trim().toLowerCase();
    const type = String(control.getAttribute?.('type') || '').trim().toLowerCase();
    const pelClick = String(control.getAttribute?.('data-pel-click') || '').trim().toLowerCase();
    let score = 0;
    if (pelClick === 'chat_send_message') score += 350;
    if (control.closest?.('[data-hatch-composer-action="send"]')) score += 350;
    if (testId === 'send-button' || testId === 'send-message') score += 300;
    else if (/send|submit/.test(testId)) score += 220;
    if (aria === 'send' || aria === 'send message' || aria === 'send prompt') score += 280;
    else if (/\bsend\b/.test(aria)) score += 200;
    if (/\bsend\b/.test(meta)) score += 120;
    if (type === 'submit') score += 100;
    if (control.matches?.('button, [role="button"]')) score += 20;
    return score;
  }

  function elementRect(element) {
    try {
      const rect = element?.getBoundingClientRect?.();
      if (!rect) return null;
      const left = Number(rect.left), right = Number(rect.right), top = Number(rect.top), bottom = Number(rect.bottom);
      const width = Number.isFinite(Number(rect.width)) ? Number(rect.width) : right - left;
      const height = Number.isFinite(Number(rect.height)) ? Number(rect.height) : bottom - top;
      if (![left, right, top, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left, right, top, bottom, width, height };
    } catch {
      return null;
    }
  }

  function composerLocalControlScore(control, composer, { allowDisabled = false } = {}) {
    const semantic = sendControlScore(control, { allowDisabled });
    if (semantic < 0 || !composer) return semantic;

    let score = semantic;
    let anchored = false;
    const composerForm = composer.closest?.('form');
    if (composerForm && (control.closest?.('form') === composerForm || composerForm.contains?.(control))) {
      score += 40;
      anchored = true;
    }
    const localRoot = composer.parentElement?.parentElement;
    if (localRoot?.contains?.(control)) {
      score += 30;
      anchored = true;
    }

    const fieldRect = elementRect(composer);
    const controlRect = elementRect(control);
    if (fieldRect && controlRect) {
      const centerX = (controlRect.left + controlRect.right) / 2;
      const overlapsVertical = controlRect.bottom >= fieldRect.top - 24 && controlRect.top <= fieldRect.bottom + 24;
      const rightZone = centerX >= fieldRect.left + fieldRect.width * 0.55 && centerX <= fieldRect.right + 96;
      if (overlapsVertical && rightZone) {
        score += 140;
        anchored = true;
      }
      if (centerX >= fieldRect.right - 96) score += 60;
      if (centerX < fieldRect.left + fieldRect.width * 0.35) score -= 120;
    }
    return anchored ? score : Math.min(score, 90);
  }

  function semanticSendSelectors() {
    return [
      'button[data-pel-click="chat_send_message"]',
      '[data-hatch-composer-action="send"] button',
      'button[type="submit"]',
      'button[data-testid*="send" i]',
      '[role="button"][data-testid*="send" i]',
      'button[aria-label*="send" i]',
      '[role="button"][aria-label*="send" i]'
    ];
  }

  function findSendControl(composer, { allowDisabled = false, root = document } = {}) {
    const localScopes = [composer?.closest?.('form'), composer?.parentElement?.parentElement].filter(Boolean);
    const scopes = [...localScopes, root].filter(Boolean);
    const seen = new Set();
    const candidates = [];
    for (const scope of scopes) {
      let matches = [];
      try { matches = [...scope.querySelectorAll(semanticSendSelectors().join(','))]; } catch {}
      for (const control of matches) {
        if (seen.has(control)) continue;
        seen.add(control);
        candidates.push({ control, score: composerLocalControlScore(control, composer, { allowDisabled }) });
      }
    }
    for (const scope of localScopes) {
      let matches = [];
      try { matches = [...scope.querySelectorAll('button, [role="button"]')]; } catch {}
      for (const control of matches) {
        if (seen.has(control)) continue;
        seen.add(control);
        candidates.push({ control, score: composerLocalControlScore(control, composer, { allowDisabled }) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.find((entry) => entry.score >= 100)?.control || null;
  }

  function readySendControlExists(root = document) {
    const composer = findComposer(root);
    if (composer && findSendControl(composer, { root })) return true;
    return semanticSendSelectors().some((selector) => {
      try {
        return [...root.querySelectorAll(selector)]
          .some((control) => sendControlScore(control) >= 100);
      } catch {
        return false;
      }
    });
  }

  function generationLooksActive(root = document) {
    const stopSelectors = [
      'button[aria-label*="stop" i]',
      'button[data-testid*="stop" i]'
    ];
    if (stopSelectors.some((selector) => {
      try { return [...root.querySelectorAll(selector)].some(visible); }
      catch { return false; }
    })) return true;

    const busySelectors = [
      '[aria-busy="true"][data-testid*="message" i]',
      '[aria-busy="true"][data-testid*="assistant" i]'
    ];
    const busy = busySelectors.some((selector) => {
      try { return [...root.querySelectorAll(selector)].some(visible); }
      catch { return false; }
    });

    const statusSelectors = ['[data-testid*="working" i]', '[data-testid*="thinking" i]'];
    const statusActive = statusSelectors.some((selector) => {
      try {
        return [...root.querySelectorAll(selector)].some((node) => {
          if (!visible(node)) return false;
          const state = String(node.getAttribute?.('data-state') || '').toLowerCase();
          return node.getAttribute?.('aria-busy') === 'true'
            || ['active', 'loading', 'running', 'streaming'].includes(state)
            || !!node.closest?.('[aria-busy="true"]');
        });
      } catch {
        return false;
      }
    });

    if (!busy && !statusActive) return false;
    return !readySendControlExists(root);
  }

  const api = {
    visible,
    composerSelectors,
    metadata,
    usableComposer,
    composerScore,
    findComposer,
    isPrehydrationComposer,
    composerText,
    setComposerText,
    emitBeforeInput,
    composerContainsText,
    isDisabledControl,
    isUnsafeSendControl,
    findChatEntryControl,
    sendControlScore,
    elementRect,
    composerLocalControlScore,
    semanticSendSelectors,
    findSendControl,
    readySendControlExists,
    generationLooksActive
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeMuseInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
