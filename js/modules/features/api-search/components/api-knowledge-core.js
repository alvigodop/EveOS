window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (!ctx.knowledgeCoreSharedReady || !ctx.knowledgeCoreCacheReady || !ctx.knowledgeCoreResultsReady) {
        console.warn('API Knowledge Core: runtime modules missing');
        return;
    }

    ctx.knowledgeCoreReady = true;
})(window.EveOS.API);
