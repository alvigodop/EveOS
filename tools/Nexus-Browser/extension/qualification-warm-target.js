(() => {
  const DEFAULT_PROBE_TIMEOUT_MS = 1600;
  const clean = (value, max = 4096) => String(value || '').trim().slice(0, max);
  const coded = (code, message) => Object.assign(new Error(message), { code });
  const tabUrl = (tab) => clean(tab?.url || tab?.pendingUrl);
  const warmUrlAllowed = (provider, url) => !(provider?.qualification?.deniedWarmUrlPrefixes || [])
    .some((prefix) => clean(url).startsWith(prefix));

  async function probeGroup(chromeApi, tabId, group, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
    try {
      const probe = chromeApi.tabs.sendMessage(Number(tabId), { type: group.pingType });
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
      const reply = await Promise.race([probe, timeout]);
      return !!reply?.ok && (!group.expectedAdapter || reply.adapter === group.expectedAdapter);
    } catch { return false; }
  }

  async function probeProviderReady(chromeApi, provider, tabId, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
    for (const group of provider?.groups || []) if (group.expectedAdapter !== 'provider-health' && !(await probeGroup(chromeApi, tabId, group, timeoutMs))) return false;
    return true;
  }

  function eligible(tab, { provider, record, matchesProvider }) {
    const id = Number(tab?.id);
    if (!Number.isInteger(id) || tab?.discarded) return false;
    if (!(record?.baselineTabIds || []).map(Number).includes(id)) return false;
    const excluded = [record.originalTabId, record.replacementTabId, record.pendingReplacementTabId]
      .filter((value) => value != null).map(Number);
    if (excluded.includes(id)) return false;
    const url = tabUrl(tab);
    return !!url && matchesProvider(provider.id, url) && warmUrlAllowed(provider, url);
  }

  async function chooseWarmTarget({
    chromeApi, provider, record, matchesProvider,
    previousTarget = record?.previousTarget || null,
    requestedTabId = null,
    probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS
  }) {
    if (!provider?.id || !record || provider.id !== record.providerId) {
      throw coded('QUALIFICATION_WARM_PROVIDER_MISMATCH', 'Warm recovery target provider did not match the live qualification run.');
    }
    if (provider.qualification?.live !== true || provider.qualification?.warmRecovery !== true || provider.qualification?.exactOnce !== true) {
      throw coded('QUALIFICATION_WARM_TARGET_UNSUPPORTED', 'Provider has not opted into the warm exact-once qualification contract.');
    }
    const tabs = await chromeApi.tabs.query({ url: provider.matchPatterns || [] });
    const preexisting = (tabs || []).filter((tab) => {
      const id = Number(tab?.id), url = tabUrl(tab);
      return Number.isInteger(id) && (record.baselineTabIds || []).map(Number).includes(id)
        && matchesProvider(provider.id, url);
    });
    if (preexisting.length && preexisting.every((tab) => !warmUrlAllowed(provider, tabUrl(tab)))) {
      throw coded('QUALIFICATION_WARM_TARGET_UNSUPPORTED', 'Only provider frontends excluded by qualification policy are available as warm targets.');
    }
    const candidates = preexisting.filter((tab) => eligible(tab, { provider, record, matchesProvider }));
    const ready = [];
    for (const tab of candidates) if (await probeProviderReady(chromeApi, provider, tab.id, probeTimeoutMs)) ready.push(tab);

    if (requestedTabId != null) {
      const pinned = candidates.find((tab) => Number(tab.id) === Number(requestedTabId));
      if (!pinned) {
        throw coded('QUALIFICATION_WARM_TARGET_PIN_INVALID', 'Pinned warm tab is not an eligible pre-existing provider target for this qualification run.');
      }
      const pinnedReady = ready.find((tab) => Number(tab.id) === Number(requestedTabId));
      if (!pinnedReady) {
        throw coded('QUALIFICATION_WARM_TARGET_PIN_NOT_READY', 'Pinned warm tab exists but is not already adapter-ready; qualification will not reload or mutate it.');
      }
      return { tab: pinnedReady, source: 'explicit-tab' };
    }

    if (previousTarget?.providerId === provider.id) {
      const preferred = ready.find((tab) => Number(tab.id) === Number(previousTarget.tabId));
      if (preferred) return { tab: preferred, source: 'previous-selected' };
    }
    if (ready.length === 1) return { tab: ready[0], source: 'single-ready-candidate' };
    if (!candidates.length) throw coded('QUALIFICATION_WARM_TARGET_NOT_FOUND', 'No pre-existing provider tab from before this qualification run is available.');
    if (!ready.length) throw coded('QUALIFICATION_WARM_TARGET_NOT_READY', 'Pre-existing provider tabs exist, but none already respond to the adapter readiness probe.');
    const choices = ready.map((tab) => `${tab.id} ${tabUrl(tab)}`).join(' | ');
    throw coded('QUALIFICATION_WARM_TARGET_AMBIGUOUS', `Multiple pre-existing ready provider tabs are available. Re-run with --warm-tab-id <id>. Ready candidates: ${choices}`);
  }

  async function selectRecoveryTarget({ control, runId, providerId, requestedTabId = null, deps }) {
    const record = await control.requireRun(runId);
    const provider = deps.getProvider?.(providerId);
    if (!provider || provider.id !== record.providerId) {
      throw coded('QUALIFICATION_WARM_PROVIDER_MISMATCH', 'Warm recovery provider did not match the live run.');
    }
    const chosen = await chooseWarmTarget({
      chromeApi: deps.chromeApi, provider, record, requestedTabId,
      matchesProvider: (id, url) => id === provider.id && deps.providerMatchesUrl?.(provider, url)
    });
    const activeBefore = await deps.chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    const foregroundBefore = Number.isInteger(Number(activeBefore?.[0]?.id)) ? Number(activeBefore[0].id) : null;
    const selectionBefore = await deps.getSelection?.();
    await deps.selectTarget(Number(chosen.tab.id), provider.id, { readyOnly: true });
    const selected = await deps.chromeApi.tabs.get(Number(chosen.tab.id));
    const activeAfter = await deps.chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    const foregroundNow = Number.isInteger(Number(activeAfter?.[0]?.id)) ? Number(activeAfter[0].id) : null;
    if (tabUrl(selected).replace(/\/$/, '') !== tabUrl(chosen.tab).replace(/\/$/, '')) {
      throw coded('QUALIFICATION_WARM_TARGET_CHANGED', 'Warm target URL changed during qualification selection.');
    }
    if (foregroundBefore !== foregroundNow) throw coded('QUALIFICATION_FOCUS_STEAL', 'Warm target selection changed the active foreground tab.');
    const bound = await control.bindRecoveryTarget({
      runId, providerId: provider.id, tab: selected, source: chosen.source, foregroundBefore, selectionBefore
    });
    return { ...bound, targetMode: 'preexisting-warm', foregroundNow, focusSteal: false, exactUrl: true };
  }

  const api = {
    DEFAULT_PROBE_TIMEOUT_MS, clean, coded, tabUrl, warmUrlAllowed,
    probeGroup, probeProviderReady, eligible, chooseWarmTarget, selectRecoveryTarget
  };
  globalThis.BrowserAiBridgeQualificationWarmTarget = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();