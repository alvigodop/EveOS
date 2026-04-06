window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

api.Manager = {
        collectLiveResults: ctx.collectLiveResults,
        fetchProviderResults: ctx.fetchProviderResults,
        getProviderLabel: ctx.getProviderLabel,
        isProviderSource: ctx.isProviderSource,
        buildSourceCacheGroups: ctx.buildSourceCacheGroups,
        findSourceCacheGroup: ctx.findSourceCacheGroup,
        renderScraperSourceTabs: ctx.renderScraperSourceTabs,
        renderSearchUI: ctx.renderSearchUI,
        renderScraperPanelUI: ctx.renderScraperPanelUI,
        renderUnidexPanelUI: ctx.renderUnidexPanelUI,
        refreshScraperPanel: ctx.renderScraperPanelUI,
        refreshSearchUnidexPool: ctx.refreshPool,
        handleResultLinkClick: ctx.handleResultLinkClick,
        getLatestCachedQuery: ctx.getLatestCachedQuery,
        loadCachedQuery: ctx.loadCachedQuery,
        runUnifiedSearch: ctx.runUnifiedSearch,
        runSearch: ctx.runSearch
    };
})(window.EveOS.API);