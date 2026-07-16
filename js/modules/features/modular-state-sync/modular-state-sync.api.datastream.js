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

    const trace = window.EveGeminiDataStreamTrace?.create?.({
        text,
        compactText,
        toList,
        getConfig,
        getLinks,
        describeWorkspaceTabPath: ns.describeWorkspaceTabPath
    });
    if (!trace) {
        console.warn('[ModularStateSync] Data Stream trace helper missing; stream not initialized.');
        return;
    }

    function buildDataStreamContext(detail, scopeOptions = {}) {
        const scope = normalizeScopeOptions(scopeOptions);
        const delta = detail?.meta?.dataDelta || {};
        const configDelta = detail?.meta?.configDelta || {};
        const mutationSource = detail?.source || 'state-mutated';

        // Changes block: only fields that actually changed, every id resolved to a real name.
        const changes = {};
        const tabRefs = toList(delta.workspaceIds, 12).map(trace.workspaceTraceRef);
        if (tabRefs.length) changes.tabs = tabRefs;
        const cardNames = toList(delta.categoryNames, 12).map((name) => text(name, ''));
        if (cardNames.length) changes.cards = cardNames;
        const folderRefs = trace.folderTraceRefs(delta.folderIds);
        if (folderRefs.length) changes.folders = folderRefs;
        const linkBuckets = [
            ['linksAdded', delta.addedLinkIds],
            ['linksUpdated', delta.updatedLinkIds],
            ['linksRemoved', delta.removedLinkIds]
        ];
        let bucketed = false;
        linkBuckets.forEach(([key, ids]) => {
            const refs = toList(ids, 30).map(trace.linkTraceRef);
            if (refs.length) { changes[key] = refs; bucketed = true; }
        });
        if (!bucketed) {
            const touched = toList(delta.linkIds, 30).map(trace.linkTraceRef);
            if (touched.length) changes.linksTouched = touched;
        }
        if (delta.hasFolderStoreChanges) changes.folderStoreChanged = true;
        if (delta.hasQuickPinChanges) changes.quickPinsChanged = true;
        if (delta.hasConstellationChanges) changes.constellationChanged = true;
        if (!Object.keys(changes).length) {
            changes.note = 'No bookmark, card, folder, or tab data changed — this was a settings-only mutation.';
        }

        const settingsChanged = trace.describeConfigKeys(configDelta);
        const nexus = trace.getLatestNexusTraceSummary();

        const context = {
            schema: 'eveos.gemini-data-stream.v2',
            kind: 'eveos_data_stream_update',
            generatedAt: new Date().toISOString(),
            silent: true,
            summary: trace.buildStreamSummary(mutationSource, changes, settingsChanged, scope),
            scope: {
                scope: scope.scope,
                label: scope.label || '',
                source: scope.source || '',
                categoryName: scope.categoryName || '',
                // Watched tabs resolved to real names + paths — the agent never sees bare ids alone.
                workspaces: toList(scope.workspaceIds, 24).map(trace.workspaceTraceRef)
            },
            mutation: {
                source: mutationSource,
                sourceMeaning: trace.mutationSourceMeaning(mutationSource),
                kind: detail?.kind || 'data',
                mutationSeq: Number(detail?.mutationSeq) || 0,
                at: detail?.at || Date.now(),
                immediate: !!detail?.immediate
            },
            changes
        };
        if (settingsChanged.length) context.settingsChanged = settingsChanged;
        if (nexus) context.nexus = nexus;
        return context;
    }

    function getSocket() {
        return window.webSocket && window.webSocket.readyState === (window.WebSocket?.OPEN || 1)
            ? window.webSocket
            : null;
    }

    // --- Stream insight log -------------------------------------------------------------
    // Every send attempt (delivered or skipped) is recorded so the Agent Space "Insight
    // Gathering" viewer can show the real flow: what EveOS sent, over which route, and what
    // the agent now holds. Ring buffer on window so it survives module reloads.
    const INSIGHT_LOG_MAX = 120;

    function getDataStreamInsightLog() {
        return window.__eveDataStreamInsightLog = window.__eveDataStreamInsightLog || [];
    }

    function summarizeDelta(delta) {
        if (!delta || typeof delta !== 'object') return '';
        const bits = [];
        const count = (list) => (Array.isArray(list) ? list.length : 0);
        if (count(delta.addedLinkIds)) bits.push(count(delta.addedLinkIds) + ' link(s) added');
        if (count(delta.updatedLinkIds)) bits.push(count(delta.updatedLinkIds) + ' link(s) updated');
        if (count(delta.removedLinkIds)) bits.push(count(delta.removedLinkIds) + ' link(s) removed');
        if (!bits.length && count(delta.linkIds)) bits.push(count(delta.linkIds) + ' link(s) touched');
        if (count(delta.categoryNames)) bits.push('cards: ' + toList(delta.categoryNames, 4).join(', '));
        if (count(delta.workspaceIds)) bits.push(count(delta.workspaceIds) + ' tab(s)');
        if (delta.hasFolderStoreChanges) bits.push('folders changed');
        if (delta.hasQuickPinChanges) bits.push('quick pins changed');
        if (delta.hasConstellationChanges) bits.push('constellation changed');
        return bits.join(' · ');
    }

    function recordDataStreamInsight(entry) {
        const log = getDataStreamInsightLog();
        const record = Object.assign({
            id: 'ds_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
            at: Date.now(),
            type: 'send'
        }, entry || {});
        log.push(record);
        while (log.length > INSIGHT_LOG_MAX) log.shift();
        try {
            window.dispatchEvent(new CustomEvent('eve:datastream-insight', { detail: record }));
        } catch { /* insight events are best effort */ }
        return record;
    }

    // Marker entries (toggle flips, notes) so the viewer timeline shows stream lifecycle.
    function recordDataStreamMarker(note, extra) {
        return recordDataStreamInsight(Object.assign({
            type: 'marker',
            outcome: 'marker',
            note: text(note, 'marker')
        }, extra || {}));
    }

    function describeInsightScope(scope) {
        return {
            scope: scope.scope,
            label: scope.label || '',
            workspaceId: scope.workspaceId || '',
            workspaceIds: toList(scope.workspaceIds, 24),
            categoryName: scope.categoryName || '',
            source: scope.source || ''
        };
    }

    function describeInsightMutation(detail) {
        return {
            source: detail?.source || 'state-mutated',
            kind: detail?.kind || 'data',
            mutationSeq: Number(detail?.mutationSeq) || 0,
            immediate: !!detail?.immediate
        };
    }

    function sendDataStreamToGemini(detail, options = {}) {
        const scope = normalizeScopeOptions(options?.scope || options);
        const cfg = getConfig();
        if (cfg.geminiLiveLinkEnabled !== true) {
            recordDataStreamInsight({
                outcome: 'skipped',
                reason: 'relay-disabled',
                scope: describeInsightScope(scope),
                mutation: describeInsightMutation(detail)
            });
            return { ok: true, sent: false, skipped: true, reason: 'relay-disabled', scope };
        }
        if (cfg.geminiContextDataStreamEnabled !== true) {
            recordDataStreamInsight({
                outcome: 'skipped',
                reason: 'stream-disabled',
                scope: describeInsightScope(scope),
                mutation: describeInsightMutation(detail)
            });
            return { ok: true, sent: false, skipped: true, reason: 'stream-disabled', scope };
        }
        if (!mutationMatchesScope(detail, scope)) {
            recordDataStreamInsight({
                outcome: 'skipped',
                reason: 'outside-scope',
                scope: describeInsightScope(scope),
                mutation: describeInsightMutation(detail),
                deltaSummary: summarizeDelta(detail?.meta?.dataDelta)
            });
            return { ok: true, sent: false, skipped: true, reason: 'outside-scope', scope };
        }
        // Mode 2: deltas belong with the TEXT BRAIN (which holds the snapshot they update), not
        // the live session — the live model only voices replies and its ~128k window would slowly
        // fill with updates it never uses. The brain sees them on its next turn.
        if (window.EveAudioflixState?.isTextBrainMode?.() === true
            && typeof window.EveGeminiMode2?.appendEveUpdate === 'function') {
            const brainContext = buildDataStreamContext(detail, scope);
            const brainPayload = JSON.stringify(brainContext);
            const appended = window.EveGeminiMode2.appendEveUpdate(brainPayload);
            recordDataStreamInsight({
                outcome: 'sent',
                route: 'text-brain',
                scope: describeInsightScope(scope),
                mutation: describeInsightMutation(detail),
                deltaSummary: summarizeDelta(detail?.meta?.dataDelta),
                nexus: brainContext.nexus,
                messageChars: brainPayload.length,
                brainQueueCount: appended.count,
                payload: brainContext
            });
            return { ok: true, sent: true, route: 'text-brain', scope, manifest: brainContext, updateCount: appended.count };
        }
        const socket = getSocket();
        if (!socket) {
            recordDataStreamInsight({
                outcome: 'skipped',
                reason: 'socket-offline',
                scope: describeInsightScope(scope),
                mutation: describeInsightMutation(detail),
                deltaSummary: summarizeDelta(detail?.meta?.dataDelta)
            });
            return { ok: false, sent: false, skipped: true, reason: 'socket-offline', scope };
        }
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
        recordDataStreamInsight({
            outcome: 'sent',
            route: 'websocket',
            scope: describeInsightScope(scope),
            mutation: describeInsightMutation(detail),
            deltaSummary: summarizeDelta(detail?.meta?.dataDelta),
            nexus: context.nexus,
            messageChars: message.length,
            payload: context
        });
        return { ok: true, sent: true, route: 'websocket', scope, manifest: context };
    }

    Object.assign(ns, {
        getGeminiContextCardOptions,
        sendDataStreamToGemini,
        mutationMatchesScope,
        buildDataStreamContext,
        getDataStreamInsightLog,
        recordDataStreamMarker,
        // General entry point for other pipeline stages (text brain turns, relay sends) to
        // stamp their work into the same stream timeline the Insight viewer shows.
        recordDataStreamEvent: recordDataStreamInsight
    });

    ns.apiDataStreamReady = true;
})();
