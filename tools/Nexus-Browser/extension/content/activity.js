(() => {
  if (globalThis.__browserAiBridgeVisibleActivityLoaded) return;
  globalThis.__browserAiBridgeVisibleActivityLoaded = true;

  const sessions = new Map();
  const searchHandles = new Map();
  const MARKER_SELECTOR = 'div, span, p, button, a';
  const THOUGHT_SELECTOR = [
    '.ds-think-content',
    '[class*="think-content" i]',
    '[class*="reasoning-content" i]',
    '[class*="thought-content" i]',
    '[class*="reasoning-text" i]',
    '[class*="thought-text" i]'
  ].join(',');

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function classifyMarker(text) {
    if (!text || text.length > 500) return null;

    let match = text.match(/^Thought for\s+(\d+(?:\.\d+)?\s*(?:seconds?|secs?|s|minutes?|mins?|m))\b/i);
    if (match) {
      return {
        type: 'thought-marker',
        label: `Thought for ${match[1].trim()}`,
        duration: match[1].trim()
      };
    }

    match = text.match(/^Found\s+([\d,]+)\s+web pages?\b/i);
    if (match) {
      const count = Number(match[1].replace(/,/g, '')) || null;
      return { type: 'search', label: `Found ${match[1]} web page${count === 1 ? '' : 's'}`, count };
    }

    match = text.match(/^Read\s+([\d,]+)\s+pages?\b/i);
    if (match) {
      const count = Number(match[1].replace(/,/g, '')) || null;
      return { type: 'read', label: `Read ${match[1]} page${count === 1 ? '' : 's'}`, count };
    }

    return null;
  }

  function markerCandidates() {
    const found = [];
    for (const node of document.querySelectorAll(MARKER_SELECTOR)) {
      if (!visible(node)) continue;
      const text = compactText(node.innerText || node.textContent);
      const info = classifyMarker(text);
      if (info) found.push({ node, text, ...info });
    }

    return found.filter((candidate) => !found.some((other) => {
      return other !== candidate
        && candidate.node.contains(other.node)
        && other.type === candidate.type;
    }));
  }

  function pruneToDeepest(nodes) {
    return nodes.filter((node) => !nodes.some((other) => other !== node && node.contains(other)));
  }

  function thoughtCandidates() {
    const direct = [...document.querySelectorAll(THOUGHT_SELECTOR)].filter(visible);
    const markdownInsideThought = [...document.querySelectorAll('.ds-markdown, [class*="ds-markdown"]')].filter((node) => {
      if (!visible(node)) return false;
      return !!node.closest(
        '.ds-think-content, [class*="think" i], [class*="reasoning" i], [class*="thought" i]'
      );
    });
    return pruneToDeepest([...new Set([...direct, ...markdownInsideThought])]);
  }

  function blockText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, svg, button, [role="button"]').forEach((child) => child.remove());

    const paragraphTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
    const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'PRE']);
    let out = '';

    function newline(count = 1) {
      if (!out) return;
      const current = (out.match(/\n+$/) || [''])[0].length;
      if (current < count) out += '\n'.repeat(count - current);
    }

    function walk(current) {
      if (current.nodeType === Node.TEXT_NODE) {
        out += current.nodeValue || '';
        return;
      }
      if (current.nodeType !== Node.ELEMENT_NODE) return;
      const tag = current.tagName;
      if (tag === 'BR') {
        newline(1);
        return;
      }
      if (tag === 'LI') {
        newline(1);
        out += '• ';
        for (const child of current.childNodes) walk(child);
        newline(1);
        return;
      }
      const isParagraph = paragraphTags.has(tag);
      const isBlock = blockTags.has(tag);
      if (isParagraph) newline(2);
      else if (isBlock) newline(1);
      for (const child of current.childNodes) walk(child);
      if (isParagraph) newline(2);
      else if (isBlock) newline(1);
    }

    walk(clone);
    return out
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function nearestTurnContainer(node) {
    return node.closest([
      '[data-message-id]',
      '[class*="chat-turn" i]',
      '[class*="message" i]',
      '[class*="conversation-item" i]',
      '[class*="chat-item" i]'
    ].join(','));
  }

  function sourceScope(marker) {
    const turn = nearestTurnContainer(marker);
    let cursor = marker.parentElement;
    let best = marker.parentElement;
    for (let depth = 0; cursor && cursor !== document.body && depth < 8; depth += 1, cursor = cursor.parentElement) {
      if (turn && !turn.contains(cursor)) break;
      const links = [...cursor.querySelectorAll('a[href]')].filter(visible);
      if (links.length) best = cursor;
      if (turn && cursor === turn) break;
      if (links.length >= 2) return cursor;
    }
    return best;
  }

  function extractSources(marker) {
    const scope = sourceScope(marker);
    if (!scope) return [];

    const seen = new Set();
    const sources = [];
    for (const anchor of scope.querySelectorAll('a[href]')) {
      if (!visible(anchor)) continue;
      const href = anchor.href || anchor.getAttribute('href') || '';
      if (!/^https?:/i.test(href) || href === location.href) continue;

      const title = compactText(
        anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || anchor.title
      );
      if (!title) continue;

      const key = `${title}\n${href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let domain = '';
      try { domain = new URL(href).hostname.replace(/^www\./, ''); } catch {}
      sources.push({ title, href, domain });
    }
    return sources;
  }

  function compareDomOrder(a, b) {
    if (a.node === b.node) return 0;
    const position = a.node.compareDocumentPosition(b.node);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function syncSearchHandles(requestId, baselineMarkers) {
    const markers = markerCandidates()
      .filter((marker) => marker.type === 'search' && !baselineMarkers.has(marker.node))
      .sort(compareDomOrder);
    searchHandles.set(requestId, markers.map((marker) => ({
      node: marker.node,
      label: marker.label,
      count: marker.count
    })));

    while (searchHandles.size > 20) searchHandles.delete(searchHandles.keys().next().value);
  }

  function activitySnapshot(baselineMarkers, baselineThoughtNodes) {
    const items = [];
    for (const marker of markerCandidates()) {
      if (!baselineMarkers.has(marker.node)) items.push(marker);
    }
    for (const node of thoughtCandidates()) {
      if (baselineThoughtNodes.has(node)) continue;
      const text = blockText(node);
      if (text) items.push({ node, type: 'thought-text', text });
    }
    items.sort(compareDomOrder);

    const events = [];
    let thoughtLabel = null;
    let thoughtDuration = null;
    for (const item of items) {
      if (item.type === 'thought-marker') {
        thoughtLabel = item.label;
        thoughtDuration = item.duration;
        if (!events.length || events[events.length - 1].type !== 'thought') {
          events.push({ type: 'thought', label: thoughtLabel, duration: thoughtDuration, text: '' });
        } else {
          events[events.length - 1].label = thoughtLabel;
          events[events.length - 1].duration = thoughtDuration;
        }
        continue;
      }

      if (item.type === 'thought-text') {
        const previous = events[events.length - 1];
        if (previous?.type === 'thought') {
          if (!previous.text.includes(item.text)) {
            previous.text = [previous.text, item.text].filter(Boolean).join('\n\n');
          }
        } else {
          events.push({
            type: 'thought',
            label: thoughtLabel || 'Thought continued',
            duration: thoughtDuration || null,
            text: item.text
          });
        }
        continue;
      }

      if (item.type === 'search') {
        events.push({ type: 'search', label: item.label, count: item.count });
        continue;
      }
      if (item.type === 'read') {
        events.push({ type: 'read', label: item.label, count: item.count, sources: extractSources(item.node) });
      }
    }

    const cleaned = [];
    for (const event of events) {
      const previous = cleaned[cleaned.length - 1];
      const sameStage = previous
        && previous.type === event.type
        && previous.label === event.label
        && previous.text === event.text
        && JSON.stringify(previous.sources || []) === JSON.stringify(event.sources || []);
      if (!sameStage) cleaned.push(event);
    }
    return { events: cleaned };
  }

  const searchModule = globalThis.BrowserAiBridgeActivitySearch;
  if (!searchModule) throw new Error('Activity search module was not loaded before activity.js.');
  const searchBridge = searchModule.createSearchBridge({
    visible,
    compactText,
    markerCandidates,
    searchHandles
  });

  function emit(payload) {
    try { chrome.runtime.sendMessage(payload); } catch {}
  }

  function stopSession(requestId, emitFinal = true) {
    const session = sessions.get(requestId);
    if (!session) return;
    if (emitFinal) session.sample(true);
    session.observer.disconnect();
    clearInterval(session.timer);
    clearTimeout(session.timeout);
    sessions.delete(requestId);
  }

  function startSession(requestId) {
    for (const existingId of [...sessions.keys()]) stopSession(existingId, false);

    const baselineMarkers = new Set(markerCandidates().map((marker) => marker.node));
    const baselineThoughtNodes = new Set(thoughtCandidates());
    searchHandles.set(requestId, []);
    const session = {
      baselineMarkers,
      baselineThoughtNodes,
      lastSignature: '',
      observer: null,
      timer: null,
      timeout: null,
      sample: null
    };

    session.sample = (final = false) => {
      syncSearchHandles(requestId, baselineMarkers);
      const activity = activitySnapshot(baselineMarkers, baselineThoughtNodes);
      if (!activity.events.length && !final) return;
      const signature = JSON.stringify(activity);
      if (signature === session.lastSignature && !final) return;
      session.lastSignature = signature;
      emit({ type: 'activity_update', requestId, activity, final });
    };

    session.observer = new MutationObserver(() => session.sample(false));
    session.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'aria-expanded']
    });
    session.timer = setInterval(() => session.sample(false), 500);
    session.timeout = setTimeout(() => stopSession(requestId, true), 300000);
    sessions.set(requestId, session);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'activity_bridge_ping') {
      sendResponse({ ok: true, adapter: 'visible-activity' });
      return;
    }
    if (msg.type === 'send_prompt' && msg.requestId) {
      startSession(msg.requestId);
      return;
    }
    if (msg.type === 'activity_stop' && msg.requestId) {
      stopSession(msg.requestId, true);
      return;
    }
    if (msg.type === 'get_search_results' && msg.requestId) {
      searchBridge.getSearchResults(msg.requestId, Number(msg.searchIndex) || 0)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      classifyMarker,
      markerCandidates,
      activitySnapshot,
      blockText
    };
  }
})();
