(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeClaudeActivitySearchLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeClaudeActivitySearchLoaded = true;

  const DOMAIN_RE = /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?$/i;

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function nodeText(node) {
    return compactText(node?.innerText || node?.textContent || '');
  }

  function queryCount(root, selector) {
    try { return root?.querySelectorAll?.(selector)?.length || 0; } catch { return 0; }
  }

  function toolSurfaceScore(node) {
    if (!node) return 0;
    let score = 0;
    score += queryCount(node, '[class*="group/row"]') * 4;
    score += queryCount(node, 'img[alt="favicon"], img[alt*="favicon" i], img[src*="favicon" i]') * 4;
    score += queryCount(node, 'pre, code') * 2;
    score += queryCount(node, 'button[class*="group/status"], [aria-expanded]') * 2;
    const text = nodeText(node);
    if (/\bOutput\b/i.test(text)) score += 2;
    if (/\b(?:bash|python|javascript|shell|command)\b/i.test(text)) score += 1;
    return score;
  }

  function toolQueryLines(widget) {
    if (!widget?.querySelectorAll) return [];
    const seen = new Set();
    const lines = [];
    for (const row of widget.querySelectorAll('[class*="group/row"]')) {
      const query = nodeText(row.querySelector?.('.truncate'));
      if (!query) continue;
      const count = nodeText(row.querySelector?.('p'));
      const line = count && count !== query ? `${query} (${count})` : query;
      if (seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
    return lines;
  }

  function resultRowFromIcon(image, widget) {
    let current = image?.parentElement || null;
    for (let depth = 0; current && current !== widget && depth < 5; depth += 1) {
      const children = [...(current.children || [])];
      const texts = children.map(nodeText).filter(Boolean);
      if (texts.length >= 2 && texts.some((text) => DOMAIN_RE.test(text))) return current;
      current = current.parentElement;
    }
    return image?.parentElement?.parentElement || null;
  }

  function resultDataFromRow(row) {
    if (!row) return null;
    const children = [...(row.children || [])];
    let domain = '';
    let title = '';

    for (const child of children) {
      const text = nodeText(child);
      if (!text) continue;
      if (!domain && DOMAIN_RE.test(text)) domain = text;
    }

    const truncate = row.querySelector?.('.truncate, [class*="truncate"]');
    if (truncate) title = nodeText(truncate);
    if (!title) {
      for (const child of children) {
        const text = nodeText(child);
        if (!text || text === domain || DOMAIN_RE.test(text)) continue;
        if (child.querySelector?.('img')) continue;
        title = text;
        break;
      }
    }

    if (!title && domain) title = domain;
    if (!title) return null;

    const anchor = row.closest?.('a[href]') || row.querySelector?.('a[href]');
    const href = anchor?.href || anchor?.getAttribute?.('href') || '';
    return { title, domain, href: /^https?:/i.test(href) ? href : '' };
  }

  function toolResultRows(widget) {
    if (!widget?.querySelectorAll) return [];
    const seen = new Set();
    const rows = [];

    function add(data) {
      if (!data?.title) return;
      const key = `${data.title}\n${data.domain}\n${data.href}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(data);
    }

    const icons = widget.querySelectorAll(
      'img[alt="favicon"], img[alt*="favicon" i], img[src*="favicon" i]'
    );
    for (const image of icons) add(resultDataFromRow(resultRowFromIcon(image, widget)));

    const domainCandidates = widget.querySelectorAll(
      '[class*="text-text-400"], [class*="text-xs"], [data-testid*="domain" i]'
    );
    for (const domainNode of domainCandidates) {
      const domain = nodeText(domainNode);
      if (!DOMAIN_RE.test(domain)) continue;
      let row = domainNode.parentElement;
      for (let depth = 0; row && row !== widget && depth < 3; depth += 1) {
        const data = resultDataFromRow(row);
        if (data && data.domain) {
          add(data);
          break;
        }
        row = row.parentElement;
      }
    }

    return rows;
  }

  const api = {
    DOMAIN_RE,
    compactText,
    nodeText,
    queryCount,
    toolSurfaceScore,
    toolQueryLines,
    resultRowFromIcon,
    resultDataFromRow,
    toolResultRows
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeClaudeActivitySearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();