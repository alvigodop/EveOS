window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.orchestratorSharedReady) return;

    ctx.notifyScraperStatusUpdate = function notifyScraperStatusUpdate() {
        if (window.WikiManager && typeof window.WikiManager.refreshCacheStores === 'function') {
            window.WikiManager.refreshCacheStores();
            if (typeof window.WikiManager.renderWikiEntryList === 'function') {
                window.WikiManager.renderWikiEntryList(true);
            }
            if (typeof window.WikiManager.renderFandomDomainList === 'function') {
                window.WikiManager.renderFandomDomainList(true);
            }
        }

        const currentCtx = window.currentCategoryCtx || window.StorageManager?.categoryContext || '';
        const unidexContainer = document.getElementById('unidex-scraper-panel-container');
        if (unidexContainer && unidexContainer.innerHTML.trim() !== '' && typeof window.EveOS?.API?.Manager?.renderUnidexPanelUI === 'function') {
            const searchInput = document.getElementById('searchInput');
            window.EveOS.API.Manager.renderUnidexPanelUI(unidexContainer, currentCtx, {
                filterQuery: searchInput ? searchInput.value : ''
            });
        }

        const apiContainer = document.getElementById('api-scraper-panel-container');
        if (apiContainer && apiContainer.innerHTML.trim() !== '' && typeof window.EveOS?.API?.Manager?.renderScraperPanelUI === 'function') {
            const providerKey = apiContainer.dataset.providerKey || null;
            const searchInput = document.getElementById('searchInput');
            window.EveOS.API.Manager.renderScraperPanelUI(apiContainer, currentCtx, {
                providerKey: providerKey,
                query: searchInput ? searchInput.value : ''
            });
        }

        if (typeof window.EveOS?.API?.Manager?.refreshSearchUnidexPool === 'function') {
            window.EveOS.API.Manager.refreshSearchUnidexPool();
        }
    };

    ctx.isShallowApiCache = function isShallowApiCache(cacheEntry) {
        if (!cacheEntry || !cacheEntry.sources) return true;

        const sources = cacheEntry.sources;
        const providerCount = Object.keys(sources).length;
        const totalResults = typeof ctx.countResults === 'function' ? ctx.countResults(sources) : 0;

        return (providerCount < 3 && totalResults === 0) || (providerCount === 0);
    };

    ctx.matchesGroupFilter = function matchesGroupFilter(group, filterQuery) {
        const normalizedFilter = ctx.normalizeSourceIdentity(filterQuery);
        if (!normalizedFilter) return true;

        const values = [
            group?.title,
            group?.wikipediaEntry?.title,
            group?.wikipediaEntry?.subtitle,
            group?.wikipediaEntry?.key,
            group?.fandomEntry?.title,
            group?.fandomEntry?.subtitle,
            group?.fandomEntry?.key,
            ...(Array.isArray(group?.apiEntries) ? group.apiEntries.map(function (entry) {
                return entry?.query;
            }) : []),
            ...(group?.aliases ? Array.from(group.aliases) : [])
        ];

        Object.keys(ctx.summarizeApiGroupProviders(group?.apiEntries || {})).forEach(function (providerKey) {
            values.push(providerKey);
            values.push(ctx.getProviderLabel(providerKey));
        });

        return values.some(function (value) {
            const normalizedValue = ctx.normalizeSourceIdentity(value);
            return normalizedValue && normalizedValue.includes(normalizedFilter);
        });
    };

    ctx.getLatestCachedQuery = async function getLatestCachedQuery(categoryName, providerKey = null) {
        const cacheEntries = api.Cache ? await api.Cache.listQueries(categoryName) : [];
        if (!providerKey || !ctx.isProviderSource(providerKey)) {
            return cacheEntries[0] || null;
        }
        return cacheEntries.find(function (entry) {
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) || null;
    };

    ctx.orchestratorSharedReady = true;
})(window.EveOS.API);
