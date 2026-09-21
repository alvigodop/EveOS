(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeSearchRecoveryLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeSearchRecoveryLoaded = true;

  const sessions = new Map();
  const handlesByRequest = new Map();
  const restoreTokens = new Map();
  const MARKER_SELECTOR = 'div, span, p, button, a';
  const TURN_SELECTOR = [
    '[data-message-id]',
    '[class*="chat-turn" i]',
    '[class*="message" i]',
    '[class*="conversation-item" i]',
    '[class*="chat-item" i]'
  ].join(',');

  function visible(element) {
    if (!element) return false;
    const style = typeof getComputedStyle !== 'undefined' ? getComputedStyle(element) : null;
    const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
    return true;
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function searchInfo(text) {
    const match = compactText(text).match(/^Found\s+([\d,]+)\s+web pages?\b/i);
    if (!match) return null;
    const count = Number(match[1].replace(/,/g, '')) || null;
    return { label: `Found ${match[1]} web page${count === 1 ? '' : 's'}`, count };
  }

  function searchMarkers(root = document) {
    const found = [];
    for (const node of root.querySelectorAll(MARKER_SELECTOR)) {
      if (!visible(node)) continue;
      const info = searchInfo(node.innerText || node.textContent);
      if (info) found.push({ node, ...info });
    }
    return found.filter((candidate) => !found.some((other) => {
      return other !== candidate && candidate.node.contains(other.node);
    }));
  }

  function compareNodes(a, b) {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function compareDomOrder(a, b) {
    return compareNodes(a.node, b.node);
  }

  function nearestTurn(node) {
    return node?.closest?.(TURN_SELECTOR) || null;
  }

  function currentTurns() {
    return [...document.querySelectorAll(TURN_SELECTOR)].filter((node) => document.contains(node));
  }

  function thoughtHeadingCandidates(root = document) {
    const found = [];
    for (const node of root.querySelectorAll('button, [role="button"], [aria-expanded], [tabindex], div, span')) {
      if (!visible(node)) continue;
      const text = compactText(node.innerText || node.textContent);
      if (/^\W*(?:Thought(?:\s+for)?\s+\d+(?:\.\d+)?\s*(?:seconds?|secs?|s|minutes?|mins?|m)|已深度思考|思考过程)\b/i.test(text)) {
        found.push(node);
      }
    }
    return found.filter((candidate) => !found.some((other) => other !== candidate && candidate.contains(other)));
  }

  function orderedThoughtHeadings(root = document) {
    return thoughtHeadingCandidates(root).sort(compareNodes);
  }

  function headingIdentity(heading) {
    if (!heading) return { headingNode: null, headingIndex: null, headingText: '' };
    const headings = orderedThoughtHeadings(document);
    return {
      headingNode: heading,
      headingIndex: Math.max(0, headings.indexOf(heading)),
      headingText: compactText(heading.innerText || heading.textContent)
    };
  }

  function nearestPrecedingThoughtHeading(markerNode) {
    if (!markerNode) return null;
    const headings = orderedThoughtHeadings(document);
    let best = null;
    for (const heading of headings) {
      if (heading.contains(markerNode)) return heading;
      const position = heading.compareDocumentPosition(markerNode);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) best = heading;
      else if (best && position & Node.DOCUMENT_POSITION_PRECEDING) break;
    }
    return best;
  }

  function resolveThoughtHeading(handle = null) {
    if (handle?.headingNode && document.contains(handle.headingNode) && visible(handle.headingNode)) {
      return handle.headingNode;
    }

    const headings = orderedThoughtHeadings(document);
    if (!headings.length) return null;

    if (handle?.headingText) {
      const exact = headings.find((heading) => compactText(heading.innerText || heading.textContent) === handle.headingText);
      if (exact) return exact;
    }

    if (Number.isInteger(handle?.headingIndex) && handle.headingIndex >= 0 && handle.headingIndex < headings.length) {
      return headings[handle.headingIndex];
    }

    if (handle?.turn && document.contains(handle.turn)) {
      const inTurn = orderedThoughtHeadings(handle.turn);
      if (inTurn.length) return inTurn[0];
    }

    return headings[headings.length - 1] || null;
  }

  function clickableFor(node) {
    let cursor = node;
    for (let depth = 0; cursor && cursor !== document.body && depth < 7; depth += 1, cursor = cursor.parentElement) {
      if (cursor.matches?.('button, a, [role="button"], [tabindex]')) return cursor;
      if (cursor.hasAttribute?.('aria-expanded')) return cursor;
      try {
        if (getComputedStyle(cursor).cursor === 'pointer') return cursor;
      } catch {}
    }
    return node;
  }

  function expandedState(node) {
    const toggle = clickableFor(node);
    const ariaNode = toggle?.hasAttribute?.('aria-expanded')
      ? toggle
      : (toggle?.closest?.('[aria-expanded]') || node?.closest?.('[aria-expanded]') || toggle?.querySelector?.('[aria-expanded]'));
    if (!ariaNode) return null;
    const value = ariaNode.getAttribute('aria-expanded');
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  function clickControl(node) {
    const target = clickableFor(node);
    if (!target) return false;
    try {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      target.click();
      return true;
    } catch {
      return false;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function markerBelongsToHeading(markerNode, heading) {
    if (!markerNode || !heading) return false;
    if (heading.contains(markerNode)) return true;

    const headings = orderedThoughtHeadings(document);
    const headingIndex = headings.indexOf(heading);
    const nextHeading = headingIndex >= 0 ? headings[headingIndex + 1] || null : null;
    const afterHeading = !!(heading.compareDocumentPosition(markerNode) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!afterHeading) return false;
    if (!nextHeading) return true;
    return !!(markerNode.compareDocumentPosition(nextHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function markersForHeading(heading) {
    return searchMarkers(document)
      .filter((marker) => markerBelongsToHeading(marker.node, heading))
      .sort(compareDomOrder);
  }

  function syncHandles(requestId, baselineNodes) {
    const markers = searchMarkers()
      .filter((marker) => !baselineNodes.has(marker.node))
      .sort(compareDomOrder)
      .map((marker) => {
        const heading = nearestPrecedingThoughtHeading(marker.node);
        return {
          node: marker.node,
          turn: nearestTurn(marker.node),
          label: marker.label,
          count: marker.count,
          ...headingIdentity(heading)
        };
      });

    if (markers.length) handlesByRequest.set(requestId, markers);
    while (handlesByRequest.size > 24) handlesByRequest.delete(handlesByRequest.keys().next().value);
  }

  function stopSession(requestId) {
    const session = sessions.get(requestId);
    if (!session) return;
    session.observer?.disconnect();
    clearInterval(session.timer);
    clearTimeout(session.timeout);
    sessions.delete(requestId);
  }

  function startSession(requestId) {
    stopSession(requestId);
    const baselineNodes = new Set(searchMarkers().map((marker) => marker.node));
    const session = {
      observer: null,
      timer: null,
      timeout: null
    };
    const sample = () => syncHandles(requestId, baselineNodes);
    session.observer = new MutationObserver(sample);
    session.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-expanded'] });
    session.timer = setInterval(sample, 400);
    session.timeout = setTimeout(() => stopSession(requestId), 300000);
    sessions.set(requestId, session);
  }

  function matchingMarker(root, handle, searchIndex, heading = null) {
    let markers = root === document ? searchMarkers(document) : searchMarkers(root);
    if (heading) markers = markers.filter((marker) => markerBelongsToHeading(marker.node, heading));
    markers.sort(compareDomOrder);
    if (!markers.length) return null;
    if (handle?.count != null) {
      const byCount = markers.find((marker) => marker.count === handle.count);
      if (byCount) return byCount;
    }
    if (handle?.label) {
      const byLabel = markers.find((marker) => marker.label === handle.label);
      if (byLabel) return byLabel;
    }
    return markers[Math.min(searchIndex, markers.length - 1)] || null;
  }

  function fallbackTurn() {
    const turns = currentTurns();
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (thoughtHeadingCandidates(turn).length || searchMarkers(turn).length) return turn;
    }
    return turns[turns.length - 1] || null;
  }

  async function recoverSearchStage(requestId, searchIndex = 0) {
    const handles = handlesByRequest.get(requestId) || [];
    const handle = handles[searchIndex] || null;

    if (handle?.node && document.contains(handle.node)) {
      return { ok: true, expanded: false, restoreToken: null, strategy: 'live-marker' };
    }

    let heading = resolveThoughtHeading(handle);
    const turn = handle?.turn && document.contains(handle.turn) ? handle.turn : (heading ? nearestTurn(heading) : fallbackTurn());

    let marker = null;
    if (turn) marker = matchingMarker(turn, handle, searchIndex, heading);
    if (!marker && heading) marker = matchingMarker(document, handle, searchIndex, heading);
    if (marker?.node && document.contains(marker.node)) {
      if (handle) handle.node = marker.node;
      return { ok: true, expanded: false, restoreToken: null, strategy: 'remounted-marker' };
    }

    if (!heading) {
      heading = resolveThoughtHeading(null);
    }
    if (!heading) {
      return { ok: false, error: 'The search stage is collapsed and no visible DeepSeek Thought header could be located.' };
    }

    const beforeExpanded = expandedState(heading);
    if (beforeExpanded !== true && !clickControl(heading)) {
      return { ok: false, error: 'Could not expand the collapsed DeepSeek Thought section.' };
    }

    const started = Date.now();
    while (Date.now() - started < 4500) {
      marker = matchingMarker(document, handle, searchIndex, heading);
      if (marker?.node && document.contains(marker.node)) break;
      await sleep(75);
    }

    if (!marker?.node || !document.contains(marker.node)) {
      if (beforeExpanded !== true && expandedState(heading) !== false) clickControl(heading);
      return { ok: false, error: 'Thought expanded, but the requested DeepSeek search stage did not reappear.' };
    }

    const identity = headingIdentity(heading);
    if (handle) {
      handle.node = marker.node;
      handle.turn = nearestTurn(marker.node) || turn;
      handle.headingNode = identity.headingNode;
      handle.headingIndex = identity.headingIndex;
      handle.headingText = identity.headingText;
    } else {
      const list = handlesByRequest.get(requestId) || [];
      list[searchIndex] = {
        node: marker.node,
        turn: nearestTurn(marker.node) || turn,
        label: marker.label,
        count: marker.count,
        ...identity
      };
      handlesByRequest.set(requestId, list);
    }

    let restoreToken = null;
    if (beforeExpanded !== true) {
      restoreToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      restoreTokens.set(restoreToken, {
        headingNode: heading,
        headingIndex: identity.headingIndex,
        headingText: identity.headingText
      });
    }

    return { ok: true, expanded: beforeExpanded !== true, restoreToken, strategy: 'thought-heading' };
  }

  async function restoreSearchStage(token) {
    const entry = restoreTokens.get(token);
    restoreTokens.delete(token);
    if (!entry) return { ok: true, restored: false };

    let heading = entry.headingNode && document.contains(entry.headingNode) ? entry.headingNode : null;
    if (!heading) {
      heading = resolveThoughtHeading({
        headingIndex: entry.headingIndex,
        headingText: entry.headingText
      });
    }
    if (!heading) return { ok: true, restored: false };

    const state = expandedState(heading);
    const markersVisible = markersForHeading(heading).length > 0;
    if (state === false || (state == null && !markersVisible)) return { ok: true, restored: true };

    const clicked = clickControl(heading);
    if (clicked) await sleep(120);
    return { ok: true, restored: clicked };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'search_recovery_ping') {
        sendResponse({ ok: true, adapter: 'search-recovery-v2' });
        return;
      }

      if (msg.type === 'send_prompt' && msg.requestId) {
        startSession(msg.requestId);
        return;
      }

      if (msg.type === 'activity_stop' && msg.requestId) {
        stopSession(msg.requestId);
        return;
      }

      if (msg.type === 'recover_search_stage' && msg.requestId) {
        recoverSearchStage(msg.requestId, Number(msg.searchIndex) || 0)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (msg.type === 'restore_search_stage' && msg.restoreToken) {
        restoreSearchStage(msg.restoreToken)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      searchInfo,
      searchMarkers,
      thoughtHeadingCandidates,
      orderedThoughtHeadings,
      nearestPrecedingThoughtHeading,
      resolveThoughtHeading,
      markerBelongsToHeading,
      matchingMarker,
      fallbackTurn,
      recoverSearchStage,
      restoreSearchStage
    };
  }
})();
