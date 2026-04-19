window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (!ctx.orchestratorSharedReady || !ctx.orchestratorApiReady || !ctx.orchestratorKnowledgeReady || !ctx.orchestratorRunReady) {
        console.warn('API Manager Orchestrator: runtime modules missing');
        return;
    }

    ctx.orchestratorReady = true;
})(window.EveOS.API);
