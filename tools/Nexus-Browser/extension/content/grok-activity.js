(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeGrokActivityLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeGrokActivityLoaded = true;

  const sessions = new Map();

  function visible(element) {
    const shared = globalThis.BrowserAiBridgeGrokInput?.visible;
    if (shared) return shared(element);
    if (!element) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect?.();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && (!rect || (rect.width > 0 && rect.height > 0));
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function assistantTurns(root = document) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('[data-testid="assistant-message"]')].filter(visible);
  }

  function thoughtEventForTurn(turn) {
    if (!turn) return null;
    const container = turn.querySelector?.('.thinking-container');
    if (!container || !visible(container)) return null;

    const raw = String(container.innerText || container.textContent || '')
      .split(/\n+/)
      .map((line) => compactText(line))
      .filter(Boolean);
    if (!raw.length) return null;

    const labelIndex = raw.findIndex((line) => /^(?:Worked for|Thought for|Thinking\b)/i.test(line));
    const label = labelIndex >= 0 ? raw[labelIndex] : 'Visible reasoning';
    const detailLines = raw.filter((line, index) => {
      if (index === labelIndex) return false;
      if (/^(?:copy|share|like|dislike|regenerate)$/i.test(line)) return false;
      return true;
    });

    return {
      type: 'thought',
      label,
      duration: label.match(/(?:Worked|Thought) for\s+(.+)$/i)?.[1] || null,
      text: detailLines.join('\n\n')
    };
  }

  function snapshot(baselineTurns) {
    const turns = assistantTurns().filter((turn) => !baselineTurns.has(turn));
    const events = [];
    for (const turn of turns) {
      const thought = thoughtEventForTurn(turn);
      if (thought) events.push(thought);
    }
    return { events };
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
      attributeFilter: ['aria-expanded']
    });
    session.timer = setInterval(() => session.sample(false), 500);
    session.timeout = setTimeout(() => stopSession(requestId, true), 300000);
    sessions.set(requestId, session);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'grok_activity_ping') {
        sendResponse({ ok: true, adapter: 'grok-visible-activity' });
        return;
      }
      if (msg.type === 'send_prompt' && msg.requestId) {
        startSession(msg.requestId);
        return;
      }
      if (msg.type === 'activity_stop' && msg.requestId) {
        stopSession(msg.requestId, true);
      }
    });
  }

  const api = { assistantTurns, thoughtEventForTurn, snapshot };
  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeGrokActivity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
