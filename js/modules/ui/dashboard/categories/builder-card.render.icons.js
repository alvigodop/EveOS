window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderIconsReady) return;

    function scheduleDeferredCardFaviconRefresh(cardNode, reason, options) {
        if (!cardNode || !cardNode.isConnected) return;
        var cache = window.EveFaviconCache;
        if (!cache || typeof cache.refreshRendered !== 'function') return;
        var opts = options || {};
        var delayMs = Math.max(0, Number(opts.delayMs || 60) || 60);
        var run = function () {
            if (!cardNode.isConnected) return;
            var finishPerf = window.EvePerformanceMonitor?.startOperation?.('favicon-refresh-card', {
                reason: reason || 'deferred-card-hydration',
                card: cardNode.getAttribute('data-card-category') || '',
                workspace: cardNode.getAttribute('data-card-workspace') || ''
            });
            cache.refreshRendered({
                root: cardNode,
                reason: reason || 'deferred-card-hydration',
                maxFetch: Math.max(0, Number(opts.maxFetch || 18) || 18),
                maxUpdate: Math.max(24, Number(opts.maxUpdate || 160) || 160),
                forceFetch: opts.forceFetch !== false
            }).then(function (result) {
                finishPerf?.({
                    updated: result?.updated || 0,
                    queued: result?.queued || 0,
                    scanned: result?.scanned || 0,
                    total: result?.total || 0
                });
            }).catch(function (error) {
                finishPerf?.({ source: 'error' });
                console.warn('[Dashboard] Deferred card favicon refresh failed:', error);
            });
        };
        window.setTimeout(function () {
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(run, { timeout: 900 });
            } else {
                run();
            }
        }, delayMs);
    }

    api.scheduleDeferredCardFaviconRefresh = scheduleDeferredCardFaviconRefresh;
    api.cardRenderIconsReady = true;
})();
