(() => {
  const FENCE_RE = /```([^\n]*)\n([\s\S]*?)\n```/g;

  function parseSegments(value) {
    const text = String(value || '');
    const segments = [];
    let lastIndex = 0;
    let match;
    FENCE_RE.lastIndex = 0;
    while ((match = FENCE_RE.exec(text))) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
      }
      segments.push({
        type: 'code',
        language: String(match[1] || '').trim(),
        text: match[2]
      });
      lastIndex = FENCE_RE.lastIndex;
    }
    if (lastIndex < text.length) segments.push({ type: 'text', text: text.slice(lastIndex) });
    return segments;
  }

  function appendText(container, value) {
    const text = String(value || '').replace(/^\n+|\n+$/g, '');
    if (!text) return;
    const node = document.createElement('div');
    node.className = /^Output\s*$/i.test(text.trim())
      ? 'activity-code-output-label'
      : 'activity-code-narration';
    node.textContent = text;
    container.append(node);
  }

  function appendCode(container, segment) {
    const block = document.createElement('div');
    block.className = 'activity-code-block';
    if (segment.language) {
      const label = document.createElement('div');
      label.className = 'activity-code-label';
      label.textContent = segment.language;
      block.append(label);
    }
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = segment.text;
    pre.append(code);
    block.append(pre);
    container.append(block);
  }

  function renderNode(node) {
    if (!node || node.dataset.activityCodeRendered === '1') return;
    const source = node.textContent || '';
    if (!source.includes('```')) return;
    const segments = parseSegments(source);
    if (!segments.some((segment) => segment.type === 'code')) return;

    node.replaceChildren();
    node.dataset.activityCodeRendered = '1';
    for (const segment of segments) {
      if (segment.type === 'code') appendCode(node, segment);
      else appendText(node, segment.text);
    }
  }

  function scan(root = document) {
    if (!root?.querySelectorAll) return;
    if (root.matches?.('.activity-thought-text')) renderNode(root);
    for (const node of root.querySelectorAll('.activity-thought-text')) renderNode(node);
  }

  if (typeof document !== 'undefined') {
    const start = () => {
      scan(document);
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes || []) {
            if (node.nodeType === 1) scan(node);
          }
        }
      });
      observer.observe(document.body, { subtree: true, childList: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  const api = { parseSegments, renderNode, scan };
  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeActivityCodeRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
