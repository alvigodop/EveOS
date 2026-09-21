(() => {
  function spawnUrl(provider) {
    return String(provider?.orchestration?.spawnUrl || '').trim();
  }

  function providerMatches(provider, url) {
    const value = String(url || '');
    return !!provider && !!value && (provider.urlPrefixes || []).some((prefix) => value.startsWith(prefix));
  }

  function sameSpawnSurface(actual, expected) {
    try {
      const left = new URL(String(actual || ''));
      const right = new URL(String(expected || ''));
      const path = (value) => value === '/' ? '/' : value.replace(/\/+$/, '');
      return left.origin === right.origin && path(left.pathname) === path(right.pathname);
    } catch {
      return false;
    }
  }


  function needsFirstTurnPrime(provider) {
    return provider?.orchestration?.firstTurnPrime === true;
  }

  function establishedManagedSurface(actual, provider) {
    const value = String(actual || '');
    const prefix = String(provider?.orchestration?.establishedUrlPrefix || '').trim();
    return !!prefix && value.startsWith(prefix) && !sameSpawnSurface(value, spawnUrl(provider));
  }

  function normalizePrimeEcho(value) {
    return String(value || '').trim().replace(/[.!?…]+$/u, '');
  }

  async function primeManagedWorker(tabId, provider, chromeApi, {
    requestId = '',
    timeoutMs = 16000,
    stableSamples = 2,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    if (!needsFirstTurnPrime(provider)) return { ok: true, ready: true, skipped: true };

    const seed = String(requestId || tabId).replace(/[^a-z0-9]/gi, '').slice(-32) || String(tabId);
    const echo = `MW_READY_${seed}`;
    const primeRequestId = `managed-prime-${String(requestId || tabId).slice(-120)}`;
    const prompt = `Disposable managed-worker readiness check. Reply exactly with: ${echo}`;

    let accepted = null;
    try {
      accepted = await chromeApi.tabs.sendMessage(tabId, {
        type: 'send_prompt',
        requestId: primeRequestId,
        text: prompt
      });
    } catch (error) {
      const failure = new Error(`Managed ${provider.name} worker readiness prime could not be submitted: ${error?.message || error}`);
      failure.code = 'DEX_CONTROL_SPAWN_PRIME_REJECTED';
      throw failure;
    }
    if (!accepted?.ok) {
      const failure = new Error(accepted?.error || `Managed ${provider.name} worker readiness prime was rejected.`);
      failure.code = accepted?.code || 'DEX_CONTROL_SPAWN_PRIME_REJECTED';
      failure.detail = accepted?.detail || null;
      throw failure;
    }
    if (accepted.deliveryProof?.committed !== true) {
      const failure = new Error(`Managed ${provider.name} worker readiness prime was not proven committed.`);
      failure.code = 'DEX_CONTROL_SPAWN_PRIME_UNCOMMITTED';
      failure.detail = { deliveryProof: accepted.deliveryProof || null };
      throw failure;
    }

    const attempts = Math.max(stableSamples, Math.ceil(Math.max(250, timeoutMs) / 250));
    let consecutive = 0;
    let last = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const capture = await chromeApi.tabs.sendMessage(tabId, {
          type: 'capture_latest',
          requestId: primeRequestId
        });
        const tab = await chromeApi.tabs.get(tabId);
        const currentUrl = tab?.url || tab?.pendingUrl || '';
        last = { capture, currentUrl };
        const exactEcho = capture?.ok
          && capture.isGenerating !== true
          && normalizePrimeEcho(capture.text) === normalizePrimeEcho(echo);
        if (exactEcho && establishedManagedSurface(currentUrl, provider)) consecutive += 1;
        else consecutive = 0;
        if (consecutive >= stableSamples) {
          return {
            ok: true,
            ready: true,
            echo,
            url: currentUrl,
            deliveryProof: accepted.deliveryProof
          };
        }
      } catch {
        consecutive = 0;
      }
      await sleep(250);
    }

    const failure = new Error(`Managed ${provider.name} worker did not establish a committed first-turn conversation before timeout.`);
    failure.code = 'DEX_CONTROL_SPAWN_PRIME_TIMEOUT';
    failure.detail = {
      expectedEcho: echo,
      observedText: String(last?.capture?.text || '').slice(0, 240),
      observedUrl: last?.currentUrl || ''
    };
    throw failure;
  }

  async function waitForManagedWorkerReady(tabId, provider, chromeApi, {
    timeoutMs = 12000,
    stableSamples = 2,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    const probeType = String(provider?.orchestration?.readinessProbe || '').trim();
    if (!probeType) return { ok: true, ready: true, skipped: true };
    const started = Date.now();
    let consecutive = 0;
    let last = null;
    while (Date.now() - started < timeoutMs) {
      try { last = await chromeApi.tabs.sendMessage(tabId, { type: probeType }); }
      catch { last = null; }
      if (last?.ok && last.ready === true) consecutive += 1;
      else consecutive = 0;
      if (consecutive >= stableSamples) return last;
      await sleep(250);
    }
    const error = new Error(`Managed ${provider.name} worker did not become first-turn ready before timeout${last?.reason ? `: ${last.reason}` : ''}.`);
    error.code = 'DEX_CONTROL_SPAWN_NOT_READY';
    throw error;
  }

  function publicTarget(tab, provider) {
    return {
      id: tab.id,
      title: tab.title || provider.name,
      url: tab.url || tab.pendingUrl || '',
      providerId: provider.id,
      providerName: provider.name,
      capabilities: { ...(provider.capabilities || {}) }
    };
  }

  async function spawn(msg, deps) {
    const { chromeApi, getProvider, waitForTabComplete, ensureProviderAdapter, publishTabs, safeSend } = deps;
    const provider = getProvider(String(msg.providerId || ''));
    const url = spawnUrl(provider);
    if (!provider || !url) {
      const error = new Error('That provider is not enabled for managed fresh-chat spawning.');
      error.code = 'DEX_CONTROL_PROVIDER_NOT_SPAWNABLE';
      throw error;
    }

    let tab = null;
    let phase = 'create-tab';
    try {
      tab = await chromeApi.tabs.create({ url, active: false });
      if (!tab?.id) throw new Error('Browser did not create the managed provider tab.');
      phase = 'wait-tab-complete';
      if (tab.status !== 'complete') tab = await waitForTabComplete(tab.id);
      phase = 'validate-fresh-surface';
      const loadedUrl = tab.url || tab.pendingUrl;
      if (!providerMatches(provider, loadedUrl)) {
        const error = new Error('Managed provider tab navigated outside the requested provider.');
        error.code = 'DEX_CONTROL_SPAWN_PROVIDER_MISMATCH';
        throw error;
      }
      if (!sameSpawnSurface(loadedUrl, url)) {
        const error = new Error('Managed provider tab did not remain on the canonical fresh-chat surface.');
        error.code = 'DEX_CONTROL_SPAWN_NOT_FRESH';
        throw error;
      }

      phase = 'ensure-provider-adapter';
      await ensureProviderAdapter(tab.id, provider);
      phase = 'first-turn-prime';
      const primed = await primeManagedWorker(tab.id, provider, chromeApi, { requestId: msg.requestId || '' });
      if (primed?.skipped) {
        phase = 'passive-readiness';
        await waitForManagedWorkerReady(tab.id, provider, chromeApi);
      }
      phase = 'validate-binding-surface';
      tab = await chromeApi.tabs.get(tab.id);
      const bindingSurfaceReady = needsFirstTurnPrime(provider)
        ? establishedManagedSurface(tab.url || tab.pendingUrl, provider)
        : sameSpawnSurface(tab.url || tab.pendingUrl, url);
      if (!bindingSurfaceReady) {
        const error = new Error('Managed provider tab did not reach the required first-turn conversation surface before binding.');
        error.code = 'DEX_CONTROL_SPAWN_NOT_FRESH';
        throw error;
      }
      phase = 'publish-target';
      await publishTabs({ force: true });
      phase = 'commit-target-result';
      if (!safeSend({
        type: 'target_spawned',
        requestId: msg.requestId || null,
        target: publicTarget(tab, provider)
      })) {
        const error = new Error('Managed provider target could not be committed to localhost.');
        error.code = 'DEX_CONTROL_SPAWN_RESULT_OFFLINE';
        throw error;
      }
      return true;
    } catch (error) {
      let observedUrl = tab?.url || tab?.pendingUrl || '';
      if (tab?.id) {
        try {
          const current = await chromeApi.tabs.get(Number(tab.id));
          observedUrl = current?.url || current?.pendingUrl || observedUrl;
        } catch {}
      }
      const detail = error?.detail && typeof error.detail === 'object' ? error.detail : {};
      error.detail = {
        ...detail,
        spawnEvidence: {
          phase,
          requestId: msg.requestId || null,
          tabId: tab?.id ?? null,
          providerId: provider.id,
          spawnUrl: url,
          observedUrl
        }
      };
      if (tab?.id) await chromeApi.tabs.remove(Number(tab.id)).catch(() => {});
      await publishTabs({ force: true }).catch(() => {});
      throw error;
    }
  }

  async function close(msg, deps) {
    const { chromeApi, getProvider, publishTabs, safeSend } = deps;
    const tabId = Number(msg.tabId);
    const provider = getProvider(String(msg.providerId || ''));
    if (!Number.isInteger(tabId) || !provider) {
      const error = new Error('Managed target close requires an exact tabId and providerId.');
      error.code = 'DEX_CONTROL_CLOSE_TARGET_INVALID';
      throw error;
    }

    let tab = null;
    try { tab = await chromeApi.tabs.get(tabId); } catch {}
    if (tab && !providerMatches(provider, tab.url || tab.pendingUrl)) {
      const error = new Error('Refusing to close a tab that no longer matches the managed provider binding.');
      error.code = 'DEX_CONTROL_CLOSE_TARGET_MISMATCH';
      throw error;
    }
    if (tab) await chromeApi.tabs.remove(tabId);
    await publishTabs({ force: true });
    safeSend({
      type: 'target_closed',
      requestId: msg.requestId || null,
      tabId,
      providerId: provider.id,
      alreadyClosed: !tab
    });
    return true;
  }

  async function handle(msg, deps) {
    if (msg?.type === 'spawn_target') return spawn(msg, deps);
    if (msg?.type === 'close_target') return close(msg, deps);
    return false;
  }

  const api = {
    spawnUrl, providerMatches, sameSpawnSurface, needsFirstTurnPrime, establishedManagedSurface,
    normalizePrimeEcho, primeManagedWorker, waitForManagedWorkerReady, publicTarget, spawn, close, handle
  };
  globalThis.BrowserAiBridgeProviderTargetSpawn = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
