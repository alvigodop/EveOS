(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeActivitySearchLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeActivitySearchLoaded = true;

  function createSearchBridge({ visible, compactText, markerCandidates, searchHandles }) {
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function triggerMarkerClick(marker) {
      let target = marker;
      for (let depth = 0; target && target !== document.body && depth < 6; depth += 1, target = target.parentElement) {
        if (target.matches?.('button, a, [role="button"], [tabindex]')) break;
        try {
          if (getComputedStyle(target).cursor === 'pointer') break;
        } catch {}
      }
      target = target || marker;
      try {
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      } catch {}
      target.click();
    }

    function searchPanelCandidates() {
      const explicit = [...document.querySelectorAll([
        '[role="dialog"]',
        '[class*="modal" i]',
        '[class*="dialog" i]',
        '[class*="drawer" i]',
        '[class*="overlay" i]'
      ].join(','))].filter(visible);

      const titled = [];
      for (const node of document.querySelectorAll('h1, h2, h3, h4, div, span')) {
        if (!visible(node)) continue;
        const text = compactText(node.innerText || node.textContent);
        if (!/^(?:Search results?|搜索结果|\d+\s+web pages? found|web pages? found)(?:\s*\(\d+\))?$/i.test(text)) continue;
        let cursor = node;
        for (let depth = 0; cursor && cursor !== document.body && depth < 7; depth += 1, cursor = cursor.parentElement) {
          if (visible(cursor)) titled.push(cursor);
        }
      }

      return [...new Set([...explicit, ...titled])];
    }

    function panelScore(panel) {
      const text = compactText(panel.innerText || panel.textContent);
      let score = 0;
      if (/(?:Search results?|搜索结果)/i.test(text)) score += 100;
      score += Math.min(40, panel.querySelectorAll('a[href]').length * 4);
      if (panel.scrollHeight > panel.clientHeight + 40) score += 20;
      const rect = panel.getBoundingClientRect();
      if (rect.width > 300 && rect.height > 250) score += 10;
      return score;
    }

    function findSearchPanel() {
      return searchPanelCandidates()
        .map((panel) => ({ panel, score: panelScore(panel) }))
        .filter((entry) => entry.score >= 100)
        .sort((a, b) => b.score - a.score)[0]?.panel || null;
    }

    async function waitForSearchPanel(timeoutMs = 3000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const panel = findSearchPanel();
        if (panel) return panel;
        await sleep(50);
      }
      return null;
    }

    function findScrollable(panel) {
      const candidates = [panel, ...panel.querySelectorAll('*')].filter((node) => {
        if (!(node instanceof Element) || !visible(node)) return false;
        if (node.scrollHeight <= node.clientHeight + 40) return false;
        const style = getComputedStyle(node);
        return /auto|scroll/.test(style.overflowY) || node === panel;
      });
      return candidates.sort((a, b) => (
        (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight)
      ))[0] || panel;
    }

    function externalHref(anchor) {
      const href = anchor?.href || anchor?.getAttribute?.('href') || '';
      if (!/^https?:/i.test(href) || href === location.href) return '';
      return href;
    }

    function resultCardFor(node, panel) {
      let cursor = node;
      let best = node;
      for (let depth = 0; cursor && cursor !== panel && depth < 6; depth += 1, cursor = cursor.parentElement) {
        const text = compactText(cursor.innerText || cursor.textContent);
        if (text.length >= 20 && text.length <= 1400) best = cursor;
        if (cursor.matches?.('article, li, [class*="result" i], [class*="card" i], [class*="item" i]')) return cursor;
      }
      return best;
    }

    function parseResultCard(card) {
      if (!card || !visible(card)) return null;
      const rawLines = String(card.innerText || card.textContent || '')
        .split(/\n+/)
        .map(compactText)
        .filter(Boolean);
      const lines = [...new Set(rawLines)];
      if (!lines.length) return null;

      const anchors = [...card.querySelectorAll('a[href]')].filter(visible);
      let href = anchors.map(externalHref).find(Boolean) || '';
      if (!href) href = externalHref(card) || card.getAttribute('data-url') || card.getAttribute('data-href') || '';

      let domain = '';
      if (href) {
        try { domain = new URL(href).hostname.replace(/^www\./, ''); } catch {}
      }
      if (!domain) domain = lines.find((line) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(line)) || '';

      const heading = card.querySelector('h1, h2, h3, h4, h5, h6, [class*="title" i]');
      let title = compactText(heading?.innerText || heading?.textContent || '');
      if (!title) title = lines.find((line) => line !== domain && line.length >= 8) || lines[0];

      const ignored = new Set([title, domain]);
      const snippet = lines
        .filter((line) => !ignored.has(line))
        .filter((line) => !/^Search results?$/i.test(line))
        .join(' ')
        .slice(0, 700);

      if (!title && !domain && !snippet) return null;
      return { title: title || domain || 'Search result', href, domain, snippet };
    }

    function collectVisibleSearchResults(panel, resultMap) {
      const anchors = [...panel.querySelectorAll('a[href]')].filter(visible);
      for (const anchor of anchors) {
        const href = externalHref(anchor);
        const result = parseResultCard(resultCardFor(anchor, panel));
        if (!result) continue;
        if (href && !result.href) result.href = href;
        const key = result.href || `${result.domain}\n${result.title}\n${result.snippet}`;
        if (!resultMap.has(key)) resultMap.set(key, result);
      }

      const structural = [...panel.querySelectorAll(
        'article, li, [class*="result" i], [class*="card" i], [class*="item" i]'
      )]
        .filter(visible)
        .filter((node) => {
          const text = compactText(node.innerText || node.textContent);
          return text.length >= 20 && text.length <= 1400 && !/^Search results?$/i.test(text);
        });
      const deepest = structural.filter((node) => !structural.some((other) => other !== node && node.contains(other)));
      for (const card of deepest) {
        const result = parseResultCard(card);
        if (!result) continue;
        const key = result.href || `${result.domain}\n${result.title}\n${result.snippet}`;
        if (!resultMap.has(key)) resultMap.set(key, result);
      }
    }

    async function collectAllSearchResults(panel, expectedCount) {
      const resultMap = new Map();
      const scroller = findScrollable(panel);
      const originalTop = scroller.scrollTop;

      let previousTop = -1;
      for (let pass = 0; pass < 40; pass += 1) {
        collectVisibleSearchResults(panel, resultMap);
        if (expectedCount && resultMap.size >= expectedCount) break;

        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (scroller.scrollTop >= maxTop - 2 || scroller.scrollTop === previousTop) break;
        previousTop = scroller.scrollTop;
        scroller.scrollTop = Math.min(maxTop, scroller.scrollTop + Math.max(220, scroller.clientHeight * 0.75));
        await sleep(90);
      }

      collectVisibleSearchResults(panel, resultMap);
      scroller.scrollTop = originalTop;
      return [...resultMap.values()];
    }

    function closeSearchPanel(panel) {
      const buttons = [...panel.querySelectorAll('button, [role="button"]')].filter(visible);
      const close = buttons.find((node) => {
        const text = compactText(
          `${node.getAttribute('aria-label') || ''} ${node.title || ''} ${node.textContent || ''}`
        );
        return /^(close|dismiss|×|✕|✖)$/i.test(text) || /close|dismiss/i.test(text);
      });
      if (close) {
        close.click();
        return true;
      }

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Escape', code: 'Escape', bubbles: true, cancelable: true
      }));
      return false;
    }

    async function getSearchResults(requestId, searchIndex = 0) {
      const handles = searchHandles.get(requestId) || [];
      let handle = handles[searchIndex];
      if (!handle?.node || !document.contains(handle.node)) {
        const allMarkers = markerCandidates().filter((marker) => marker.type === 'search');
        if (allMarkers.length > 0) handle = allMarkers[Math.min(searchIndex, allMarkers.length - 1)];
      }
      if (!handle?.node || !document.contains(handle.node)) {
        throw new Error('The DeepSeek search stage is no longer available in the live page DOM.');
      }

      let panel = findSearchPanel();
      const openedByBridge = !panel;
      if (!panel) {
        triggerMarkerClick(handle.node);
        panel = await waitForSearchPanel(3500);
      }
      if (!panel) {
        throw new Error('DeepSeek search-results panel did not open after clicking the Found web pages row.');
      }

      try {
        const results = await collectAllSearchResults(panel, handle.count);
        return {
          ok: true,
          label: handle.label,
          expectedCount: handle.count,
          results
        };
      } finally {
        if (openedByBridge) closeSearchPanel(panel);
      }
    }

    return {
      getSearchResults,
      parseResultCard,
      collectAllSearchResults,
      findSearchPanel
    };
  }

  const api = { createSearchBridge };
  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeActivitySearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
