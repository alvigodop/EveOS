(() => {
  const DEFAULT_RESPONSE_DEADLINES = Object.freeze({
    idleTimeoutMs: 4 * 60 * 1000,
    activeTimeoutMs: 10 * 60 * 1000
  });

  function positiveMs(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function nextResponseDeadline({
    startedAt,
    now = Date.now(),
    isGenerating = false,
    hasText = false,
    idleTimeoutMs = DEFAULT_RESPONSE_DEADLINES.idleTimeoutMs,
    activeTimeoutMs = DEFAULT_RESPONSE_DEADLINES.activeTimeoutMs
  } = {}) {
    const idleLimit = positiveMs(idleTimeoutMs, DEFAULT_RESPONSE_DEADLINES.idleTimeoutMs);
    const activeLimit = Math.max(
      idleLimit,
      positiveMs(activeTimeoutMs, DEFAULT_RESPONSE_DEADLINES.activeTimeoutMs)
    );
    const start = Number.isFinite(Number(startedAt)) ? Number(startedAt) : Number(now);
    const elapsedMs = Math.max(0, Number(now) - start);

    if (isGenerating) {
      const remainingMs = activeLimit - elapsedMs;
      if (remainingMs > 0) {
        return { action: 'wait', reason: 'active', delayMs: remainingMs, elapsedMs, limitMs: activeLimit };
      }
      return { action: 'timeout_active', reason: 'active', delayMs: 0, elapsedMs, limitMs: activeLimit };
    }

    if (hasText) {
      return { action: 'finalize', reason: 'text_ready', delayMs: 0, elapsedMs, limitMs: idleLimit };
    }

    const remainingMs = idleLimit - elapsedMs;
    if (remainingMs > 0) {
      return { action: 'wait', reason: 'idle', delayMs: remainingMs, elapsedMs, limitMs: idleLimit };
    }
    return { action: 'timeout_idle', reason: 'idle', delayMs: 0, elapsedMs, limitMs: idleLimit };
  }

  function minutes(ms) {
    return Math.max(1, Math.round(Number(ms || 0) / 60000));
  }

  const api = { DEFAULT_RESPONSE_DEADLINES, nextResponseDeadline, minutes };
  globalThis.BrowserAiBridgeResponseDeadline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
