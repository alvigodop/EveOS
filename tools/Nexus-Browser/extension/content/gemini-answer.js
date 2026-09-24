(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeGeminiAnswerLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeGeminiAnswerLoaded = true;

  const GEMINI_ASSISTANT_SELECTOR = [
    'model-response',
    'message-content',
    '.model-response-text',
    '.response-content',
    '[data-test-id="model-response"]',
    '.gemini-response'
  ].join(',');
  const AISTUDIO_ASSISTANT_SELECTOR = 'ms-chat-turn';
  const AISTUDIO_RESPONSE_SELECTOR = [
    'ms-cmark-node.cmark-node',
    '.turn-content ms-cmark-node',
    '.turn-content .cmark-node'
  ].join(',');
  const AISTUDIO_THOUGHT_ANCESTOR = [
    'ms-thought-viewer',
    'ms-thought-chunk',
    '[data-turn-role="Thought"]',
    '.thinking-container',
    '[class*="thought" i]',
    '[class*="thinking" i]'
  ].join(',');

  const SKIP_SELECTOR = [
    'script',
    'style',
    'button',
    '[role="button"]',
    '[aria-hidden="true"]',
    '.sr-only',
    '[class*="action" i]',
    '[class*="toolbar" i]',
    '[data-test-id*="action" i]',
    'ms-thought-chunk',
    'ms-thought-viewer',
    '.thinking-container',
    '[data-turn-role="Thought"]',
    '[class*="navigation-hint" i]',
    '[class*="turn-navigation" i]'
  ].join(',');

  function frontendFromUrl(url = globalThis.location?.href || '') {
    try {
      const host = new URL(url).hostname;
      return host === 'aistudio.google.com' ? 'aistudio' : 'gemini';
    } catch {
      return 'gemini';
    }
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

  function attr(node, name) {
    return String(node?.getAttribute?.(name) || '').toLowerCase();
  }

  function classText(node) {
    return String(node?.className || '').toLowerCase();
  }

  function parentChain(node) {
    const chain = [];
    for (let current = node; current; current = current.parentElement) chain.push(current);
    return chain;
  }

  function aiStudioTurn(node) {
    return parentChain(node).find((current) => String(current?.tagName || '').toUpperCase() === 'MS-CHAT-TURN') || null;
  }

  function aiStudioTurnRole(turn) {
    if (!turn) return '';
    const direct = attr(turn, 'data-turn-role');
    if (direct === 'user' || direct === 'model') return direct;
    const marked = turn.querySelector?.('[data-turn-role]');
    const nested = attr(marked, 'data-turn-role');
    if (nested === 'user' || nested === 'model') return nested;
    return '';
  }

  function isUserOwned(node, frontend = frontendFromUrl()) {
    if (!node) return false;
    if (frontend === 'aistudio') {
      const turn = aiStudioTurn(node);
      if (!turn) return false;
      if (aiStudioTurnRole(turn) === 'user') return true;
      const classes = classText(turn);
      if (classes.includes('user')) return true;
      if (turn.querySelector?.('.chat-turn-container.user')) return true;
      return false;
    }

    return parentChain(node).some((current) => {
      const tag = String(current?.tagName || '').toLowerCase();
      const classes = classText(current);
      const testId = attr(current, 'data-test-id');
      const author = attr(current, 'data-message-author');
      return tag === 'user-query'
        || classes.includes('user-query')
        || testId === 'user-query'
        || author === 'user';
    });
  }

  function hasAssistantMarker(node, frontend = frontendFromUrl()) {
    if (!node) return false;
    if (frontend === 'aistudio') {
      const turn = aiStudioTurn(node);
      if (!turn) return false;
      if (aiStudioTurnRole(turn) === 'model') return true;
      const classes = classText(turn);
      if (classes.includes('model')) return true;
      return !!turn.querySelector?.('.chat-turn-container.model');
    }

    const tag = String(node.tagName || '').toLowerCase();
    const classes = classText(node);
    const testId = attr(node, 'data-test-id');
    return tag === 'model-response'
      || tag === 'message-content'
      || testId === 'model-response'
      || classes.includes('model-response')
      || classes.includes('response-content')
      || classes.includes('gemini-response');
  }

  function isAssistantOwned(node, frontend = frontendFromUrl()) {
    if (!node || isUserOwned(node, frontend)) return false;
    if (frontend === 'aistudio') return hasAssistantMarker(node, frontend);
    return parentChain(node).some((current) => hasAssistantMarker(current, frontend));
  }

  function shouldSkip(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON') return true;
    if (node.getAttribute?.('role') === 'button' || node.getAttribute?.('aria-hidden') === 'true') return true;
    try { return !!node.matches?.(SKIP_SELECTOR); } catch { return false; }
  }

  function renderedDisplay(node) {
    if (!node || typeof getComputedStyle === 'undefined') return '';
    try { return String(getComputedStyle(node).display || '').toLowerCase(); } catch { return ''; }
  }

  function emojiAlt(node) {
    if (!node || node.nodeType !== 1) return '';
    const tag = String(node.tagName || '').toUpperCase();
    const role = attr(node, 'role');
    if (tag !== 'IMG' && role !== 'img') return '';
    const alt = String(node.getAttribute?.('alt') || node.getAttribute?.('aria-label') || '').trim();
    if (!alt || alt.length > 32) return '';
    try { return /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(alt) ? alt : ''; }
    catch { return alt.length <= 4 ? alt : ''; }
  }

  function codeLanguage(code) {
    const classes = String(code?.className || '');
    const match = classes.match(/(?:language-|lang-)([\w#+.-]+)/i);
    return match?.[1] || '';
  }

  function normalizeText(value) {
    const normalized = String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return normalized.replace(/^Gemini said\s*:?[ \t\n]*/i, '').trim();
  }

  function structuralText(root) {
    if (!root) return '';
    if (!root.childNodes || typeof root.childNodes[Symbol.iterator] !== 'function') {
      return normalizeText(root.innerText || root.textContent || '');
    }

    const paragraphTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
    const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'TABLE', 'TR', 'UL', 'OL']);
    const blockDisplays = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'flow-root']);
    let out = '';

    function newline(count = 1) {
      if (!out) return;
      const current = (out.match(/\n+$/) || [''])[0].length;
      if (current < count) out += '\n'.repeat(count - current);
    }

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        out += node.nodeValue || '';
        return;
      }
      if (node.nodeType !== 1 || shouldSkip(node)) return;

      const emoji = emojiAlt(node);
      if (emoji) {
        out += emoji;
        return;
      }

      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'BR') {
        newline(1);
        return;
      }
      if (tag === 'PRE') {
        const code = node.querySelector?.('code') || node;
        const text = String(code.innerText || code.textContent || '').replace(/^\n+|\n+$/g, '');
        if (!text) return;
        newline(2);
        out += `\`\`\`${codeLanguage(code)}\n${text}\n\`\`\``;
        newline(2);
        return;
      }
      if (tag === 'LI') {
        if (!String(node.textContent || '').trim()) return;
        newline(1);
        out += '• ';
        for (const child of node.childNodes) walk(child);
        newline(1);
        return;
      }

      const display = renderedDisplay(node);
      const paragraph = paragraphTags.has(tag);
      const block = blockTags.has(tag) || blockDisplays.has(display) || display.startsWith('table-');
      if (paragraph) newline(2);
      else if (block) newline(1);
      for (const child of node.childNodes) walk(child);
      if (paragraph) newline(2);
      else if (block) newline(1);
    }

    walk(root);
    return normalizeText(out);
  }

  function pruneNestedNodes(nodes) {
    return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains?.(node)));
  }

  function pruneAncestorNodes(nodes) {
    return nodes.filter((node) => !nodes.some((other) => other !== node && node.contains?.(other)));
  }

  function isTimingOnlyText(value) {
    return /^\d+(?:\.\d+)?s$/i.test(normalizeText(value));
  }

  function isAiStudioThoughtNode(node) {
    if (!node) return false;
    try {
      if (node.closest?.(AISTUDIO_THOUGHT_ANCESTOR)) return true;
    } catch {}
    const text = normalizeText(node.innerText || node.textContent || '');
    return /^(?:Thinking|Thoughts?|Expand to view model thoughts)(?:\b|$)/i.test(text);
  }

  function cleanAiStudioFallbackText(value) {
    let text = normalizeText(value)
      .replace(/^Model(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?\s*/i, '')
      .trim();
    text = text.replace(/(?:\s|\n)+(?:\d+(?:\.\d+)?s)(?:(?:\s|\n)+\d+(?:\.\d+)?s)*\s*$/i, '').trim();
    text = text.replace(/^(?:thinking(?:\s*thoughts?)?(?:\s*\.{3})?|thought(?:\s+for\s+\d+(?:\.\d+)?s)?|expand to view model thoughts)\s*/i, '').trim();
    text = text.replace(/(?:\s|\n)*info\s+Google AI models may make mistakes[\s\S]*$/i, '').trim();
    text = text.replace(/(?:\s|\n)*Use Arrow Up and Arrow Down to select a turn[\s\S]*$/i, '').trim();
    return isTimingOnlyText(text) || /^thinking$/i.test(text) ? '' : text;
  }

  function aiStudioTurnText(turn) {
    if (!turn?.querySelectorAll) return '';
    const preferred = pruneAncestorNodes([...turn.querySelectorAll(AISTUDIO_RESPONSE_SELECTOR)])
      .filter((node) => !isAiStudioThoughtNode(node))
      .filter((node) => visible(node) || String(node.textContent || '').trim())
      .map((node) => structuralText(node))
      .filter((text) => text && !isTimingOnlyText(text));
    if (preferred.length) return preferred.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

    const fallback = turn.querySelector?.('.turn-content, .chat-turn-container.model') || turn;
    return cleanAiStudioFallbackText(structuralText(fallback));
  }

  function assistantNodes(root = document, frontend = frontendFromUrl()) {
    if (!root?.querySelectorAll) return [];
    if (frontend === 'aistudio') {
      return [...root.querySelectorAll(AISTUDIO_ASSISTANT_SELECTOR)]
        .filter((node) => !isUserOwned(node, frontend))
        .filter((node) => isAssistantOwned(node, frontend))
        .filter((node) => visible(node) || String(node.textContent || '').trim());
    }

    const nodes = [...root.querySelectorAll(GEMINI_ASSISTANT_SELECTOR)]
      .filter((node) => !isUserOwned(node, frontend))
      .filter((node) => isAssistantOwned(node, frontend))
      .filter((node) => visible(node) || String(node.textContent || '').trim());
    return pruneNestedNodes(nodes);
  }

  function assistantText(node, frontend = frontendFromUrl()) {
    if (!node || isUserOwned(node, frontend) || !isAssistantOwned(node, frontend)) return '';
    if (frontend === 'aistudio') return aiStudioTurnText(aiStudioTurn(node) || node);
    return structuralText(node);
  }

  function getTurnAssistantText(nodes, baselineCount = 0, frontend = frontendFromUrl()) {
    if (!nodes || !nodes.length) return '';
    const target = baselineCount > 0 && nodes.length > baselineCount
      ? nodes.slice(baselineCount)
      : [nodes[nodes.length - 1]];
    return target
      .map((node) => assistantText(node, frontend))
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function latestAssistantText() {
    const frontend = frontendFromUrl();
    return getTurnAssistantText(assistantNodes(document, frontend), 0, frontend);
  }

  const api = {
    GEMINI_ASSISTANT_SELECTOR,
    AISTUDIO_ASSISTANT_SELECTOR,
    AISTUDIO_RESPONSE_SELECTOR,
    AISTUDIO_THOUGHT_ANCESTOR,
    frontendFromUrl,
    isUserOwned,
    hasAssistantMarker,
    isAssistantOwned,
    emojiAlt,
    normalizeText,
    structuralText,
    pruneNestedNodes,
    pruneAncestorNodes,
    isTimingOnlyText,
    isAiStudioThoughtNode,
    cleanAiStudioFallbackText,
    aiStudioTurnText,
    aiStudioTurnRole,
    assistantNodes,
    assistantText,
    getTurnAssistantText,
    latestAssistantText
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeGeminiAnswer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
