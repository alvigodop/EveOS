window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

    ctx.syncTtlState = function syncTtlState(ttlMs, origin) {
        const selectors = [
            '[data-api-ttl-select="search"]',
            '[data-api-ttl-select="scraper"]'
        ];

        selectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                element.value = String(ttlMs);
            });
        });
    }

    ctx.persistTtlPreference = function persistTtlPreference(categoryName, ttlMs, origin) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const normalizedTtl = Number(ttlMs) > 0 ? Number(ttlMs) : Number(api.Cache?.DEFAULT_TTL_MS || (24 * 60 * 60 * 1000));
        if (api.Cache) {
            api.Cache.savePrefs({ ttlMs: normalizedTtl }, resolvedCategory);
        }
        ctx.syncTtlState(normalizedTtl, origin);
    }

    ctx.resolveLivePreference = async function resolveLivePreference(categoryName, explicitValue) {
        if (typeof explicitValue === 'boolean') return explicitValue;
        return api.Cache ? (await api.Cache.loadPrefs(categoryName)).liveResults === true : false;
    }

    ctx.resolveHybridPreference = async function resolveHybridPreference(categoryName, explicitValue) {
        if (typeof explicitValue === 'boolean') return explicitValue;
        return api.Cache ? (await api.Cache.loadPrefs(categoryName)).hybridResults !== false : true;
    }

    ctx.resolveOpenModePreference = async function resolveOpenModePreference(categoryName, explicitValue) {
        if (explicitValue === 'popup' || explicitValue === 'newtab') return explicitValue;
        return api.Cache ? (await api.Cache.loadPrefs(categoryName)).openMode : 'popup';
    }

    ctx.syncLiveToggleState = function syncLiveToggleState(enabled, origin) {
        const liveSelectors = [
            '[data-api-live-toggle="shared"]',
            '[data-api-live-toggle="search"]',
            '[data-api-live-toggle="scraper"]',
            '#liveSearchToggle'
        ];

        liveSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                // Only update if not currently focused to avoid "stuck" feeling during interaction
                if (document.activeElement === element) return;

                if ('checked' in element) {
                    element.checked = enabled;
                }
            });
        });
    }

    ctx.syncHybridToggleState = function syncHybridToggleState(enabled, origin) {
        const hybridSelectors = [
            '[data-api-hybrid-toggle="shared"]',
            '[data-api-hybrid-toggle="search"]',
            '[data-api-hybrid-toggle="scraper"]',
            '#hybridSearchToggle'
        ];

        hybridSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                if (document.activeElement === element) return;

                if ('checked' in element) {
                    element.checked = enabled;
                }
            });
        });
    }

    ctx.syncOpenModeState = function syncOpenModeState(mode, origin) {
        const normalizedMode = mode === 'newtab' ? 'newtab' : 'popup';
        document.querySelectorAll('[data-api-open-mode]').forEach(function (element) {
            if (element === origin) return;
            if (!('checked' in element)) return;
            element.checked = String(element.value || '').trim() === normalizedMode;
        });
    }

    ctx.persistLivePreference = async function persistLivePreference(categoryName, enabled, origin) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        if (api.Cache) {
            await api.Cache.savePrefs({ liveResults: enabled === true }, resolvedCategory);
        }
        ctx.syncLiveToggleState(enabled === true, origin);
    }

    ctx.persistHybridPreference = async function persistHybridPreference(categoryName, enabled, origin) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        if (api.Cache) {
            await api.Cache.savePrefs({ hybridResults: enabled !== false }, resolvedCategory);
        }
        ctx.syncHybridToggleState(enabled !== false, origin);
    }

    ctx.persistOpenModePreference = async function persistOpenModePreference(categoryName, mode, origin) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const normalizedMode = mode === 'newtab' ? 'newtab' : 'popup';
        if (api.Cache) {
            await api.Cache.savePrefs({ openMode: normalizedMode }, resolvedCategory);
        }
        ctx.syncOpenModeState(normalizedMode, origin);
    }

    ctx.getScopedStorageValue = function getScopedStorageValue(key, defaultValue, categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const currentManagerContext = window.StorageManager ? String(window.StorageManager.categoryContext || '').trim() : '';
        
        // If the requested category matches the current global StorageManager context, 
        // we can use its standard loadData method.
        if (window.StorageManager && typeof window.StorageManager.loadData === 'function' && resolvedCategory === currentManagerContext) {
            return window.StorageManager.loadData(key, defaultValue);
        }

        // Otherwise (or if context differs/missing), we must manually scope the key 
        // to ensure we read from the correct Card's storage prefix.
        try {
            const normalized = String(resolvedCategory || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const scopedKey = normalized ? `${normalized}_${key}` : key;
            const raw = localStorage.getItem(scopedKey);
            return raw ? JSON.parse(raw) : defaultValue;
        } catch (error) {
            console.warn('API Manager: Failed to read scoped storage', key, error);
            return defaultValue;
        }
    }

    ctx.saveScopedStorageValue = function saveScopedStorageValue(key, value, categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const currentManagerContext = window.StorageManager ? String(window.StorageManager.categoryContext || '').trim() : '';

        // Same logic: use manager if context matches, otherwise manual prefix
        if (window.StorageManager && typeof window.StorageManager.saveData === 'function' && resolvedCategory === currentManagerContext) {
            return window.StorageManager.saveData(key, value);
        }

        try {
            const normalized = String(resolvedCategory || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const scopedKey = normalized ? `${normalized}_${key}` : key;
            localStorage.setItem(scopedKey, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('API Manager: Failed to save scoped storage', key, error);
            return false;
        }
    }
})(window.EveOS.API);