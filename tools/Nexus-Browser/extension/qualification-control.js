(() => {
  const warmTargetApi = globalThis.BrowserAiBridgeQualificationWarmTarget || (typeof module !== 'undefined' && module.exports ? require('./qualification-warm-target.js') : null);
  const KEY_PREFIX = 'browser-ai-bridge.qualification.v1.';
  const DEFAULT_TTL_MS = 12 * 60 * 1000;

  function clean(value, max = 4096) {
    return String(value || '').trim().slice(0, max);
  }

  function sameUrl(left, right) {
    const a = clean(left).replace(/\/$/, '');
    const b = clean(right).replace(/\/$/, '');
    return !!a && a === b;
  }

  function coded(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function createControl({
    chromeApi = globalThis.chrome,
    storage = chromeApi?.storage?.session,
    now = () => Date.now(),
    ttlMs = DEFAULT_TTL_MS,
    matchesProvider = () => false
  } = {}) {
    const closingTabs = new Set();

    function key(runId) {
      const id = clean(runId, 160);
      if (!id) throw coded('QUALIFICATION_RUN_REQUIRED', 'Qualification runId is required.');
      return KEY_PREFIX + id;
    }

    async function rawRead(runId) {
      if (!storage?.get) throw coded('QUALIFICATION_STORAGE_UNAVAILABLE', 'Qualification session storage is unavailable.');
      const result = await storage.get(key(runId));
      return result?.[key(runId)] || null;
    }

    async function write(record) {
      if (!storage?.set) throw coded('QUALIFICATION_STORAGE_UNAVAILABLE', 'Qualification session storage is unavailable.');
      await storage.set({ [key(record.runId)]: record });
      return record;
    }

    async function remove(runId) {
      if (storage?.remove) await storage.remove(key(runId));
    }

    async function requireRun(runId) {
      const record = await rawRead(runId);
      if (!record) throw coded('QUALIFICATION_NOT_OWNED', 'No live qualification ownership record exists for this run.');
      if (Number(record.expiresAt || 0) <= now()) {
        await remove(runId);
        throw coded('QUALIFICATION_EXPIRED', 'Qualification ownership expired and was discarded.');
      }
      if (!record.disposable || clean(record.runId) !== clean(runId)) {
        throw coded('QUALIFICATION_NOT_DISPOSABLE', 'Qualification resource is not a disposable resource owned by this run.');
      }
      return record;
    }

    async function activeTabId() {
      const tabs = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      return Number.isInteger(Number(tabs?.[0]?.id)) ? Number(tabs[0].id) : null;
    }

    async function tabIds() {
      const tabs = await chromeApi.tabs.query({});
      return (tabs || []).map((tab) => Number(tab.id)).filter(Number.isInteger);
    }

    async function begin({ runId, providerId, url, previousTarget = null }) {
      const id = clean(runId, 160);
      const provider = clean(providerId, 80);
      const exactUrl = clean(url);
      if (!id || !provider || !exactUrl) throw coded('QUALIFICATION_BAD_BEGIN', 'runId, providerId, and exact URL are required.');
      if (!matchesProvider(provider, exactUrl)) throw coded('QUALIFICATION_BAD_URL', 'Qualification URL does not match the requested provider.');
      const existing = await rawRead(id);
      if (existing && Number(existing.expiresAt || 0) > now()) {
        throw coded('QUALIFICATION_ALREADY_ACTIVE', 'This qualification run already owns resources.');
      }
      if (existing) await remove(id);
      const baselineTabIds = await tabIds();
      const foregroundBefore = await activeTabId();
      const tab = await chromeApi.tabs.create({ url: exactUrl, active: false });
      if (!Number.isInteger(Number(tab?.id))) throw coded('QUALIFICATION_TAB_CREATE_FAILED', 'Chrome did not create the qualification tab.');
      const createdAt = now();
      const record = {
        runId: id,
        providerId: provider,
        url: exactUrl,
        tabId: Number(tab.id),
        originalTabId: Number(tab.id),
        replacementTabId: null,
        pendingReplacementTabId: null,
        foregroundBefore,
        baselineTabIds,
        previousTarget: previousTarget || null,
        recoveryTarget: null,
        promptSubmissions: 0,
        promptClaimedRequestId: null,
        promptRequestIds: [],
        disposable: true,
        phase: 'active',
        closeConsumed: false,
        cleanupConsumed: false,
        createdAt,
        expiresAt: createdAt + Math.max(30_000, Number(ttlMs) || DEFAULT_TTL_MS)
      };
      await write(record);
      return { record: { ...record }, tab, createdActive: false };
    }

    async function syncUrl({ runId, providerId, tabId }) {
      const record = await requireRun(runId);
      if (clean(providerId) !== record.providerId || Number(tabId) !== Number(record.tabId)) {
        throw coded('QUALIFICATION_OWNERSHIP_MISMATCH', 'Qualification provider/tab ownership does not match.');
      }
      const tab = await chromeApi.tabs.get(Number(record.tabId));
      const currentUrl = clean(tab?.url || tab?.pendingUrl);
      if (!currentUrl || !matchesProvider(record.providerId, currentUrl)) {
        throw coded('QUALIFICATION_PROVIDER_MISMATCH', 'Owned tab is no longer on the qualification provider.');
      }
      record.url = currentUrl;
      await write(record);
      return { record: { ...record }, tab };
    }

    async function closeOwned({ runId, providerId, tabId, url }) {
      const record = await requireRun(runId);
      if (record.closeConsumed || record.phase !== 'active') {
        throw coded('QUALIFICATION_CLOSE_CONSUMED', 'Qualification close action is one-shot and has already been consumed.');
      }
      if (clean(providerId) !== record.providerId || Number(tabId) !== Number(record.tabId) || !sameUrl(url, record.url)) {
        throw coded('QUALIFICATION_OWNERSHIP_MISMATCH', 'Qualification close refused because exact ownership metadata did not match.');
      }
      const tab = await chromeApi.tabs.get(Number(record.tabId));
      const currentUrl = clean(tab?.url || tab?.pendingUrl);
      if (!sameUrl(currentUrl, record.url) || !matchesProvider(record.providerId, currentUrl)) {
        throw coded('QUALIFICATION_URL_MISMATCH', 'Qualification close refused because the owned tab URL changed.');
      }
      const before = new Set(record.baselineTabIds || []);
      record.closeConsumed = true;
      record.phase = 'closed';
      await write(record);
      const closingId = Number(record.tabId);
      closingTabs.add(closingId);
      try { await chromeApi.tabs.remove(closingId); }
      catch (error) { closingTabs.delete(closingId); throw error; }
      const remaining = new Set(await tabIds());
      const unrelatedTabsMissing = [...before].filter((id) => id !== Number(record.originalTabId) && !remaining.has(id)).length;
      return {
        originalTabId: Number(record.originalTabId),
        foregroundBefore: record.foregroundBefore,
        foregroundAfter: await activeTabId(),
        unrelatedTabsMissing
      };
    }

    async function registerReplacementCandidate({ runId, providerId, url, tab, created }) {
      const record = await requireRun(runId);
      const tabId = Number(tab?.id);
      if (!record.closeConsumed || record.phase !== 'closed') {
        throw coded('QUALIFICATION_NOT_READY_FOR_REPLACEMENT', 'Qualification replacement can only follow the owned one-shot close.');
      }
      if (!created || !Number.isInteger(tabId) || (record.baselineTabIds || []).includes(tabId)) {
        throw coded('QUALIFICATION_REUSED_UNOWNED_TAB', 'Production resurrection did not create a new qualification-owned tab.');
      }
      if (clean(providerId) !== record.providerId || !sameUrl(url, record.url)) {
        throw coded('QUALIFICATION_REPLACEMENT_MISMATCH', 'Replacement candidate did not match the qualification provider URL.');
      }
      record.pendingReplacementTabId = tabId;
      await write(record);
      return { ...record };
    }

    async function adoptReplacement({ runId, providerId, url, tab, created }) {
      const record = await requireRun(runId);
      const tabId = Number(tab?.id);
      const currentUrl = clean(tab?.url || tab?.pendingUrl);
      if (!record.closeConsumed || record.phase !== 'closed') {
        throw coded('QUALIFICATION_NOT_READY_FOR_REPLACEMENT', 'Qualification replacement can only follow the owned one-shot close.');
      }
      if (!created || !Number.isInteger(tabId) || (record.baselineTabIds || []).includes(tabId) || Number(record.pendingReplacementTabId) !== tabId) {
        throw coded('QUALIFICATION_REUSED_UNOWNED_TAB', 'Production resurrection did not create and register a new qualification-owned tab.');
      }
      if (clean(providerId) !== record.providerId || !sameUrl(url, record.url) || !sameUrl(currentUrl, record.url)) {
        throw coded('QUALIFICATION_REPLACEMENT_MISMATCH', 'Replacement tab did not match the exact qualification provider URL.');
      }
      record.tabId = tabId;
      record.replacementTabId = tabId;
      record.pendingReplacementTabId = null;
      record.phase = 'replacement';
      await write(record);
      return { ...record };
    }

    async function bindRecoveryTarget({ runId, providerId, tab, source, foregroundBefore, selectionBefore }) {
      const record = await requireRun(runId), tabId = Number(tab?.id), currentUrl = clean(tab?.url || tab?.pendingUrl);
      if (clean(providerId) !== record.providerId || !Number.isInteger(tabId) || !(record.baselineTabIds || []).map(Number).includes(tabId)) {
        throw coded('QUALIFICATION_WARM_TARGET_NOT_PREEXISTING', 'Warm recovery target must be a provider tab that existed before qualification began.');
      }
      const ownedIds = [record.originalTabId, record.replacementTabId, record.pendingReplacementTabId].filter((value) => value != null).map(Number);
      if (ownedIds.includes(tabId)) throw coded('QUALIFICATION_WARM_TARGET_OWNED', 'Qualification-owned tabs cannot be reused as warm recovery targets.');
      if (!currentUrl || !matchesProvider(record.providerId, currentUrl) || tab?.discarded) throw coded('QUALIFICATION_WARM_TARGET_NOT_READY', 'Warm recovery target is not a live matching provider tab.');
      record.recoveryTarget = { tabId, providerId: record.providerId, url: currentUrl, source: clean(source, 80), foregroundBefore: foregroundBefore == null ? null : Number(foregroundBefore), selectionBefore: selectionBefore || null, selectedAt: now() };
      await write(record);
      return { ...record.recoveryTarget };
    }

    async function assertPromptTarget({ runId, providerId, tabId, text = null }) {
      const record = await requireRun(runId);
      const expected = record.recoveryTarget || { tabId: record.tabId, providerId: record.providerId, url: record.url };
      if ((providerId != null && clean(providerId) !== record.providerId) || (tabId != null && Number(tabId) !== Number(expected.tabId))) throw coded('QUALIFICATION_TARGET_MISMATCH', 'Selected target is not authorized for this qualification prompt/capture.');
      if (text != null && clean(text, 2000) !== 'QUALIFY_' + record.runId) throw coded('QUALIFICATION_PROMPT_REFUSED', 'Qualification may send only its generated harmless marker prompt.');
      const tab = await chromeApi.tabs.get(Number(expected.tabId)), currentUrl = clean(tab?.url || tab?.pendingUrl);
      if (!currentUrl || !sameUrl(currentUrl, expected.url) || !matchesProvider(record.providerId, currentUrl)) throw coded('QUALIFICATION_TARGET_CHANGED', 'Qualification prompt/capture target changed URL or provider after authorization.');
      return { record, tab, currentUrl, targetMode: record.recoveryTarget ? 'preexisting-warm' : 'disposable-background' };
    }

    async function claimPrompt(input) {
      const owned = await assertPromptTarget(input);
      const record = owned.record;
      const requestId = clean(input.requestId, 200);
      if (!requestId) throw coded('QUALIFICATION_REQUEST_REQUIRED', 'Qualification prompt requestId is required.');
      if (record.promptClaimedRequestId || Number(record.promptSubmissions || 0) > 0) {
        throw coded('QUALIFICATION_PROMPT_CONSUMED', 'Qualification prompt capability has already been consumed for this run.');
      }
      record.promptClaimedRequestId = requestId;
      if (record.recoveryTarget) record.recoveryTarget.url = owned.currentUrl;
      else record.url = owned.currentUrl;
      await write(record);
      return { ...record };
    }

    async function notePrompt(input) {
      const record = await requireRun(input.runId);
      const expected = record.recoveryTarget || { tabId: record.tabId, providerId: record.providerId, url: record.url };
      if (clean(input.providerId) !== record.providerId || Number(input.tabId) !== Number(expected.tabId)) {
        throw coded('QUALIFICATION_TARGET_MISMATCH', 'Selected target is not authorized for this qualification prompt/capture.');
      }
      if (clean(input.text, 2000) !== 'QUALIFY_' + record.runId) {
        throw coded('QUALIFICATION_PROMPT_REFUSED', 'Qualification may send only its generated harmless marker prompt.');
      }
      const requestId = clean(input.requestId, 200);
      if (!requestId || record.promptClaimedRequestId !== requestId) {
        throw coded('QUALIFICATION_PROMPT_NOT_CLAIMED', 'Qualification prompt completion did not match the persisted one-shot claim.');
      }
      const tab = await chromeApi.tabs.get(Number(expected.tabId));
      const currentUrl = clean(tab?.url || tab?.pendingUrl);
      if (!currentUrl || !matchesProvider(record.providerId, currentUrl)) {
        throw coded('QUALIFICATION_TARGET_CHANGED', 'Qualification prompt target left the authorized provider after submission.');
      }
      if (record.recoveryTarget) record.recoveryTarget.url = currentUrl;
      else record.url = currentUrl;
      record.promptSubmissions = 1;
      record.promptRequestIds = [requestId];
      await write(record);
      return { ...record };
    }

    async function inspect(runId) {
      const record = await requireRun(runId);
      let tab = null;
      try { tab = await chromeApi.tabs.get(Number(record.tabId)); } catch {}
      return {
        runId: record.runId,
        providerId: record.providerId,
        url: record.url,
        tabId: Number(record.tabId),
        originalTabId: Number(record.originalTabId),
        replacementTabId: record.replacementTabId == null ? null : Number(record.replacementTabId),
        pendingReplacementTabId: record.pendingReplacementTabId == null ? null : Number(record.pendingReplacementTabId),
        foregroundBefore: record.foregroundBefore,
        foregroundNow: await activeTabId(),
        promptSubmissions: Number(record.promptSubmissions || 0),
        promptClaimedRequestId: record.promptClaimedRequestId || null,
        promptRequestIds: [...(record.promptRequestIds || [])],
        phase: record.phase,
        disposable: record.disposable === true,
        tabPresent: !!tab,
        expiresAt: record.expiresAt,
        previousTarget: record.previousTarget || null,
        recoveryTarget: record.recoveryTarget ? { ...record.recoveryTarget } : null
      };
    }

    async function cleanup({ runId, providerId }) {
      const record = await requireRun(runId);
      if (record.cleanupConsumed) throw coded('QUALIFICATION_CLEANUP_CONSUMED', 'Qualification cleanup is one-shot.');
      if (clean(providerId) !== record.providerId) throw coded('QUALIFICATION_OWNERSHIP_MISMATCH', 'Qualification cleanup provider did not match.');
      record.cleanupConsumed = true;
      await write(record);
      let warmTargetPreserved = null, warmTargetUrlUnchanged = null;
      const recoveryTarget = record.recoveryTarget ? { ...record.recoveryTarget } : null;
      if (recoveryTarget) {
        try { const warm = await chromeApi.tabs.get(Number(recoveryTarget.tabId)); warmTargetPreserved = true; warmTargetUrlUnchanged = sameUrl(clean(warm?.url || warm?.pendingUrl), recoveryTarget.url); }
        catch { warmTargetPreserved = false; warmTargetUrlUnchanged = false; }
      }
      let removed = false;
      const ids = [...new Set([record.tabId, record.pendingReplacementTabId]
        .filter((value) => value != null).map(Number))];
      for (const closingId of ids) {
        try {
          const tab = await chromeApi.tabs.get(closingId);
          const currentUrl = clean(tab?.url || tab?.pendingUrl);
          if (!matchesProvider(record.providerId, currentUrl)) {
            throw coded('QUALIFICATION_PROVIDER_MISMATCH', 'Cleanup refused because an owned qualification tab left its provider.');
          }
          if (closingId === Number(record.tabId)) record.url = currentUrl;
          await write(record);
          closingTabs.add(closingId);
          try { await chromeApi.tabs.remove(closingId); }
          catch (error) { closingTabs.delete(closingId); throw error; }
          removed = true;
        } catch (error) {
          if (error?.code) throw error;
        }
      }
      const previousTarget = record.previousTarget || null, foregroundAfter = await activeTabId();
      await remove(runId);
      return { removed, previousTarget, recoveryTarget, recoveryTargetUsed: !!recoveryTarget, warmTargetPreserved, warmTargetUrlUnchanged, focusSteal: recoveryTarget ? recoveryTarget.foregroundBefore !== foregroundAfter : false, foregroundAfter };
    }

    function consumeClosingTab(tabId) {
      const id = Number(tabId);
      if (!closingTabs.has(id)) return false;
      closingTabs.delete(id);
      return true;
    }

    return { begin, syncUrl, closeOwned, registerReplacementCandidate, adoptReplacement, bindRecoveryTarget, assertPromptTarget, claimPrompt, notePrompt, inspect, cleanup, requireRun, consumeClosingTab };
  }

  async function handleCommand(control, msg, deps = {}) {
    if (!msg?.type?.startsWith?.('qualification_')) return false;
    const runId = clean(msg.runId || msg.qualification?.runId, 160);
    const respond = (action, ok, data = null, error = null) => deps.safeSend?.({
      type: 'qualification_result', requestId: msg.requestId || null, runId, action, ok,
      ...(data ? { data } : {}),
      ...(error ? { code: error.code || 'QUALIFICATION_FAILED', message: error.message } : {})
    });
    try {
      if (msg.type === 'qualification_open_target') {
        const provider = deps.getProvider?.(msg.providerId);
        const url = clean(msg.url);
        if (!provider || !deps.providerMatchesUrl?.(provider, url)) throw coded('QUALIFICATION_BAD_URL', 'Qualification requires an exact supported provider URL.');
        const previousTarget = await deps.getSelection?.();
        const opened = await control.begin({ runId, providerId: provider.id, url, previousTarget });
        let tab = opened.tab;
        if (tab.status !== 'complete') tab = await deps.waitForTabComplete(tab.id);
        await control.syncUrl({ runId, providerId: provider.id, tabId: tab.id });
        await deps.selectTarget(Number(tab.id), provider.id);
        respond('open_target', true, { ...(await control.inspect(runId)), createdActive: false });
        return true;
      }
      if (msg.type === 'qualification_close_target') {
        respond('close_target', true, await control.closeOwned(msg));
        return true;
      }
      if (msg.type === 'qualification_ensure_target') {
        const record = await control.requireRun(runId);
        const provider = deps.getProvider?.(msg.providerId);
        const url = clean(msg.url);
        if (!provider || provider.id !== record.providerId || !sameUrl(url, record.url)) {
          throw coded('QUALIFICATION_REPLACEMENT_MISMATCH', 'Qualification replacement metadata did not match the owned run.');
        }
        const ensured = await deps.targetResurrectionApi.ensure({ provider, url: record.url, chromeApi: deps.chromeApi, open: true });
        let tab = ensured.tab;
        if (!tab?.id) throw coded('QUALIFICATION_RESURRECTION_FAILED', 'Production target resurrection did not return a tab.');
        if (ensured.created) await control.registerReplacementCandidate({ runId, providerId: provider.id, url: record.url, tab, created: true });
        if (tab.status !== 'complete') tab = await deps.waitForTabComplete(tab.id);
        await control.adoptReplacement({ runId, providerId: provider.id, url: record.url, tab, created: ensured.created });
        await deps.selectTarget(Number(tab.id), provider.id);
        respond('ensure_target', true, { ...(await control.inspect(runId)), created: ensured.created, backgroundOnly: ensured.created === true });
        return true;
      }
      if (msg.type === 'qualification_select_recovery_target') {
        const data = await warmTargetApi.selectRecoveryTarget({
          control, runId, providerId: msg.providerId,
          requestedTabId: msg.tabId == null ? null : Number(msg.tabId), deps
        });
        respond('select_recovery_target', true, data);
        return true;
      }
      if (msg.type === 'qualification_inspect') {
        respond('inspect', true, await control.inspect(runId));
        return true;
      }
      if (msg.type === 'qualification_cleanup') {
        const cleaned = await control.cleanup({ runId, providerId: msg.providerId });
        if (cleaned.previousTarget?.tabId) {
          try { await deps.selectTarget(Number(cleaned.previousTarget.tabId), cleaned.previousTarget.providerId, cleaned.recoveryTarget && Number(cleaned.recoveryTarget.tabId) === Number(cleaned.previousTarget.tabId) ? { readyOnly: true } : {}); }
          catch { await deps.clearSelectedTarget?.(); }
        } else await deps.clearSelectedTarget?.();
        await deps.publishTabs?.({ force: true });
        const restored = cleaned.previousTarget?.tabId
          ? Number((await deps.getSelection?.())?.tabId) === Number(cleaned.previousTarget.tabId)
          : !(await deps.getSelection?.());
        const activeAfter = await deps.chromeApi?.tabs?.query?.({ active: true, lastFocusedWindow: true });
        const foregroundAfter = Number.isInteger(Number(activeAfter?.[0]?.id)) ? Number(activeAfter[0].id) : cleaned.foregroundAfter;
        const focusSteal = cleaned.recoveryTarget ? Number(cleaned.recoveryTarget.foregroundBefore) !== Number(foregroundAfter) : false;
        respond('cleanup', true, { ...cleaned, foregroundAfter, focusSteal, previousTargetRestored: restored });
        return true;
      }
      return false;
    } catch (error) {
      respond(msg.type.replace('qualification_', ''), false, null, error);
      return true;
    }
  }

  const api = { KEY_PREFIX, DEFAULT_TTL_MS, clean, sameUrl, coded, createControl, handleCommand };
  globalThis.BrowserAiBridgeQualificationControl = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
