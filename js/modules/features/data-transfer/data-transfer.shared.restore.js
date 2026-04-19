// --- Data Transfer Shared Restore ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.sharedRestoreReady) return;

    function getAppConfig() {
        if (typeof ns.getAppConfig === 'function') return ns.getAppConfig();
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function isHttpContext() {
        if (typeof ns.isHttpContext === 'function') return ns.isHttpContext();
        return /^https?:$/i.test(window.location.protocol || '');
    }

    function robustParseJson(text) {
        if (typeof text !== 'string') return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            try {
                const repaired = text.replace(/,(\s*[\]}])/g, '$1');
                return JSON.parse(repaired);
            } catch (innerError) {
                throw error;
            }
        }
    }

    async function persistRestoredState(options = {}) {
        const skipRender = options.skipRender !== false;
        const skipSuggestions = options.skipSuggestions !== false;
        if (typeof window.saveData === 'function') {
            await Promise.resolve(window.saveData({
                immediate: true,
                skipRender,
                skipSuggestions
            }));
        }
        if (typeof window.saveConfig === 'function') {
            await Promise.resolve(window.saveConfig({ immediate: true }));
        }

        const config = getAppConfig();
        const shouldSyncModular = options.syncModular !== false
            && isHttpContext()
            && config?.modularStateSyncEnabled !== false
            && typeof window.EveDataStore?.ModularSync?.syncNow === 'function';
        if (shouldSyncModular) {
            const result = await window.EveDataStore.ModularSync.syncNow(true);
            if (result?.ok === false) {
                return {
                    ok: false,
                    error: result.error || 'Failed to sync restored state to the active data pack.'
                };
            }
        }

        return { ok: true };
    }

    async function persistAndReloadAfterRestore(options = {}) {
        const persisted = await persistRestoredState(options);
        if (!persisted?.ok) return persisted;

        const reloadUrl = String(options.reloadUrl || '').trim();
        if (reloadUrl) {
            window.location.href = reloadUrl;
            return { ok: true, reloaded: true, reloadUrl };
        }

        location.reload();
        return { ok: true, reloaded: true };
    }

    Object.assign(ns, {
        robustParseJson,
        persistRestoredState,
        persistAndReloadAfterRestore
    });

    ns.sharedRestoreReady = true;
})();
