(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeClaudeActivityLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeClaudeActivityLoaded = true;

  const searchHelpers = globalThis.BrowserAiBridgeClaudeActivitySearch
    || (typeof module !== 'undefined' && module.exports ? require('./claude-activity-search.js') : null);
  const commandHelpers = globalThis.BrowserAiBridgeClaudeActivityCommand
    || (typeof module !== 'undefined' && module.exports ? require('./claude-activity-command.js') : null);
  if (!searchHelpers || !commandHelpers) {
    throw new Error('Claude activity helpers were not loaded before claude-activity.js.');
  }

  const sessions = new Map();
  const RESPONSE_SELECTOR = '.standard-markdown, .progressive-markdown';
  const STATUS_HEADER_SELECTOR = '.row-start-1';
  const TOOL_SUMMARY_RE = /\b(?:searched the web|read\s+(?:a|[\d,]+)\s+pages?|recalled memory|added to memory|web search|used\s+(?:a|[\d,]+)\s+tools?|ran\s+(?:a|[\d,]+)\s+(?:tools?|commands?)|ran\s+(?:a\s+)?command)\b/i;
  const COMMAND_SUMMARY_RE = /\bran\s+(?:(?:a|[\d,]+)\s+)?commands?\b/i;
  const {
    nodeText,
    toolSurfaceScore,
    toolQueryLines,
    resultRowFromIcon,
    resultDataFromRow,
    toolResultRows
  } = searchHelpers;
  const {
    commandBlocks,
    commandSurfaceForSummary,
    commandCardEntries,
    stripCommandLines,
    formatCommandBlocks
  } = commandHelpers;

  function visible(element) {
    const shared = globalThis.BrowserAiBridgeClaudeInput?.visible;
    if (shared) return shared(element);
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    try {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect?.();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && (!rect || (rect.width > 0 && rect.height > 0));
    } catch {
      return true;
    }
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function assistantTurns(root = document) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('[data-test-render-count]')].filter((turn) => {
      if (!visible(turn)) return false;
      if (turn.querySelector?.('[data-testid="user-message"]')) return false;
      return !!turn.querySelector?.('[data-is-streaming], .font-claude-response, .standard-markdown, .progressive-markdown');
    });
  }

  function streamingRoot(turn) {
    return turn?.querySelector?.('[data-is-streaming]')
      || turn?.querySelector?.('.font-claude-response')
      || turn
      || null;
  }

  function insideAnswerRegion(node) {
    return !!node?.closest?.(RESPONSE_SELECTOR);
  }

  function summaryLabel(text) {
    const normalized = compactText(text);
    if (!normalized || normalized.length > 220 || !TOOL_SUMMARY_RE.test(normalized)) return '';
    return normalized;
  }

  function summaryCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [...root.querySelectorAll('button, [role="button"], div, span, p')].filter((node) => {
      if (!visible(node) || insideAnswerRegion(node)) return false;
      return !!summaryLabel(node.innerText || node.textContent);
    });
    return candidates.filter((node) => !candidates.some((other) => {
      return other !== node && node.contains?.(other);
    }));
  }

  function statusHeaders(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll(STATUS_HEADER_SELECTOR)].filter((header) => {
      if (!visible(header)) return false;
      return !header.closest?.('.row-start-2');
    });
  }

  function widgetRootForSummary(summary, root) {
    if (!summary || !root) return summary;
    const label = summaryLabel(summary.innerText || summary.textContent);

    if (COMMAND_SUMMARY_RE.test(label)) {
      const commandSurface = commandSurfaceForSummary(summary, root);
      if (commandSurface) return commandSurface;
    }

    let current = summary;
    let best = summary;
    let bestScore = toolSurfaceScore(summary);
    let bestTextSize = nodeText(summary).length;

    for (let depth = 0; current?.parentElement && current !== root && depth < 12; depth += 1) {
      const parent = current.parentElement;
      if (!parent || parent === root) break;
      if (parent.matches?.(RESPONSE_SELECTOR)) break;

      const score = toolSurfaceScore(parent);
      const textSize = nodeText(parent).length;
      if (score > bestScore || (score === bestScore && score > 0 && textSize > bestTextSize)) {
        best = parent;
        bestScore = score;
        bestTextSize = textSize;
      } else if (bestScore === 0 && textSize > bestTextSize) {
        best = parent;
        bestTextSize = textSize;
      }
      current = parent;
    }

    const statusHeader = summary.closest?.(STATUS_HEADER_SELECTOR);
    if (statusHeader && root.contains?.(statusHeader)) {
      const statusScore = toolSurfaceScore(statusHeader);
      if (statusScore >= bestScore || (!statusHeader.closest?.('.row-start-2') && bestScore === 0)) best = statusHeader;
    }

    const explicit = summary.closest?.(
      'details, [data-testid*="tool" i], [data-testid*="search" i], [class*="tool-use" i], [class*="tool-result" i]'
    );
    if (explicit && root.contains?.(explicit) && toolSurfaceScore(explicit) >= toolSurfaceScore(best)) best = explicit;
    return best;
  }

  function sourceLinks(widget, resultRows = []) {
    if (!widget?.querySelectorAll) return [];
    const seen = new Set();
    const sources = [];

    function addSource(title, href, domain = '') {
      if (!/^https?:/i.test(href || '')) return;
      let resolvedDomain = domain;
      try { resolvedDomain ||= new URL(href).hostname.replace(/^www\./, ''); } catch {}
      const resolvedTitle = compactText(title) || resolvedDomain || href;
      const key = `${resolvedTitle}\n${href}`;
      if (seen.has(key)) return;
      seen.add(key);
      sources.push({ title: resolvedTitle, href, domain: resolvedDomain });
    }

    for (const anchor of widget.querySelectorAll('a[href]')) {
      if (!visible(anchor)) continue;
      const href = anchor.href || anchor.getAttribute?.('href') || '';
      addSource(anchor.innerText || anchor.textContent || anchor.getAttribute?.('aria-label') || anchor.title, href);
    }
    for (const row of resultRows) addSource(row.title, row.href, row.domain);
    return sources;
  }

  function rawDetailLines(widget, label) {
    const rawLines = String(widget?.innerText || widget?.textContent || '')
      .split(/\n+/)
      .map(compactText)
      .filter(Boolean);
    const labelIndex = rawLines.findIndex((line) => line === label || !!summaryLabel(line));
    const details = [];
    for (let index = 0; index < rawLines.length; index += 1) {
      const line = rawLines[index];
      if (index === labelIndex || line === label) continue;
      if (/^(?:copy|share|like|dislike|retry|open|close|collapse|expand)$/i.test(line)) continue;
      if (/^[\uE000-\uF8FF]$/u.test(line)) continue;
      if (details[details.length - 1] === line) continue;
      details.push(line);
    }
    return details;
  }

  function enrichSearchDetails(widget, details, resultRows) {
    const cleaned = [...details];
    for (const query of toolQueryLines(widget)) {
      if (!cleaned.includes(query)) cleaned.push(query);
    }
    if (!resultRows.length) return cleaned;

    const resultTokens = new Set();
    for (const row of resultRows) {
      if (row.title) resultTokens.add(row.title);
      if (row.domain) resultTokens.add(row.domain);
    }
    const withoutDuplicates = cleaned.filter((line) => !resultTokens.has(line));
    withoutDuplicates.push('Search results:');
    for (const row of resultRows) {
      withoutDuplicates.push(`• ${row.title}${row.domain ? ` — ${row.domain}` : ''}`);
    }
    return withoutDuplicates;
  }

  function eventForWidget(widget, preferredLabel = '') {
    if (!widget || !visible(widget)) return null;
    const rawLines = String(widget.innerText || widget.textContent || '')
      .split(/\n+/)
      .map(compactText)
      .filter(Boolean);
    if (!rawLines.length) return null;

    const labelIndex = rawLines.findIndex((line) => !!summaryLabel(line));
    const label = preferredLabel || (labelIndex >= 0 ? summaryLabel(rawLines[labelIndex]) : '');
    if (!label) return null;

    const isSearch = /\b(?:searched the web|web search|read\s+(?:a|[\d,]+)\s+pages?)\b/i.test(label);
    const isCommand = COMMAND_SUMMARY_RE.test(label);
    const resultRows = isSearch ? toolResultRows(widget) : [];
    const commands = isCommand ? commandBlocks(widget) : [];
    let details = rawDetailLines(widget, label);
    if (commands.length) details = stripCommandLines(details, commands);
    if (isSearch) details = enrichSearchDetails(widget, details, resultRows);
    const commandText = commands.length ? formatCommandBlocks(commands) : '';
    if (commandText) details.push(commandText);

    return {
      type: 'thought',
      label,
      duration: null,
      text: details.join('\n'),
      sources: sourceLinks(widget, resultRows),
      commands
    };
  }

  function eventsForTurn(turn) {
    const root = streamingRoot(turn);
    if (!root) return [];

    const seen = new Set();
    const events = [];
    const processedPairs = new Set();

    function addWidget(widget, label, summary = null) {
      if (!widget) return;
      const pairKey = `${label}\n${nodeText(summary).slice(0, 160)}\n${nodeText(widget).slice(0, 500)}`;
      if (processedPairs.has(pairKey)) return;
      processedPairs.add(pairKey);

      const event = eventForWidget(widget, label);
      if (!event) return;
      const signature = `${event.label}\n${event.text}\n${event.sources.map((source) => source.href).join('\n')}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      events.push(event);

      if (event.sources.length) {
        events.push({
          type: 'read',
          label: `Sources from ${event.label}`,
          count: event.sources.length,
          sources: event.sources
        });
      }
    }

    for (const header of statusHeaders(root)) {
      for (const summary of summaryCandidates(header)) {
        addWidget(widgetRootForSummary(summary, root), summaryLabel(summary.innerText || summary.textContent), summary);
      }
    }
    for (const summary of summaryCandidates(root)) {
      addWidget(widgetRootForSummary(summary, root), summaryLabel(summary.innerText || summary.textContent), summary);
    }
    for (const entry of commandCardEntries(root)) {
      addWidget(entry.widget, 'Ran a command', entry.summary);
    }
    return events;
  }

  function snapshot(baselineTurns) {
    const turns = assistantTurns().filter((turn) => !baselineTurns.has(turn));
    return { events: turns.flatMap(eventsForTurn) };
  }

  function emit(payload) {
    try { chrome.runtime.sendMessage(payload); } catch {}
  }

  function stopSession(requestId, emitFinal = true) {
    const session = sessions.get(requestId);
    if (!session) return;
    if (emitFinal) session.sample(true);
    session.observer?.disconnect();
    clearInterval(session.timer);
    clearTimeout(session.timeout);
    sessions.delete(requestId);
  }

  function startSession(requestId) {
    for (const existing of [...sessions.keys()]) stopSession(existing, false);
    const baselineTurns = new Set(assistantTurns());
    const session = {
      baselineTurns,
      lastSignature: '',
      observer: null,
      timer: null,
      timeout: null,
      sample: null
    };

    session.sample = (final = false) => {
      const activity = snapshot(baselineTurns);
      const signature = JSON.stringify(activity);
      if (!final && signature === session.lastSignature) return;
      session.lastSignature = signature;
      if (!activity.events.length && !final) return;
      emit({ type: 'activity_update', requestId, activity, final });
    };

    session.observer = new MutationObserver(() => session.sample(false));
    session.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'data-is-streaming']
    });
    session.timer = setInterval(() => session.sample(false), 500);
    session.timeout = setTimeout(() => stopSession(requestId, true), 300000);
    sessions.set(requestId, session);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'claude_activity_ping') {
        sendResponse({ ok: true, adapter: 'claude-visible-activity' });
        return;
      }
      if (msg.type === 'send_prompt' && msg.requestId) {
        startSession(msg.requestId);
        return;
      }
      if (msg.type === 'activity_stop' && msg.requestId) stopSession(msg.requestId, true);
    });
  }

  const api = {
    assistantTurns,
    streamingRoot,
    summaryLabel,
    summaryCandidates,
    statusHeaders,
    toolSurfaceScore,
    widgetRootForSummary,
    toolQueryLines,
    resultRowFromIcon,
    resultDataFromRow,
    toolResultRows,
    commandBlocks,
    commandSurfaceForSummary,
    commandCardEntries,
    sourceLinks,
    rawDetailLines,
    enrichSearchDetails,
    eventForWidget,
    eventsForTurn,
    snapshot
  };
  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeClaudeActivity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
