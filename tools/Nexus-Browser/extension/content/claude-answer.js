(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeClaudeAnswerLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeClaudeAnswerLoaded = true;

  const ASSISTANT_SELECTOR = [
    '.font-claude-response',
    '.font-claude-response-body',
    '[data-testid="ai-message"]',
    '[data-testid="message-assistant"]',
    '[data-testid="assistant-message"]',
    '.font-claude-message',
    '[data-testid="chat-message-content"]'
  ].join(',');
  const RESPONSE_BLOCK_SELECTOR = '.standard-markdown, .progressive-markdown';

  const SKIP_SELECTOR = [
    'script',
    'style',
    'button',
    '[role="button"]',
    '[aria-hidden="true"]',
    '.sr-only',
    '[data-message-action-bar]',
    '[data-testid*="action-bar" i]',
    '[data-testid*="thinking" i]',
    '[class*="thinking" i]'
  ].join(',');

  function visible(element) {
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect?.();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && (!rect || (rect.width > 0 && rect.height > 0));
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

  function isUserOwned(node) {
    return parentChain(node).some((current) => {
      const testId = attr(current, 'data-testid');
      const classes = classText(current);
      return testId === 'user-message'
        || testId === 'human-message'
        || testId === 'message-human'
        || classes.includes('font-user-message')
        || classes.includes('user-message');
    });
  }

  function hasAssistantMarker(node) {
    if (!node) return false;
    const testId = attr(node, 'data-testid');
    const classes = classText(node);
    return testId === 'ai-message'
      || testId === 'message-assistant'
      || testId === 'assistant-message'
      || testId === 'chat-message-content'
      || classes.includes('font-claude-response')
      || classes.includes('font-claude-message')
      || classes.includes('assistant-message');
  }

  function isAssistantOwned(node) {
    if (!node || isUserOwned(node)) return false;
    return parentChain(node).some(hasAssistantMarker);
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
    try {
      return /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(alt) ? alt : '';
    } catch {
      return alt.length <= 4 ? alt : '';
    }
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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

    function isBlock(node, tag) {
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
      if (tag === 'LI') {
        if (!String(node.textContent || '').trim()) return;
        newline(1);
        out += '• ';
        for (const child of node.childNodes) walk(child);
        newline(1);
        return;
      }

      const paragraph = paragraphTags.has(tag);
      const block = isBlock(node, tag);
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

  function assistantNodes(root = document) {
    if (!root?.querySelectorAll) return [];

    const responseBlocks = [...root.querySelectorAll(RESPONSE_BLOCK_SELECTOR)]
      .filter((node) => !isUserOwned(node))
      .filter((node) => isAssistantOwned(node))
      .filter((node) => visible(node) || String(node.textContent || '').trim());

    const general = [...root.querySelectorAll(ASSISTANT_SELECTOR)]
      .filter((node) => !isUserOwned(node))
      .filter((node) => isAssistantOwned(node))
      .filter((node) => visible(node) || String(node.textContent || '').trim())
      .filter((node) => !responseBlocks.some((block) => node !== block && node.contains?.(block)));

    return pruneNestedNodes([...responseBlocks, ...general]);
  }

  function assistantText(node) {
    if (!node || isUserOwned(node) || !isAssistantOwned(node)) return '';
    return structuralText(node);
  }

  function getTurnAssistantText(nodes, baselineCount = 0) {
    if (!nodes || !nodes.length) return '';
    const target = baselineCount > 0 && nodes.length > baselineCount
      ? nodes.slice(baselineCount)
      : [nodes[nodes.length - 1]];
    return target
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
    ASSISTANT_SELECTOR,
    RESPONSE_BLOCK_SELECTOR,
    isUserOwned,
    hasAssistantMarker,
    isAssistantOwned,
    emojiAlt,
    structuralText,
    pruneNestedNodes,
    assistantNodes,
    assistantText,
    getTurnAssistantText,
    latestAssistantText
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeClaudeAnswer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
