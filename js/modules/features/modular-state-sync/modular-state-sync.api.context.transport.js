// --- Modular State Sync API: Gemini Context Transport Helpers ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.contextTransportApi) return;
    const scopeApi = ns.contextScopeApi;
    if (!scopeApi) throw new Error('[ModularStateSync] Context scope helpers missing.');
    const {
        text,
        getConfigForContextManifest,
        normalizeContextScope,
        getCurrentGeminiContextScope
    } = scopeApi;
    const LIVE_CONTEXT_CHUNK_CHARS = 45000;
    // Absolute transport runaway guard (per-frame limits are handled by the 45k chunking; this
    // only stops a pathological multi-MB state from flooding the socket).
    const LIVE_CONTEXT_MAX_CHARS = 600000;
    const LIVE_CONTEXT_CHUNK_DELAY_MS = 180;
    // Model budget is the ceiling that actually matters. Live context shares its session window
    // with the system prompt, conversation, and streamed audio, so snapshots must leave ample
    // room for the interaction itself. The conservative default is about 32k text tokens (128k
    // characters at roughly four characters per token); the tier ladder reduces detail to fit.
    // Tune per model with localStorage 'geminiContextCharBudget' (clamped 20k..600k).
    const LIVE_CONTEXT_DEFAULT_BUDGET_CHARS = 128000;
    function liveContextBudgetChars() {
        let override = 0;
        try { override = Number(window.localStorage?.getItem('geminiContextCharBudget')) || 0; } catch (e) { /* storage blocked */ }
        const budget = override > 0 ? override : LIVE_CONTEXT_DEFAULT_BUDGET_CHARS;
        return Math.max(20000, Math.min(LIVE_CONTEXT_MAX_CHARS, budget));
    }
    // Mode 2 sends snapshots to the selected large-context text brain instead of Live, so it can
    // afford more detail. It remains capped near 50k text tokens (200k characters) because the
    // stateless snapshot rides along on every request and contributes to quota each time.
    // Override with localStorage 'geminiTextBrainContextCharBudget'.
    const TEXT_BRAIN_CONTEXT_DEFAULT_BUDGET_CHARS = 200000;
    function textBrainContextBudgetChars() {
        let override = 0;
        try { override = Number(window.localStorage?.getItem('geminiTextBrainContextCharBudget')) || 0; } catch (e) { /* storage blocked */ }
        const budget = override > 0 ? override : TEXT_BRAIN_CONTEXT_DEFAULT_BUDGET_CHARS;
        return Math.max(20000, Math.min(LIVE_CONTEXT_MAX_CHARS, budget));
    }
    function textBrainContextSlot() {
        const mode2 = window.EveAudioflixState?.isTextBrainMode?.() === true;
        const slot = window.EveGeminiMode2;
        return mode2 && typeof slot?.setEveContext === 'function' ? slot : null;
    }

    function countLibraryEntries(categories) {
        if (!categories || typeof categories !== 'object') return 0;
        return Object.values(categories).reduce((total, value) => {
            if (Array.isArray(value)) return total + value.length;
            if (Array.isArray(value?.entries)) return total + value.entries.length;
            return total;
        }, 0);
    }

    function getContextPayloadCounts(payload) {
        const summaryCounts = payload?.counts && typeof payload.counts === 'object' ? payload.counts : null;
        if (summaryCounts) {
            return {
                bookmarks: Number(summaryCounts.bookmarks) || 0,
                workspaces: Number(summaryCounts.workspaces) || 0,
                cards: Number(summaryCounts.cards) || 0,
                libraryEntries: Number(summaryCounts.libraryEntries) || 0,
                connections: Number(summaryCounts.connections) || 0
            };
        }

        const links = Array.isArray(payload?.bookmarks?.links) ? payload.bookmarks.links : [];
        const configPayload = payload?.bookmarks?.config || {};
        const cardKeys = new Set(links.map((link) => `${link?.workspace || 'main'}::${link?.category || ''}`));
        const workspaceKeys = Array.isArray(configPayload.workspaces)
            ? configPayload.workspaces.map((workspace) => workspace?.id).filter(Boolean)
            : Array.from(new Set(links.map((link) => link?.workspace || 'main')));
        return {
            bookmarks: links.length,
            workspaces: workspaceKeys.length,
            cards: cardKeys.size,
            libraryEntries: countLibraryEntries(payload?.library?.categories),
            connections: Array.isArray(payload?.library?.connections) ? payload.library.connections.length : 0
        };
    }

    function summarizeNexusTrace(trace) {
        if (!trace || typeof trace !== 'object') return null;
        const shortText = (value, max = 220) => {
            const normalized = text(value, '').replace(/\s+/g, ' ');
            if (normalized.length <= max) return normalized;
            return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
        };
        const vectors = {};
        Object.entries(trace.vectors || {}).forEach(([key, vector]) => {
            vectors[key] = {
                status: text(vector?.status, ''),
                durationMs: Number(vector?.durationMs || 0),
                resultCount: Number(vector?.resultCount || 0),
                error: shortText(vector?.error, 140)
            };
        });
        const rawScope = trace.scope || {};
        const scope = rawScope && typeof rawScope === 'object'
            ? {
                scope: text(rawScope.scope || rawScope.mode || rawScope.type, ''),
                label: shortText(rawScope.label || rawScope.name, 90),
                workspaceId: text(rawScope.workspaceId || rawScope.workspace, ''),
                categoryName: shortText(rawScope.categoryName || rawScope.category, 90)
            }
            : shortText(rawScope, 90);
        return {
            id: text(trace.id, ''),
            query: shortText(trace.query || trace.command || trace.input, 160),
            summary: shortText(trace.summary, 240),
            scope,
            mode: text(trace.mode, ''),
            totalMs: Number(trace.totalMs || 0),
            startedAt: Number(trace.startedAt || 0),
            endedAt: Number(trace.endedAt || 0),
            resultCount: Number(trace.resultCount || trace.resultsFound || trace.totalResults || 0),
            stats: trace.stats || null,
            vectors
        };
    }

    function getRecentNexusTraces(limit = 5) {
        const sessions = Array.isArray(window.SearchMonitorBoot?._nexusSessions)
            ? window.SearchMonitorBoot._nexusSessions
            : [];
        return sessions
            .slice(0, Math.max(1, Math.min(10, Number(limit) || 5)))
            .map(summarizeNexusTrace)
            .filter(Boolean);
    }

    function buildNexusTraceContextBlock(traces) {
        const items = Array.isArray(traces) ? traces : [];
        if (!items.length) return '';
        return '\n\n[LIVE NEXUS TRACE LOG: Recent Search Monitor/Nexus activity for extra context.]\n'
            + JSON.stringify({
                schema: 'eveos.nexus-trace-log.v1',
                generatedAt: new Date().toISOString(),
                traceCount: items.length,
                traces: items
            }, null, 2);
    }

    function prepareLiveContextMessage(message, budgetChars = liveContextBudgetChars()) {
        const raw = String(message || '');
        const cap = Math.max(20000, Math.min(LIVE_CONTEXT_MAX_CHARS, Number(budgetChars) || LIVE_CONTEXT_MAX_CHARS));
        const truncated = raw.length > cap;
        let clipped = raw;
        if (truncated) {
            // Last-resort clip only (the send path first steps the detail tier down to avoid this
            // entirely). Cut at a line boundary so we never split a JSON token / URL mid-way —
            // a blind byte slice fed Gemini megabytes of syntactically broken JSON.
            let cut = raw.lastIndexOf('\n', cap);
            if (cut < cap - 2000) cut = cap;
            clipped = `${raw.slice(0, cut)}\n\n[TRANSPORT NOTICE: EveOS context was very large and was capped at ~${cap.toLocaleString()} characters to protect the live model's context window, so the JSON above may be incomplete near the end. Narrow the scope or lower the detail tier to receive a complete snapshot.]`;
        }
        const parts = [];
        for (let index = 0; index < clipped.length; index += LIVE_CONTEXT_CHUNK_CHARS) {
            parts.push(clipped.slice(index, index + LIVE_CONTEXT_CHUNK_CHARS));
        }
        return { message: clipped, parts: parts.length ? parts : [''], truncated };
    }

    function buildContextManifest(context, message, limit) {
        const payload = context?.payload || {};
        const cfg = getConfigForContextManifest(payload);
        const payloadScope = payload?.scope || payload?.metadata?.geminiScope || context?.scope || getCurrentGeminiContextScope();
        const scopeMode = normalizeContextScope(payloadScope?.scope);
        const activeWorkspaceId = String(payloadScope?.workspaceId || cfg.activeWorkspace || 'main');
        const activeWorkspace = window.EveWorkspaceHelpers?.findById
            ? window.EveWorkspaceHelpers.findById(cfg.workspaces || [], activeWorkspaceId)
            : (Array.isArray(cfg.workspaces) ? cfg.workspaces.find((workspace) => String(workspace?.id || '') === activeWorkspaceId) : null);
        const defaultLabel = scopeMode === 'all'
            ? 'Whole datapack'
            : (scopeMode === 'card' ? 'Current card' : 'Current tab branch');
        return {
            schema: 'eveos.gemini-context-manifest.v1',
            label: 'EveOS Context Snapshot',
            mode: context?.mode || 'summary',
            scope: payloadScope?.label || defaultLabel,
            scopeMode,
            source: payloadScope?.source || 'search-monitor',
            activeWorkspaceId,
            activeWorkspaceName: activeWorkspace?.name || activeWorkspaceId,
            workspaceIds: Array.isArray(payloadScope?.workspaceIds) ? payloadScope.workspaceIds : [],
            categoryName: payloadScope?.categoryName || '',
            sampleLimit: Math.max(5, Math.min(200, Number(limit) || 25)),
            messageChars: String(message || '').length,
            messageLines: String(message || '').split(/\r?\n/).length,
            counts: getContextPayloadCounts(payload),
            nexusTraceCount: getRecentNexusTraces(5).length,
            generatedAt: new Date().toISOString()
        };
    }
    ns.contextTransportApi = Object.freeze({
        LIVE_CONTEXT_CHUNK_CHARS,
        LIVE_CONTEXT_CHUNK_DELAY_MS,
        liveContextBudgetChars,
        textBrainContextBudgetChars,
        textBrainContextSlot,
        getRecentNexusTraces,
        buildNexusTraceContextBlock,
        prepareLiveContextMessage,
        buildContextManifest
    });
})();
