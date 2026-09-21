(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeProviderHealthLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeProviderHealthLoaded = true;

  const SELECTOR = [
    '[role="alert"]', '[role="status"]', '[aria-live="assertive"]', '[aria-live="polite"]',
    '[data-testid*="limit" i]', '[data-testid*="quota" i]', '[data-testid*="error" i]',
    '[class*="rate-limit" i]', '[class*="quota" i]', '[class*="usage-limit" i]',
    '[class*="toast" i]', '[class*="banner" i]', '[class*="alert" i]', '[class*="warning" i]',
    '[class*="bg-card" i]'
  ].join(',');
  const CONVERSATION_SELECTOR = [
    '[data-message-author-role]', '[data-message-author]', '[data-role="assistant"]', '[data-role="user"]',
    '[data-testid^="conversation-turn"]', '[data-testid*="message-content"]', '.agent-turn',
    '[data-sender]', '[data-author]', '[class*="assistant-message" i]', '[class*="user-message" i]',
    '[class*="muse-message" i]', '[data-testid*="message" i]', '[class*="chat-message" i]',
    '[class*="message-content" i]', 'message-content', 'model-response',
    '[class*="chat-thread" i]', '[class*="thread" i]', '[class*="conversation" i]',
    '[role="log"]', '[aria-label*="chat" i]'
  ].join(',');
  const MAX_CANDIDATES = 160, MAX_EVIDENCE = 320;
  const RULES = [
    {
      state: 'conversation_limit', action: 'new_chat', priority: 40,
      patterns: [
        /conversation.{0,35}(?:too long|maximum|max(?:imum)? length|limit reached|reached (?:its|the) limit)/i,
        /context window.{0,35}(?:full|limit|reached|exceeded|maximum)/i,
        /(?:exceed(?:s|ed)?|over).{0,30}(?:context window|available context)/i,
        /maximum context (?:length|window).{0,25}(?:exceeded|reached|full)/i,
        /(?:maximum|max) (?:conversation|chat|context).{0,30}(?:length|limit)/i,
        /(?:start|open) (?:a )?new (?:chat|conversation).{0,50}(?:continue|limit|length|context)/i
      ]
    },
    {
      state: 'rate_limited', action: 'wait', priority: 30,
      patterns: [
        /(?:you(?:'ve| have)? )?(?:reached|hit|exceeded) (?:your |the )?(?:usage|message|model|weekly|daily|hourly|rate)? ?limit/i,
        /\blimit reached\b/i,
        /(?:usage|message|model|weekly|daily|hourly|rate) limit.{0,70}(?:reached|exceeded|used|reset|refresh)/i,
        /too many requests/i,
        /(?:\d+\s*(?:days?|hours?|minutes?)(?:\s+\d+\s*(?:hours?|minutes?))?)\s+before\s+(?:the\s+)?limit\s+is\s+gone/i,
        /(?:wait|come back).{0,60}(?:limit|reset|refresh)/i
      ]
    },
    {
      state: 'auth_required', action: 'reauth', priority: 20,
      patterns: [
        /(?:sign|log) in (?:again )?(?:to continue|required)/i,
        /session (?:has )?expired/i,
        /authentication (?:required|expired)/i
      ]
    },
    {
      state: 'provider_unavailable', action: 'retry_later', priority: 10,
      patterns: [
        /temporarily unavailable/i,
        /service unavailable/i,
        /server (?:is )?overloaded/i,
        /(?:at|due to) high demand/i,
        /please try again later/i,
        /something went wrong.{0,40}try again/i
      ]
    }
  ];

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function durationMs(text) {
    const value = clean(text).toLowerCase();
    const unitRun = '(?:\\d+(?:\\.\\d+)?\\s*(?:days?|hours?|minutes?|mins?|seconds?|secs?)\\s*){1,4}';
    const relative = value.match(new RegExp('(?:reset(?:s)?|refresh(?:es)?|try again|come back|wait)(?:\\s+for)?\\s+(?:in\\s+)?(' + unitRun + ')', 'i'))
      || value.match(new RegExp('(' + unitRun + ')\\s+before\\s+(?:the\\s+)?limit\\s+is\\s+gone', 'i'));
    if (!relative) return null;
    let total = 0;
    for (const match of relative[1].matchAll(/(\d+(?:\.\d+)?)\s*(days?|hours?|minutes?|mins?|seconds?|secs?)/g)) {
      const amount = Number(match[1]);
      if (!Number.isFinite(amount)) continue;
      if (match[2].startsWith('day')) total += amount * 86400000;
      else if (match[2].startsWith('hour')) total += amount * 3600000;
      else if (match[2].startsWith('min')) total += amount * 60000;
      else total += amount * 1000;
    }
    return total > 0 ? Math.round(total) : null;
  }

  function resetHint(text) {
    const value = clean(text);
    const match = value.match(/(.{0,45}(?:reset|refresh|come back|wait|before (?:the )?limit is gone).{0,75})/i);
    return clean(match?.[1] || '').slice(0, 140) || null;
  }

  function classifyText(text, now = Date.now()) {
    const value = clean(text);
    if (!value || value.length < 6) return null;
    const matches = RULES
      .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
      .sort((a, b) => b.priority - a.priority);
    const rule = matches[0];
    if (!rule) return null;
    const waitMs = rule.action === 'wait' || rule.action === 'retry_later' ? durationMs(value) : null;
    return {
      state: rule.state,
      blocking: true,
      action: rule.action,
      detectedAt: new Date(now).toISOString(),
      cooldownUntil: waitMs ? new Date(now + waitMs).toISOString() : null,
      resetText: resetHint(value),
      evidence: value.slice(0, MAX_EVIDENCE),
      source: 'provider-ui'
    };
  }

  function isConversationNode(node) {
    try {
      return !!node?.closest?.(CONVERSATION_SELECTOR) || !!node?.querySelector?.(CONVERSATION_SELECTOR);
    } catch {
      return false;
    }
  }

  function candidateTexts(root = globalThis.document) {
    if (!root?.querySelectorAll) return [];
    const out = [];
    for (const node of [...root.querySelectorAll(SELECTOR)].slice(0, MAX_CANDIDATES)) {
      if (node?.getAttribute?.('aria-hidden') === 'true' || isConversationNode(node)) continue;
      const text = clean(node?.innerText || node?.textContent || '');
      if (text) out.push(text);
    }
    return [...new Set(out)];
  }

  function bestIssue(root = globalThis.document, now = Date.now()) {
    const issues = candidateTexts(root).map((text) => classifyText(text, now)).filter(Boolean);
    return issues.sort((a, b) => {
      const priority = { conversation_limit: 40, rate_limited: 30, auth_required: 20, provider_unavailable: 10 };
      return (priority[b.state] || 0) - (priority[a.state] || 0);
    })[0] || null;
  }

  function summary(health) {
    if (!health?.blocking) return 'Ready';
    const labels = {
      conversation_limit: 'Chat limit reached · new chat needed',
      rate_limited: 'Quota reached · cooldown',
      auth_required: 'Sign-in required',
      provider_unavailable: 'Provider unavailable'
    };
    const reset = health.resetText ? ` · ${health.resetText}` : '';
    return `${labels[health.state] || 'Provider blocked'}${reset}`.slice(0, 220);
  }

  let timer = null, lastFingerprint = '', lastHealth = null, lastSentAt = 0;
  function currentHealth(now = Date.now()) {
    const issue = bestIssue(globalThis.document, now);
    const health = issue || {
      state: 'ready', blocking: false, action: 'none',
      detectedAt: new Date().toISOString(), cooldownUntil: null,
      resetText: null, evidence: null, source: 'provider-ui'
    };
    if (issue && lastHealth?.state === issue.state && lastHealth.evidence === issue.evidence) {
      health.detectedAt = lastHealth.detectedAt;
      health.cooldownUntil = lastHealth.cooldownUntil;
    }
    health.summary = summary(health);
    return health;
  }

  function emitHealth() {
    const health = currentHealth();
    const fingerprint = JSON.stringify([health.state, health.action, health.cooldownUntil, health.resetText, health.evidence]);
    if (fingerprint === lastFingerprint && Date.now() - lastSentAt < 30000) return;
    lastFingerprint = fingerprint;
    lastHealth = { ...health };
    lastSentAt = Date.now();
    try { chrome.runtime.sendMessage({ type: 'provider_health_update', health })?.catch?.(() => {}); } catch {}
  }

  function schedule(delay = 500) {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; emitHealth(); }, delay);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'provider_health_ping') {
        sendResponse({ ok: true, adapter: 'provider-health' });
        return true;
      }
      if (msg?.type === 'provider_health_snapshot') {
        const health = currentHealth();
        lastHealth = { ...health };
        sendResponse({ ok: true, health });
        return true;
      }
    });
  }

  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const start = () => {
      if (!document.body) return setTimeout(start, 100);
      new MutationObserver(() => schedule()).observe(document.body, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['aria-live', 'aria-hidden', 'class', 'data-testid']
      });
      emitHealth();
      setInterval(() => emitHealth(), 15000);
    };
    start();
  }

  const api = {
    SELECTOR, CONVERSATION_SELECTOR, RULES, clean, durationMs, resetHint,
    classifyText, isConversationNode, candidateTexts, bestIssue, summary, currentHealth
  };
  globalThis.BrowserAiBridgeProviderHealthContent = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();