(() => {
  function clean(value, max = 240) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function blocking(health) {
    return !!health?.blocking && health?.state !== 'ready';
  }

  function targetForMember(member, tabs = []) {
    const binding = member?.binding || {};
    if (binding.targetClassId !== 'online-origin') return null;
    return tabs.find((tab) => String(tab.id) === String(binding.targetId) && tab.providerId === binding.providerId)
      || tabs.find((tab) => tab.providerId === binding.providerId && binding.url && tab.url === binding.url)
      || null;
  }

  function cooldownText(health, now = Date.now()) {
    const until = Date.parse(health?.cooldownUntil || '');
    if (!Number.isFinite(until) || until <= now) return health?.resetText ? clean(health.resetText) : '';
    const ms = until - now, minutes = Math.ceil(ms / 60000);
    if (minutes >= 1440) return `~${Math.ceil(minutes / 1440)} day(s) remaining`;
    if (minutes >= 60) return `~${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
    return `~${minutes}m remaining`;
  }

  function describe(health, now = Date.now()) {
    if (!health) return 'status unknown';
    if (!blocking(health)) return 'ready';
    const wait = cooldownText(health, now);
    const action = {
      rate_limited: 'wait for provider quota reset',
      conversation_limit: 'move this participant to a new chat',
      auth_required: 'sign in again',
      provider_unavailable: 'retry later or switch provider'
    }[health.state] || clean(health.action) || 'operator action required';
    return [clean(health.summary) || health.state, `action: ${action}`, wait].filter(Boolean).join(' · ');
  }

  function roomContext(room, tabs = [], now = Date.now()) {
    const lines = [];
    for (const member of room?.members || []) {
      if (member?.binding?.targetClassId !== 'online-origin') continue;
      const target = targetForMember(member, tabs);
      const provider = member.binding.providerName || member.binding.providerId || 'Provider';
      lines.push(`- ${member.name || 'Agent'} [${provider}]: ${describe(target?.health, now)}`);
    }
    return lines.join('\n') || '- no online provider participants';
  }

  function blockMessage(member, health, now = Date.now()) {
    const name = clean(member?.name, 48) || 'Agent';
    return `${name} provider health blocked this turn: ${describe(health, now)}.`;
  }

  function stopReason(health) {
    if (health?.state === 'rate_limited') return 'Provider quota cooldown';
    if (health?.state === 'conversation_limit') return 'Provider chat limit reached';
    if (health?.state === 'auth_required') return 'Provider sign-in required';
    return 'Provider unavailable';
  }

  function applyEvent(state, msg, { renderAll } = {}) {
    const tabId = Number(msg?.tabId);
    const target = (state?.tabs || []).find((tab) => Number(tab.id) === tabId && tab.providerId === msg.providerId);
    if (target) target.health = msg.health || null;
    if (state?.onlineTarget && Number(state.onlineTarget.id) === tabId) state.onlineTarget.health = msg.health || null;
    renderAll?.();
    return !!target;
  }

  const api = { clean, blocking, targetForMember, cooldownText, describe, roomContext, blockMessage, stopReason, applyEvent };
  globalThis.BrowserAiBridgeDexProviderHealth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();