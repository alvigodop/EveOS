window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderSummaryReady) return;

    var cardSummaryWarmPromise = null;

    function getLiveLinkCount() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links.length;
        if (typeof getLiveLinks === 'function') return getLiveLinks().length;
        if (Array.isArray(window.links)) return window.links.length;
        return 0;
    }

    function queueCardSummaryWarmup() {
        var linkCount = getLiveLinkCount();
        if (linkCount > 3500) {
            window.__eveDashboardCardSummaryWarmupSuppressed = {
                at: Date.now(),
                reason: 'dashboard-card-summary',
                linkCount: linkCount,
                cap: 3500
            };
            return;
        }
        var indexApi = window.EveOS?.SearchAdvanced?.Index;
        if (!indexApi || (typeof indexApi.ensureFresh !== 'function' && typeof indexApi.rebuild !== 'function')) return;
        if (cardSummaryWarmPromise) return;
        var scrollSeqAtRequest = Number(window._dashboardScrollActivitySeq || 0);
        var warmPromise = typeof indexApi.ensureFresh === 'function'
            ? indexApi.ensureFresh({ reason: 'dashboard-card-summary', allowStale: true, deferMs: 1400 })
            : indexApi.rebuild({ reason: 'dashboard-card-summary' });

        cardSummaryWarmPromise = Promise.resolve(warmPromise)
            .catch(function () {
                // Ignore warmup failures and render without datapack summary chips.
            })
            .finally(function () {
                cardSummaryWarmPromise = null;
                if (Number(window._dashboardScrollActivitySeq || 0) !== scrollSeqAtRequest) return;
                if (typeof renderDashboard === 'function') renderDashboard();
            });
    }

    function getCardDatapackSummary(workspaceId, categoryName) {
        var indexApi = window.EveOS?.SearchAdvanced?.Index;
        if (!indexApi || typeof indexApi.getCardSummary !== 'function') return null;
        var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        var hasUsableSnapshot = typeof indexApi.hasReadableStructureSnapshot === 'function'
            ? indexApi.hasReadableStructureSnapshot()
            : (typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0));
        if (!hasUsableSnapshot) {
            queueCardSummaryWarmup();
            if (Number(buildState?.builtAt || 0) <= 0) return null;
        }
        var summary = indexApi.getCardSummary(workspaceId, categoryName);
        if (summary) return summary;
        queueCardSummaryWarmup();
        return null;
    }

    api.getCardDatapackSummary = getCardDatapackSummary;
    api.cardRenderSummaryReady = true;
})();
