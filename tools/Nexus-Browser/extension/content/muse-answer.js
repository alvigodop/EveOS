(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeMuseAnswerLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeMuseAnswerLoaded = true;

  const ASSISTANT_SELECTOR = [
    '[data-message-author-role="assistant"]',
    '[data-message-role="assistant"]',
    '[data-role="assistant"]',
    '[data-author="assistant"]',
    '[data-sender="muse"]',
    '[data-testid*="assistant-message" i]',
    '[data-testid*="muse-message" i]',
    '[class*="assistant-message" i]',
    '[class*="muse-message" i]'
  ].join(',');

  const USER_SELECTOR = [
    '[data-message-author-role="user"]',
    '[data-message-role="user"]',
    '[data-role="user"]',
    '[data-author="user"]',
    '[data-sender="user"]',
    '[data-sender="human"]',
    '[data-testid*="user-message" i]',
    '[data-testid*="human-message" i]',
    '[class*="user-message" i]',
    '[class*="human-message" i]'
  ].join(',');

  const CONTENT_SELECTOR = [
    '[data-message-content]',
    '[data-testid*="message-content" i]',
    '.markdown', '.prose', '[class*="markdown" i]', '[class*="message-content" i]'
  ].join(',');

  const SKIP_SELECTOR = [
    'script', 'style', 'button', '[role="button"]', '[aria-hidden="true"]', 'svg',
    '[data-testid*="action" i]', '[data-testid*="copy" i]', '[data-testid*="approval" i]',
    '[data-testid*="permission" i]', '[class*="approval" i]', '[class*="permission" i]'
  ].join(',');

  function visible(element) {
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    try {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = element.getBoundingClientRect?.();
      if (!rect) return true;
      const unrendered = typeof window !== 'undefined'
        && (window.outerWidth === 0 || window.outerHeight === 0 || (typeof document !== 'undefined' && document.visibilityState === 'hidden'));
      if (unrendered) return true;
      return rect.width > 0 && rect.height > 0;
    } catch {
      return true;
    }
  }

  function attr(node, name) {
    return String(node?.getAttribute?.(name) || '').trim().toLowerCase();
  }

  function classText(node) {
    return String(node?.className || '').toLowerCase();
  }

  function testId(node) {
    return attr(node, 'data-testid');
  }

  function parentChain(node) {
    const chain = [];
    for (let current = node; current; current = current.parentElement) chain.push(current);
    return chain;
  }

  function roleValue(node) {
    return attr(node, 'data-message-author-role')
      || attr(node, 'data-message-role')
      || attr(node, 'data-role')
      || attr(node, 'data-author')
      || attr(node, 'data-sender');
  }

  function hasUserMarker(node) {
    const role = roleValue(node);
    const meta = `${classText(node)} ${testId(node)}`;
    return /^(user|human|you)$/.test(role) || /(^|[-_ ])(user|human)([-_ ]|$)/.test(meta);
  }

  function hasAssistantMarker(node) {
    const role = roleValue(node);
    const meta = `${classText(node)} ${testId(node)}`;
    return /^(assistant|agent|muse)$/.test(role)
      || /(^|[-_ ])(assistant|agent|muse)([-_ ]|$)/.test(meta);
  }

  function isUserOwned(node) {
    return parentChain(node).some(hasUserMarker);
  }

  function isAssistantOwned(node) {
    if (!node || isUserOwned(node)) return false;
    return parentChain(node).some(hasAssistantMarker);
  }

  function shouldSkip(node) {
    if (!node || node.nodeType !== 1) return false;
    try { return !!node.matches?.(SKIP_SELECTOR); }
    catch { return false; }
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function codeLanguage(node) {
    const direct = node?.getAttribute?.('data-language') || node?.getAttribute?.('data-lang') || '';
    if (direct) return String(direct).trim();
    const match = String(node?.className || '').match(/(?:language|lang)-([\w+-]+)/i);
    return match?.[1] || '';
  }

  function structuralText(root) {
    if (!root) return '';
    if (!root.childNodes || typeof root.childNodes[Symbol.iterator] !== 'function') {
      return normalizeText(root.innerText || root.textContent || '');
    }

    const paragraphTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
    const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'TABLE', 'TR', 'UL', 'OL']);
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
      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'BR') return newline(1);
      if (tag === 'PRE') {
        const code = node.querySelector?.('code') || node;
        const text = String(code.innerText || code.textContent || '').replace(/^\n+|\n+$/g, '');
        if (!text) return;
        newline(2);
        out += `\`\`\`${codeLanguage(code)}\n${text}\n\`\`\``;
        return newline(2);
      }
      if (tag === 'LI') {
        if (!String(node.textContent || '').trim()) return;
        newline(1);
        out += '• ';
        for (const child of node.childNodes) walk(child);
        return newline(1);
      }
      const paragraph = paragraphTags.has(tag);
      const block = blockTags.has(tag);
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

  function contentNodesForTurn(turn) {
    if (!turn?.querySelectorAll) return [];
    const blocks = [...turn.querySelectorAll(CONTENT_SELECTOR)]
      .filter((node) => !isUserOwned(node))
      .filter((node) => visible(node) || String(node.textContent || '').trim());
    return pruneNestedNodes(blocks);
  }

  function assistantNodes(root = document) {
    if (!root?.querySelectorAll) return [];
    let turns = [];
    try { turns = [...root.querySelectorAll(ASSISTANT_SELECTOR)]; } catch {}
    turns = turns
      .filter((turn) => !isUserOwned(turn))
      .filter((turn) => isAssistantOwned(turn))
      .filter((turn) => visible(turn) || String(turn.textContent || '').trim());

    const nodes = [];
    for (const turn of pruneNestedNodes(turns)) {
      const blocks = contentNodesForTurn(turn);
      if (blocks.length) nodes.push(...blocks);
      else nodes.push(turn);
    }
    return pruneNestedNodes(nodes);
  }

  function assistantText(node) {
    if (!node || isUserOwned(node) || !isAssistantOwned(node)) return '';
    return structuralText(node);
  }

  function userNodes(root = document) {
    if (!root?.querySelectorAll) return [];
    let turns = [];
    try { turns = [...root.querySelectorAll(USER_SELECTOR)]; } catch {}
    return pruneNestedNodes(turns
      .filter((turn) => isUserOwned(turn))
      .filter((turn) => visible(turn) || String(turn.textContent || '').trim()));
  }

  function userText(node) {
    if (!node || !isUserOwned(node)) return '';
    return structuralText(node);
  }

  function getTurnUserText(nodes, baselineCount = 0) {
    if (!nodes?.length || nodes.length <= baselineCount) return '';
    return nodes.slice(baselineCount)
      .map(userText)
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getTurnAssistantText(nodes, baselineCount = 0) {
    if (!nodes?.length) return '';
    const target = baselineCount > 0 && nodes.length > baselineCount
      ? nodes.slice(baselineCount)
      : [nodes[nodes.length - 1]];
    return target.map(assistantText).filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function latestAssistantText() {
    return getTurnAssistantText(assistantNodes(), 0);
  }

  function approvalNodes(root = document) {
    if (!root?.querySelectorAll) return [];
    const selectors = [
      '[data-testid*="approval" i]', '[data-testid*="permission" i]',
      '[class*="approval" i]', '[class*="permission" i]'
    ].join(',');
    try {
      return pruneNestedNodes([...root.querySelectorAll(selectors)].filter(visible));
    } catch {
      return [];
    }
  }

  const api = {
    ASSISTANT_SELECTOR,
    USER_SELECTOR,
    CONTENT_SELECTOR,
    roleValue,
    hasUserMarker,
    hasAssistantMarker,
    isUserOwned,
    isAssistantOwned,
    normalizeText,
    structuralText,
    pruneNestedNodes,
    contentNodesForTurn,
    assistantNodes,
    assistantText,
    userNodes,
    userText,
    getTurnUserText,
    getTurnAssistantText,
    latestAssistantText,
    approvalNodes
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeMuseAnswer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
