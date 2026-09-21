(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeGrokAnswerLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeGrokAnswerLoaded = true;

  const X_COPY_SELECTOR = [
    'button[aria-label="Copy text"]',
    '[role="button"][aria-label="Copy text"]',
    'button[aria-label*="copy" i]',
    '[role="button"][aria-label*="copy" i]',
    '[data-testid*="copy" i]'
  ].join(',');
  const X_FOLLOWUPS_SELECTOR = '[data-testid="follow_ups_list"]';
  const SKIP_RENDER_SELECTOR = [
    'script',
    'style',
    'button',
    '[role="button"]',
    '[aria-hidden="true"]',
    '.thinking-container',
    'a.citation',
    'button.no-copy',
    '[data-testid="follow_ups_list"]',
    '[data-testid*="followup" i]',
    '[class*="suggest" i]'
  ].join(',');

  function visible(element) {
    const shared = globalThis.BrowserAiBridgeGrokInput?.visible;
    if (shared) return shared(element);
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect?.();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && (!rect || (rect.width > 0 && rect.height > 0));
  }

  function nodeHref(node) {
    return node?.ownerDocument?.location?.href
      || (typeof location !== 'undefined' ? location.href : '');
  }

  function rootHref(root) {
    return root?.location?.href
      || root?.ownerDocument?.location?.href
      || (typeof location !== 'undefined' ? location.href : '');
  }

  function isXGrokUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'x.com' && parsed.pathname.startsWith('/i/grok');
    } catch {
      return false;
    }
  }

  function testId(node) {
    return String(node?.getAttribute?.('data-testid') || '').toLowerCase();
  }

  function classText(node) {
    return String(node?.className || '').toLowerCase();
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function shouldSkipRenderedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON') return true;
    if (node.getAttribute?.('role') === 'button' || node.getAttribute?.('aria-hidden') === 'true') return true;
    try { return !!node.matches?.(SKIP_RENDER_SELECTOR); } catch { return false; }
  }

  function renderedDisplay(node) {
    if (!node || typeof getComputedStyle === 'undefined') return '';
    try { return String(getComputedStyle(node).display || '').toLowerCase(); } catch { return ''; }
  }

  function renderedEmojiText(node) {
    if (!node || node.nodeType !== 1) return '';
    const tag = String(node.tagName || '').toUpperCase();
    const role = String(node.getAttribute?.('role') || '').toLowerCase();
    if (tag !== 'IMG' && role !== 'img') return '';
    const label = String(node.getAttribute?.('alt') || node.getAttribute?.('aria-label') || '').trim();
    if (!label || label.length > 32) return '';
    try {
      return /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(label) ? label : '';
    } catch {
      return /[\u203C-\u3299]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/.test(label) ? label : '';
    }
  }

  function structuralText(root) {
    if (!root) return '';
    if (!root.childNodes || typeof root.childNodes[Symbol.iterator] !== 'function') {
      return normalizeText(root.innerText || root.textContent || '');
    }

    const paragraphTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
    const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'PRE', 'TABLE', 'TR', 'UL', 'OL']);
    const blockDisplays = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'flow-root']);
    let out = '';

    function newline(count = 1) {
      if (!out) return;
      const current = (out.match(/\n+$/) || [''])[0].length;
      if (current < count) out += '\n'.repeat(count - current);
    }

    function isVisualBlock(node, tag) {
      if (blockTags.has(tag)) return true;
      const display = renderedDisplay(node);
      return blockDisplays.has(display) || display.startsWith('table-');
    }

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        out += node.nodeValue || '';
        return;
      }
      if (node.nodeType !== 1 || shouldSkipRenderedNode(node)) return;

      const tag = String(node.tagName || '').toUpperCase();
      const emojiText = renderedEmojiText(node);
      if (emojiText) {
        out += emojiText;
        return;
      }
      if (tag === 'BR') {
        newline(1);
        return;
      }
      if (tag === 'LI') {
        if (!compactText(node.textContent)) return;
        newline(1);
        out += '• ';
        for (const child of node.childNodes) walk(child);
        newline(1);
        return;
      }

      const isParagraph = paragraphTags.has(tag);
      const isBlock = isVisualBlock(node, tag);
      if (isParagraph) newline(2);
      else if (isBlock) newline(1);
      for (const child of node.childNodes) walk(child);
      if (isParagraph) newline(2);
      else if (isBlock) newline(1);
    }

    walk(root);
    return normalizeText(out);
  }

  function pruneNestedNodes(nodes) {
    return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains?.(node)));
  }

  function explicitUserOwner(node) {
    if (!node) return null;
    if (/^(?:user|user-message)$/.test(testId(node))) return node;
    return node.closest?.('[data-testid="user-message"]')
      || node.closest?.('[data-testid="user"]')
      || null;
  }

  function explicitAssistantOwner(node) {
    if (!node) return null;
    if (/^(?:assistant|assistant-message)$/.test(testId(node))) return node;
    return node.closest?.('[data-testid="assistant-message"]')
      || node.closest?.('[data-testid="assistant"]')
      || null;
  }

  function messageBubble(node) {
    if (!node) return null;
    if (classText(node).includes('message-bubble')) return node;
    return node.closest?.('.message-bubble') || null;
  }

  function isUserOwned(node) {
    return !!explicitUserOwner(node);
  }

  function hasXAssistantSignal(node) {
    if (!node) return false;
    const ownAria = String(node.getAttribute?.('aria-label') || '').toLowerCase();
    const ownTestId = testId(node);
    if (/copy text|^copy$/.test(ownAria) || ownTestId.includes('copy')) return true;
    return !!node.querySelector?.(`${X_COPY_SELECTOR}, ${X_FOLLOWUPS_SELECTOR}`);
  }

  function actionOnlyText(text) {
    const compact = compactText(text).toLowerCase();
    if (!compact) return true;
    return /^(?:copy(?: text)?|share|like|dislike|retry|regenerate|more|bookmark)(?:\s+(?:copy(?: text)?|share|like|dislike|retry|regenerate|more|bookmark))*$/.test(compact);
  }

  function xTurnForSignal(signal) {
    if (!signal || !isXGrokUrl(nodeHref(signal))) return null;
    let cursor = signal.parentElement;
    let fallback = null;
    for (let depth = 0; cursor && depth < 10; depth += 1, cursor = cursor.parentElement) {
      if (explicitUserOwner(cursor)) return null;
      if (cursor.matches?.('body, main') || cursor.tagName === 'BODY' || cursor.tagName === 'MAIN') break;
      if (cursor.querySelector?.('textarea, [contenteditable="true"]')) continue;

      const text = compactText(cursor.innerText || cursor.textContent);
      if (!text || actionOnlyText(text)) continue;
      fallback = cursor;

      const responseChild = cursor.querySelector?.([
        '.response-content-markdown',
        '[data-testid="answer"]',
        '[data-testid="assistant"]',
        '.prose.text-pretty',
        '[class*="response-content"]'
      ].join(','));
      if (responseChild) return cursor;

      return cursor;
    }
    return fallback;
  }

  function xAssistantTurnsFromSignals(root = document) {
    if (!root?.querySelectorAll || !isXGrokUrl(rootHref(root))) return [];
    const signals = [
      ...root.querySelectorAll(X_COPY_SELECTOR),
      ...root.querySelectorAll(X_FOLLOWUPS_SELECTOR)
    ];
    const turns = [];
    for (const signal of signals) {
      const turn = xTurnForSignal(signal);
      if (turn && !turns.includes(turn) && !isUserOwned(turn)) turns.push(turn);
    }
    return turns;
  }

  function isXAssistantFallback(node, href = nodeHref(node)) {
    if (!node || !isXGrokUrl(href) || explicitUserOwner(node)) return false;
    if (explicitAssistantOwner(node)) return true;
    if (hasXAssistantSignal(node)) return true;

    const bubble = messageBubble(node);
    if (!bubble || explicitUserOwner(bubble)) return false;
    const bubbleTestId = testId(bubble);
    if (bubbleTestId.includes('user')) return false;
    if (bubbleTestId.includes('assistant')) return true;
    if (/\bbg-surface-l1\b/.test(classText(bubble))) return false;

    const responseChild = bubble.querySelector?.([
      '.response-content-markdown',
      '[data-testid="answer"]',
      '[data-testid="assistant"]',
      '.prose.text-pretty',
      '[class*="response-content"]'
    ].join(','));
    if (responseChild) return true;

    return compactText(bubble.innerText || bubble.textContent).length > 0;
  }

  function isAssistantOwned(node) {
    return !!explicitAssistantOwner(node) || isXAssistantFallback(node);
  }

  function hasRenderedText(node) {
    if (!node) return false;
    const text = compactText(node.innerText || node.textContent);
    const emoji = renderedEmojiText(node)
      || [...(node.querySelectorAll?.('img, [role="img"]') || [])].map(renderedEmojiText).find(Boolean);
    if (!text && !emoji) return false;
    if (visible(node)) return true;
    const descendants = [...(node.querySelectorAll?.('*') || [])];
    return descendants.some((child) => visible(child) && (compactText(child.innerText || child.textContent) || renderedEmojiText(child)));
  }

  function responseNodeForAssistantTurn(turn) {
    if (!turn || !isAssistantOwned(turn) || isUserOwned(turn)) return null;
    const selectors = [
      '.response-content-markdown',
      '[data-testid="grok-response"]',
      '[data-testid="answer"]',
      '.chat-md',
      '.markdown',
      '.prose.text-pretty',
      '[class*="response-content"]'
    ];
    for (const selector of selectors) {
      const node = turn.querySelector?.(selector);
      if (node && !isUserOwned(node)) return node;
    }
    return turn;
  }

  function relatedToExplicit(node, explicitTurns) {
    return explicitTurns.some((turn) => turn === node || turn.contains?.(node) || node.contains?.(turn));
  }

  function assistantTurns(root = document) {
    if (!root?.querySelectorAll) return [];
    const explicitTurns = [
      ...root.querySelectorAll('[data-testid="assistant-message"]'),
      ...root.querySelectorAll('[data-testid="assistant"]')
    ].filter((node, index, all) => all.indexOf(node) === index && !isUserOwned(node));

    if (!isXGrokUrl(rootHref(root))) return explicitTurns.filter(isAssistantOwned);

    const signalTurns = xAssistantTurnsFromSignals(root)
      .filter((node) => !relatedToExplicit(node, explicitTurns));
    const bubbleTurns = signalTurns.length ? [] : [...root.querySelectorAll('.message-bubble')]
      .filter((node) => isXAssistantFallback(node) && !relatedToExplicit(node, explicitTurns));

    return [...explicitTurns.filter(isAssistantOwned), ...pruneNestedNodes([...signalTurns, ...bubbleTurns])];
  }

  function assistantNodes(root = document) {
    const nodes = assistantTurns(root)
      .map(responseNodeForAssistantTurn)
      .filter((node) => node && hasRenderedText(node) && isAssistantOwned(node) && !isUserOwned(node));
    return pruneNestedNodes(nodes);
  }

  function cleanClone(node) {
    if (!node) return null;
    const clone = node.cloneNode(true);
    clone.querySelectorAll(SKIP_RENDER_SELECTOR).forEach((child) => child.remove());
    return clone;
  }

  function assistantText(node) {
    if (!node || isUserOwned(node) || !isAssistantOwned(node)) return '';
    // Walk the live rendered tree instead of a detached clone so CSS block/flex
    // layout on X Grok can contribute line boundaries without mutating the page.
    return structuralText(node);
  }

  function getTurnAssistantText(nodes, baselineCount = 0) {
    if (!nodes || !nodes.length) return '';
    const targetNodes = baselineCount > 0 && nodes.length > baselineCount
      ? nodes.slice(baselineCount)
      : [nodes[nodes.length - 1]];
    return targetNodes
      .map(assistantText)
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function latestAssistantText() {
    return getTurnAssistantText(assistantNodes(), 0);
  }

  const api = {
    assistantTurns,
    assistantNodes,
    responseNodeForAssistantTurn,
    isUserOwned,
    isAssistantOwned,
    isXAssistantFallback,
    isXGrokUrl,
    hasXAssistantSignal,
    xTurnForSignal,
    xAssistantTurnsFromSignals,
    hasRenderedText,
    cleanClone,
    structuralText,
    shouldSkipRenderedNode,
    renderedDisplay,
    renderedEmojiText,
    assistantText,
    getTurnAssistantText,
    latestAssistantText,
    pruneNestedNodes
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeGrokAnswer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
