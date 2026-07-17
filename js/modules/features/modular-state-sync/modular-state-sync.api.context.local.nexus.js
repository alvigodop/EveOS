window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    const shared = ns.localContextShared;
    if (!shared) throw new Error('[ModularStateSync] Local Nexus context dependencies missing.');
    const { text, compactText } = shared;
    function compactNexusTrace(trace) {
        if (!trace || typeof trace !== 'object') return null;
        const rawScope = trace.scope || {};
        const scope = rawScope && typeof rawScope === 'object'
            ? {
                scope: text(rawScope.scope || rawScope.mode || rawScope.type, ''),
                label: compactText(rawScope.label || rawScope.name, 90),
                workspaceId: text(rawScope.workspaceId || rawScope.workspace, ''),
                categoryName: compactText(rawScope.categoryName || rawScope.category, 90)
            }
            : compactText(rawScope, 90);
        return {
            id: text(trace.id, ''),
            query: compactText(trace.query || trace.command || trace.input, 160),
            summary: compactText(trace.summary, 240),
            scope,
            totalMs: Number(trace.totalMs || 0),
            resultCount: Number(trace.resultCount || trace.resultsFound || trace.totalResults || 0),
            endedAt: Number(trace.endedAt || trace.finishedAt || trace.startedAt || 0)
        };
    }

    function recentNexusLog(limit = 5) {
        const sessions = Array.isArray(window.SearchMonitorBoot?._nexusSessions)
            ? window.SearchMonitorBoot._nexusSessions
            : [];
        return sessions.slice(0, Math.max(1, Math.min(5, Number(limit) || 5)))
            .map(compactNexusTrace)
            .filter(Boolean);
    }

    ns.localContextNexus = { compactNexusTrace, recentNexusLog };
})();