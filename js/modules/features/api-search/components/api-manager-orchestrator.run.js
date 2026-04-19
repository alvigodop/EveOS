window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.orchestratorRunReady || !ctx.orchestratorSharedReady || !ctx.orchestratorApiReady || !ctx.orchestratorKnowledgeReady) return;

    ctx.runSearch = async function runSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
        const normalizedQuery = String(query).trim();
        const requestId = options.requestId || ctx.claimResultsView(resultsContainer, {
            query: normalizedQuery,
            source: providerKey || 'api'
        });

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching ${ctx.escapeHtml(providerKey ? ctx.getProviderLabel(providerKey) : 'API providers')}...</div>`;
        ctx.updateResultsCount(0);

        try {
            const resolved = await ctx.resolveApiSearchData(normalizedQuery, {
                categoryName: resolvedCategory,
                providerKey,
                ttlMs: options.ttlMs,
                liveResults: options.liveResults,
                hybridResults: options.hybridResults
            }, options.loadingCallback);

            if (!ctx.isClaimCurrent(resultsContainer, requestId) || !resolved) return null;

            if (resolved.meta?.cacheMiss) {
                ctx.renderCacheOnlyMessage(resultsContainer, normalizedQuery, providerKey);
                if (typeof options.onAfterRender === 'function') options.onAfterRender({ fromCache: false, cacheMiss: true, categoryName: resolvedCategory });
                return { sources: {}, meta: resolved.meta };
            }

            if (resolved.meta?.error && Number(resolved.meta?.summary?.totalResults || 0) < 1) {
                resultsContainer.innerHTML = 'An error occurred while searching.<br><pre style="text-align:left; font-size:12px; color:red;">' + ctx.escapeHtml(resolved.meta.error.stack || resolved.meta.error.message || resolved.meta.error) + '</pre>';
                return null;
            }

            const renderedSources = ctx.renderProviderResultsSubset(resolved.allSources, resultsContainer, onSelect, providerKey, !!resolved.meta?.fromCache);
            ctx.updateResultsCount(ctx.countResults(renderedSources));
            ctx.notifyScraperStatusUpdate();

            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({
                    fromCache: resolved.meta?.fromCache === true,
                    fallback: resolved.meta?.fallback === true,
                    entry: resolved.entry || null,
                    categoryName: resolvedCategory
                });
            }
            return { sources: renderedSources, meta: resolved.meta };
        } catch (error) {
            console.error('runSearch: Critical error', error);
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
                options.loadingCallback(false, resultsContainer.id, `Search failed: ${error.message}`, { statusPhase: 'error' });
            }
            throw error;
        } finally {
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
                options.loadingCallback(false, resultsContainer.id, 'Search complete');
            }
        }
    };

    ctx.loadCachedQuery = async function loadCachedQuery(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer || !api.Cache) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
        const requestId = ctx.claimResultsView(resultsContainer, {
            query: query,
            source: providerKey || 'api-cache'
        });
        const cachedEntry = await api.Cache.getQuery(query, resolvedCategory);
        if (!cachedEntry?.sources) return null;
        if (ctx.countResults(ctx.filterSourcesByProvider(cachedEntry.sources, providerKey)) < 1) return null;
        if (!ctx.isClaimCurrent(resultsContainer, requestId)) return null;

        await api.Cache.touchQuery(query, resolvedCategory);
        const renderedSources = ctx.renderProviderResultsSubset(cachedEntry.sources, resultsContainer, onSelect, providerKey, true);
        ctx.updateResultsCount(ctx.countResults(renderedSources));
        ctx.notifyScraperStatusUpdate();

        if (typeof options.onAfterRender === 'function') options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
        return { sources: cachedEntry, renderedSources };
    };

    if (!ctx.orchestratorWikiListenerBound && window.WikiManager && typeof window.WikiManager.on === 'function') {
        window.WikiManager.on('wiki-cache-updated', function () {
            console.log('API Orchestrator: Wiki cache updated, triggering status update');
            ctx.notifyScraperStatusUpdate();
        });
        ctx.orchestratorWikiListenerBound = true;
    }

    ctx.orchestratorRunReady = true;
})(window.EveOS.API);
