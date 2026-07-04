// --- Modular State Sync API: Gemini Data Stream ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiDataStreamReady) return;
    if (!ns.apiContextReady) {
        console.warn('[ModularStateSync] Context API missing; Gemini data stream not initialized.');
        return;
    }

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function compactText(value, max = 180) {
        const normalized = text(value, '').replace(/\s+/g, ' ');
        const limit = Math.max(0, Number(max) || 0);
        if (!limit) return '';
        if (normalized.length <= limit) return normalized;
        return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
    }

    function normalizeScope(scope) {
        const value = text(scope, 'workspace').toLowerCase();
        if (['all', 'store', 'datapack'].includes(value)) return 'all';
        if (['card', 'category'].includes(value)) return 'card';
        return 'workspace';
    }

    function getConfig() {
        return window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function getLinks() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        return [];
    }

    function toList(value, limit = 24) {
        return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : [];
    }

    function asSet(values) {
        return new Set(toList(values, 250).map((value) => text(value, '').toLowerCase()).filter(Boolean));
    }

    function intersects(values, set) {
        if (!set || set.size === 0) return false;
        return toList(values, 500).some((value) => set.has(text(value, '').toLowerCase()));
    }

    function normalizeScopeOptions(options = {}) {
        const base = ns.getCurrentGeminiContextScope?.() || {
            scope: 'workspace',
            workspaceId: text(getConfig().activeWorkspace, 'main')
        };
        // Unwrap { scope: {...} } wrappers ONLY when .scope is an object. When a scope object is
        // passed directly, its .scope is the mode STRING ('workspace'/'card'/'all') — the old
        // `options?.scope || options` grabbed that string, Object.assign spread its characters,
        // and the caller's selected scope was silently REPLACED by the current surface. That made
        // Data Stream scope selection a no-op.
        const raw = (options && typeof options.scope === 'object' && options.scope) ? options.scope : (options || {});
        const merged = Object.assign({}, base, raw);
        const scope = normalizeScope(merged.scope);
        const workspaceId = text(merged.workspaceId, text(getConfig().activeWorkspace, 'main'));
        let workspaceIds = Array.isArray(merged.workspaceIds) ? merged.workspaceIds.map((id) => text(id, '')).filter(Boolean) : [];
        if (!workspaceIds.length && scope !== 'all') workspaceIds = [workspaceId];
        return {
            scope,
            workspaceId,
            workspaceIds,
            categoryName: text(merged.categoryName, ''),
            label: text(merged.label, ''),
            source: text(merged.source, 'search-monitor')
        };
    }

    function getGeminiContextCardOptions(scopeOptions = {}) {
        const scope = normalizeScopeOptions(scopeOptions);
        const workspaceSet = asSet(scope.workspaceIds.length ? scope.workspaceIds : [scope.workspaceId]);
        const counts = new Map();
        getLinks().forEach((link) => {
            const workspace = text(link?.workspace, 'main');
            if (scope.scope !== 'all' && !workspaceSet.has(workspace.toLowerCase())) return;
            const categoryName = text(link?.category, 'Unsorted');
            const key = `${workspace}::${categoryName}`;
            const existing = counts.get(key) || { workspaceId: workspace, categoryName, count: 0 };
            existing.count += 1;
            counts.set(key, existing);
        });
        return Array.from(counts.values())
            .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId) || a.categoryName.localeCompare(b.categoryName));
    }

    function mutationMatchesScope(detail, scopeOptions = {}) {
        const scope = normalizeScopeOptions(scopeOptions);
        if (scope.scope === 'all' && !scope.workspaceIds.length) return true;
        const delta = detail?.meta?.dataDelta || {};
        if (!delta || typeof delta !== 'object') return true;
        const hasDeltaScope = toList(delta.workspaceIds).length
            || toList(delta.categoryNames).length
            || toList(delta.affectedScopes).length;
        if (!hasDeltaScope && detail?.meta?.configDelta) return true;
        const workspaceSet = asSet(scope.workspaceIds.length ? scope.workspaceIds : [scope.workspaceId]);
        const category = text(scope.categoryName, '').toLowerCase();
        const workspacesMatch = intersects(delta.workspaceIds, workspaceSet)
            || toList(delta.affectedScopes, 500).some((item) => workspaceSet.has(text(item?.workspaceId || item?.workspace, '').toLowerCase()));
        if (scope.scope === 'workspace') return workspacesMatch || !!delta.hasFolderStoreChanges;
        if (scope.scope !== 'card') return workspacesMatch;
        const categoriesMatch = intersects(delta.categoryNames, new Set([category]))
            || toList(delta.affectedScopes, 500).some((item) => text(item?.categoryName || item?.category, '').toLowerCase() === category);
        return (workspacesMatch || !toList(delta.workspaceIds).length) && categoriesMatch;
    }

    function getLatestNexusTraceSummary() {
        const trace = window.SearchMonitorBoot?.getLatestNexusTrace?.();
        if (!trace) return null;
        return {
            id: trace.id || '',
            query: compactText(trace.query || trace.input || '', 160),
            scope: compactText(trace.scope?.label || trace.scope?.scope || trace.scopeMode || '', 90),
            summary: compactText(trace.summary || '', 220),
            totalMs: Number(trace.totalMs) || 0,
            resultCount: Number(trace.resultCount || trace.resultsFound || trace.totalResults) || 0
        };
    }

    function buildDataStreamContext(detail, scopeOptions = {}) {
        const scope = normalizeScopeOptions(scopeOptions);
        const delta = detail?.meta?.dataDelta || {};
        const configDelta = detail?.meta?.configDelta || {};
        return {
            schema: 'eveos.gemini-data-stream.v1',
            kind: 'eveos_data_stream_update',
            generatedAt: new Date().toISOString(),
            silent: true,
            scope,
            mutation: {
                source: detail?.source || 'state-mutated',
                kind: detail?.kind || 'data',
                mutationSeq: Number(detail?.mutationSeq) || 0,
                at: detail?.at || Date.now(),
                immediate: !!detail?.immediate
            },
            delta: {
                complete: delta.complete !== false,
                workspaceIds: toList(delta.workspaceIds, 12),
                categoryNames: toList(delta.categoryNames, 12),
                folderIds: toList(delta.folderIds, 16),
                linkIds: toList(delta.linkIds, 30),
                addedLinkIds: toList(delta.addedLinkIds, 30),
                updatedLinkIds: toList(delta.updatedLinkIds, 30),
                removedLinkIds: toList(delta.removedLinkIds, 30),
                affectedScopes: toList(delta.affectedScopes, 12),
                hasFolderStoreChanges: !!delta.hasFolderStoreChanges,
                hasQuickPinChanges: !!delta.hasQuickPinChanges,
                hasConstellationChanges: !!delta.hasConstellationChanges
            },
            configDelta: {
                changedKeys: toList(configDelta.changedKeys || configDelta.keys || Object.keys(configDelta || {}), 16)
            },
            nexus: getLatestNexusTraceSummary()
        };
    }

    function getSocket() {
        return window.webSocket && window.webSocket.readyState === (window.WebSocket?.OPEN || 1)
            ? window.webSocket
            : null;
    }

    function sendDataStreamToGemini(detail, options = {}) {
        const scope = normalizeScopeOptions(options?.scope || options);
        if (!mutationMatchesScope(detail, scope)) {
            return { ok: true, sent: false, skipped: true, reason: 'outside-scope', scope };
        }
        // Mode 2: deltas belong with the TEXT BRAIN (which holds the snapshot they update), not
        // the live session — the live model only voices replies and its ~128k window would slowly
        // fill with updates it never uses. The brain sees them on its next turn.
        if (window.EveAudioflixState?.isTextBrainMode?.() === true
            && typeof window.EveGeminiMode2?.appendEveUpdate === 'function') {
            const brainContext = buildDataStreamContext(detail, scope);
            const appended = window.EveGeminiMode2.appendEveUpdate(JSON.stringify(brainContext));
            return { ok: true, sent: true, route: 'text-brain', scope, manifest: brainContext, updateCount: appended.count };
        }
        const socket = getSocket();
        if (!socket) return { ok: false, sent: false, skipped: true, reason: 'socket-offline', scope };
        const context = buildDataStreamContext(detail, scope);
        const message = [
            '[LIVE EVEOS DATA STREAM UPDATE: silent context. Observe this update without replying unless the user asks or the update is safety-critical.]',
            JSON.stringify(context, null, 2)
        ].join('\n');
        socket.send(JSON.stringify({
            source: 'modular_gemini_data_stream',
            silent_response: true,
            silentResponseRequested: true,
            data_stream: { active: true, silent: true, scope: context.scope, sent_at: Date.now() },
            realtime_input: { media_chunks: [{ mime_type: 'text/plain', data: message }] },
            is_system_context: true,
            is_modular_context: true,
            context_manifest: {
                schema: 'eveos.gemini-context-manifest.v1',
                label: 'EveOS Data Stream Update',
                mode: 'stream',
                scope: scope.label || scope.scope,
                scopeMode: scope.scope,
                activeWorkspaceId: scope.workspaceId,
                workspaceIds: scope.workspaceIds,
                categoryName: scope.categoryName,
                messageChars: message.length,
                route: 'websocket',
                generatedAt: context.generatedAt
            }
        }));
        return { ok: true, sent: true, route: 'websocket', scope, manifest: context };
    }

    Object.assign(ns, {
        getGeminiContextCardOptions,
        sendDataStreamToGemini,
        mutationMatchesScope,
        buildDataStreamContext
    });

    ns.apiDataStreamReady = true;
})();
