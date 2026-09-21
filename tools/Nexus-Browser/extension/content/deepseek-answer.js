(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeDeepSeekAnswerLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeDeepSeekAnswerLoaded = true;

  function visible(element) {
    const shared = globalThis.BrowserAiBridgeDeepSeekInput?.visible;
    if (shared) return shared(element);
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect?.();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && (!rect || (rect.width > 0 && rect.height > 0));
  }

  function pruneNestedNodes(nodes) {
    return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
  }

  function assistantNodes() {
    const nodes = [...document.querySelectorAll('.ds-markdown, [class*="ds-markdown"]')].filter((node) => {
      return visible(node)
        && !node.closest('.ds-think-content')
        && !node.closest('[class*="think"]')
        && !node.closest('[class*="thought"]');
    });
    return pruneNestedNodes(nodes);
  }

  function isCitationPunctuationOnly(text) {
    return /^[\s\-\–\—\(\)\[\]\,\:\.\/\|\•\*]*$/.test(text || '');
  }

  function looksLikeCitationControl(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = (node.tagName || '').toUpperCase();
    const className = String(node.className || '');
    const dataTestId = String(node.getAttribute?.('data-testid') || '');
    const ariaLabel = String(node.getAttribute?.('aria-label') || '');
    const title = String(node.getAttribute?.('title') || '');
    const meta = `${className} ${dataTestId} ${ariaLabel} ${title}`;

    if (/citation|reference|source-pill|source-tag|source-item|source-card/i.test(meta)) return true;

    if (tag === 'SUP') {
      if (node.querySelector?.('a, button, [role="button"], svg')) return true;
      const text = (node.textContent || '').trim();
      if (/^[-\[]?\d+[\]]?$/.test(text)) return true;
    }

    if (tag === 'A') {
      const text = (node.textContent || '').trim();
      const href = String(node.getAttribute?.('href') || '');
      const parentTag = (node.parentElement?.tagName || '').toUpperCase();
      const parentMeta = `${node.parentElement?.className || ''} ${node.parentElement?.getAttribute?.('aria-label') || ''}`;

      if (/^[-\[]?\d+[\]]?$/.test(text)) return true;

      const hasIcon = (!text || text.length === 0)
        && (node.querySelector?.('svg, img, [class*="icon" i]') || node.childNodes.length === 0);
      if (hasIcon) {
        if (parentTag === 'SUP'
          || /citation|reference|source/i.test(`${meta} ${parentMeta} ${href}`)
          || !href
          || href.startsWith('#')) {
          return true;
        }
      }

      if (parentTag === 'SUP' || /citation|reference|source/i.test(`${meta} ${parentMeta} ${href}`)) {
        return true;
      }
    }

    return false;
  }

  function removeCitationAndWrapper(targetNode) {
    if (!targetNode || !targetNode.parentNode) return;

    let nodeToRemove = targetNode;
    let current = targetNode.parentElement;

    while (current && current.nodeType === 1 && current.tagName) {
      const tag = current.tagName.toUpperCase();
      if (['P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'TD', 'TH', 'BODY'].includes(tag)) break;

      let clone = null;
      try { clone = current.cloneNode(true); } catch {}
      if (clone) {
        clone.querySelectorAll('*').forEach((child) => {
          if (looksLikeCitationControl(child)) child.remove();
        });
        const remainingText = (clone.textContent || '').trim();
        if (isCitationPunctuationOnly(remainingText)) {
          nodeToRemove = current;
          current = current.parentElement;
          continue;
        }
      }
      break;
    }

    let prev = nodeToRemove.previousSibling;
    while (prev && prev.nodeType === 3 && !prev.nodeValue?.trim()) prev = prev.previousSibling;
    if (prev) {
      if (prev.nodeType === 3 && prev.nodeValue) {
        prev.nodeValue = prev.nodeValue.replace(/[\s\-\–\—\[\(]+$/, '');
      } else if (prev.nodeType === 1 && isCitationPunctuationOnly(prev.textContent || '')) {
        const toDelete = prev;
        prev = prev.previousSibling;
        toDelete.remove();
        if (prev && prev.nodeType === 3 && prev.nodeValue) {
          prev.nodeValue = prev.nodeValue.replace(/[\s\-\–\—\[\(]+$/, '');
        }
      }
    }

    let next = nodeToRemove.nextSibling;
    while (next && next.nodeType === 3 && !next.nodeValue?.trim()) next = next.nextSibling;
    if (next && next.nodeType === 3 && next.nodeValue) {
      next.nodeValue = next.nodeValue.replace(/^[\s\-\–\—\]\)]+/, '');
    }

    nodeToRemove.remove();
  }

  function cleanAnswerClone(node) {
    if (!node) return null;
    const clone = node.cloneNode(true);
    clone.querySelectorAll([
      '.ds-think-content',
      '[class*="think"]',
      '[class*="thought"]',
      'script',
      'style',
      'button',
      '[role="button"]',
      '[class*="citation" i]',
      '[class*="reference" i]',
      '[data-testid*="citation" i]',
      '[data-testid*="reference" i]',
      '[aria-label*="citation" i]',
      '[aria-label*="reference" i]'
    ].join(',')).forEach((child) => child.remove());

    for (const candidate of [...clone.querySelectorAll('a, sup, span')]) {
      if (looksLikeCitationControl(candidate)) removeCitationAndWrapper(candidate);
    }
    return clone;
  }

  function structuralText(root) {
    if (!root) return '';
    const paragraphTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
    const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'PRE', 'TABLE', 'TR']);
    let out = '';
    let atListItemStart = false;
    let liDepth = 0;

    function newline(count = 1) {
      if (!out) return;
      const current = (out.match(/\n+$/) || [''])[0].length;
      if (current < count) out += '\n'.repeat(count - current);
    }

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        const val = node.nodeValue || '';
        if (val) {
          out += val;
          if (val.trim()) atListItemStart = false;
        }
        return;
      }
      if (node.nodeType !== 1) return;

      const tag = (node.tagName || '').toUpperCase();
      if (tag === 'BR') {
        newline(1);
        atListItemStart = false;
        return;
      }

      if (tag === 'LI') {
        if (!node.textContent || !node.textContent.trim()) return;
        newline(1);
        const parent = node.parentElement;
        if (parent && (parent.tagName || '').toUpperCase() === 'OL') {
          const children = parent.children
            ? [...parent.children]
            : [...(parent.childNodes || [])].filter((child) => child.nodeType === 1);
          const siblings = children.filter((child) => (child.tagName || '').toUpperCase() === 'LI');
          out += `${Math.max(1, siblings.indexOf(node) + 1)}. `;
        } else {
          out += '• ';
        }

        const prevAtStart = atListItemStart;
        atListItemStart = true;
        liDepth += 1;
        for (const child of node.childNodes) walk(child);
        liDepth -= 1;
        atListItemStart = prevAtStart;
        newline(1);
        return;
      }

      const isParagraph = paragraphTags.has(tag);
      const isBlock = blockTags.has(tag);
      if (isParagraph || isBlock) {
        if (!atListItemStart) newline(liDepth > 0 ? 1 : (isParagraph ? 2 : 1));
        for (const child of node.childNodes) walk(child);
        newline(liDepth > 0 ? 1 : (isParagraph ? 2 : 1));
        return;
      }

      for (const child of node.childNodes) walk(child);
    }

    walk(root);
    return out
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function assistantText(node) {
    if (!node) return '';
    return structuralText(cleanAnswerClone(node));
  }

  function getTurnAssistantText(nodes, baselineCount = 0) {
    if (!nodes || !nodes.length) return '';
    let targetNodes = [];
    if (baselineCount > 0 && nodes.length > baselineCount) {
      targetNodes = nodes.slice(baselineCount);
    } else {
      const lastNode = nodes[nodes.length - 1];
      const container = lastNode.closest('[class*="message" i], [class*="chat-turn" i], [class*="item" i]')
        || lastNode.parentElement?.parentElement;
      if (container) {
        const containerNodes = pruneNestedNodes([
          ...container.querySelectorAll('.ds-markdown, [class*="ds-markdown"]')
        ].filter((node) => {
          return visible(node)
            && !node.closest('.ds-think-content')
            && !node.closest('[class*="think"]')
            && !node.closest('[class*="thought"]');
        }));
        if (containerNodes.length > 0) targetNodes = containerNodes;
      }
      if (!targetNodes.length) targetNodes = [lastNode];
    }

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
    pruneNestedNodes,
    assistantNodes,
    isCitationPunctuationOnly,
    looksLikeCitationControl,
    removeCitationAndWrapper,
    cleanAnswerClone,
    structuralText,
    assistantText,
    getTurnAssistantText,
    latestAssistantText
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeDeepSeekAnswer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
