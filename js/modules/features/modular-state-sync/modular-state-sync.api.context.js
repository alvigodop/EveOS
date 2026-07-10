// --- Modular State Sync API: Context Actions ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextReady) return;
    if (!ns.sharedReady || !ns.engineReady) {
        console.warn('[ModularStateSync] Shared helpers or engine missing; API context not initialized.');
        return;
    }

    const LIVE_CONTEXT_CHUNK_CHARS = 45000;
    // Absolute transport runaway guard (per-frame limits are handled by the 45k chunking; this
    // only stops a pathological multi-MB state from flooding the socket).
    const LIVE_CONTEXT_MAX_CHARS = 600000;
    const LIVE_CONTEXT_CHUNK_DELAY_MS = 180;
    // MODEL budget — the ceiling that actually matters. The live voice model (gemini-2.5-flash
    // native audio) runs a ~128k-TOKEN session window shared by the system prompt, the whole
    // conversation, and streamed audio (~25 tok/s in, ~150 tok/s out). A context snapshot must
    // leave most of that window for the actual conversation, so the default budget is ~32k tokens
    // (≈128k chars at ~4 chars/token — roughly a quarter of the window). The tier ladder steps
    // detail down to fit; narrow scopes (card/tab) keep the high tiers. Tunable per model without
    // a code change: localStorage 'geminiContextCharBudget' (clamped 20k..600k).
    const LIVE_CONTEXT_DEFAULT_BUDGET_CHARS = 128000;
    function liveContextBudgetChars() {
        let override = 0;
        try { override = Number(window.localStorage?.getItem('geminiContextCharBudget')) || 0; } catch (e) { /* storage blocked */ }
        const budget = override > 0 ? override : LIVE_CONTEXT_DEFAULT_BUDGET_CHARS;
        return Math.max(20000, Math.min(LIVE_CONTEXT_MAX_CHARS, budget));
    }
    // Mode 2 budget — the snapshot goes to the TEXT BRAIN (gemini-2.5-flash, 1M-token window)
    // instead of the live session, so it can afford much more detail. Capped at ~50k tokens
    // (200k chars) anyway because the brain is stateless per turn: the snapshot rides along on
    // EVERY request and the free tier meters tokens per minute. Override with localStorage
    // 'geminiTextBrainContextCharBudget'.
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

    async function syncNow(force = true) {
        if (!ns.isHttpContext()) return false;
        const store = ns.getStore();
        if (!store?.captureState) return false;

        const currentState = store.captureState();
        const stateHash = ns.hashState(currentState);
        if (!force && (stateHash === ns.state.lastUploadedHash || stateHash === ns.state.lastSyncedLocalHash)) {
            return false;
        }

        return ns.withOperationMonitor(async () => {
            const { ok, payload } = await ns.requestJson('/api/eve-state/modular/save', {
                method: 'POST',
                body: JSON.stringify(currentState)
            });
            if (!ok || !payload?.ok) {
                return { ok: false, error: payload?.error || 'Failed to save modular state.' };
            }

            ns.state.lastUploadedHash = stateHash;
            ns.state.lastSyncedLocalHash = stateHash;
            ns.state.remoteSignature = payload?.status?.signature || ns.state.remoteSignature;
            return {
                ok: true,
                summary: payload.summary || {},
                status: payload.status || null
            };
        }, {
            kind: 'save',
            startMessage: 'Preparing modular save'
        });
    }

    async function pullNow(force = true) {
        if (!ns.isHttpContext()) return false;
        const remoteStatus = await ns.getRemoteStatus();
        return ns.pullRemoteState(!!force, remoteStatus?.signature || '', {
            ignoreEnabled: true,
            allowEmptyRemoteApply: true,
            allowDestructiveRemoteApply: true
        });
    }

    async function normalizeBookmarkFilenames() {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Normalization requires server mode (localhost or LAN URL).' };
        }

        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/normalize-filenames', {
            method: 'POST'
        });
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to normalize modular bookmark filenames.' };
        }

        await ns.pullRemoteState(true, payload?.status?.signature || '', {
            ignoreEnabled: true,
            allowEmptyRemoteApply: true,
            allowDestructiveRemoteApply: true
        });
        return { ok: true, status: payload?.status || null };
    }

    const CONTEXT_MODE_PROFILES = {
        brief: { limit: 10 },
        summary: { limit: 30 },
        deep: { limit: 60 },
        full: { limit: 90 }
    };

    function normalizeContextMode(mode) {
        const value = String(mode || '').trim().toLowerCase();
        if (value === 'json' || value === 'complete') return 'full';
        return CONTEXT_MODE_PROFILES[value] ? value : 'summary';
    }

    function modeLimit(mode, fallback) {
        const profile = CONTEXT_MODE_PROFILES[normalizeContextMode(mode)] || CONTEXT_MODE_PROFILES.summary;
        return Math.max(5, Math.min(200, Number(fallback) || profile.limit));
    }

    function getRuntimeConfigForContext() {
        return window.eveState?.config
            || window.config
            || (typeof config !== 'undefined' ? config : null)
            || null;
    }

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getConfigForContextManifest(payload) {
        return getRuntimeConfigForContext()
            || payload?.bookmarks?.config
            || {};
    }

    function normalizeContextScope(scope) {
        const value = String(scope || '').trim().toLowerCase();
        if (value === 'group') return 'group';
        if (value === 'all' || value === 'store' || value === 'datapack') return 'all';
        if (value === 'card' || value === 'category') return 'card';
        return 'workspace';
    }

    function getContextWorkspaces() {
        const cfg = getRuntimeConfigForContext() || {};
        return Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
    }

    function findContextWorkspace(workspaceId, nodes = getContextWorkspaces()) {
        const target = text(workspaceId, '').toLowerCase();
        if (!target) return null;
        for (const workspace of Array.isArray(nodes) ? nodes : []) {
            if (text(workspace?.id, '').toLowerCase() === target) return workspace;
            const nested = findContextWorkspace(workspaceId, workspace?.subTabs);
            if (nested) return nested;
        }
        return null;
    }

    function collectContextWorkspaceBranchIds(workspaceId) {
        const root = findContextWorkspace(workspaceId);
        const ids = new Set([text(workspaceId, 'main')]);
        function visit(node) {
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach((child) => {
                // Inactive tabs are hidden state on the site — they are not eligible as context.
                if (!child?.id || child.hiddenInParent || child.inactive === true) return;
                ids.add(text(child.id, ''));
                if (!child.hideSubTabs) visit(child);
            });
        }
        if (root && !root.hideSubTabs) visit(root);
        return Array.from(ids).filter(Boolean);
    }

    // Context must match what the site currently SHOWS: inactive tabs and root tabs living in
    // hidden sidebar groups are invisible on the site, so they are not eligible to be sent.
    function isWorkspaceContextEligible(rootNode, cfg) {
        if (!rootNode || rootNode.inactive === true) return false;
        const groupId = text(rootNode.groupId, '');
        if (!groupId) return true;
        const groups = Array.isArray(cfg?.sidebarGroups) ? cfg.sidebarGroups : [];
        const group = groups.find((item) => String(item?.id || '') === groupId);
        return !(group && group.hidden === true);
    }

    function getVisibleContextWorkspaceIds() {
        const cfg = getRuntimeConfigForContext() || {};
        const ids = [];
        (Array.isArray(cfg.workspaces) ? cfg.workspaces : []).forEach((root) => {
            if (!isWorkspaceContextEligible(root, cfg)) return;
            (function visit(node) {
                if (!node?.id || node.inactive === true) return;
                ids.push(String(node.id));
                (Array.isArray(node.subTabs) ? node.subTabs : []).forEach(visit);
            })(root);
        });
        return ids;
    }

    function getGroupOverviewContextScope(cfg) {
        const groupId = text(cfg?.groupOverviewId, '');
        const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
        if (!groupId || typeof groupsApi?.getGroupRoots !== 'function') return null;
        const ids = new Set();
        (groupsApi.getGroupRoots(groupId, cfg) || []).forEach((root) => {
            if (!root?.id) return;
            collectContextWorkspaceBranchIds(root.id).forEach((id) => ids.add(id));
        });
        const group = typeof groupsApi.findGroupById === 'function' ? groupsApi.findGroupById(groupId, cfg) : null;
        return ids.size ? {
            scope: 'all',
            workspaceId: Array.from(ids)[0] || '',
            workspaceIds: Array.from(ids),
            categoryName: '',
            label: text(group?.name, 'Group overview'),
            source: 'group-overview'
        } : null;
    }

    function getCurrentGeminiContextScope() {
        const cfg = getRuntimeConfigForContext();
        const activeWorkspace = String(cfg.activeWorkspace || 'main').trim() || 'main';
        const groupScope = getGroupOverviewContextScope(cfg);
        if (groupScope) return groupScope;
        const isUnidex = String(cfg.viewMode || '').toLowerCase() === 'unidex';
        if (isUnidex) {
            const stage = String(cfg.unidexStage || 'tabs').toLowerCase();
            const selectedWorkspace = String(cfg.unidexSelectedWorkspaceId || activeWorkspace).trim() || activeWorkspace;
            const selectedCategory = String(cfg.unidexSelectedCategory || '').trim();
            if (stage === 'entries' && selectedCategory) {
                return {
                    scope: 'card',
                    workspaceId: selectedWorkspace,
                    categoryName: selectedCategory,
                    source: 'unidex-card'
                };
            }
            if (stage === 'cards' && selectedWorkspace) {
                return {
                    scope: 'workspace',
                    workspaceId: selectedWorkspace,
                    workspaceIds: collectContextWorkspaceBranchIds(selectedWorkspace),
                    categoryName: '',
                    source: 'unidex-workspace'
                };
            }
            return {
                scope: 'all',
                workspaceId: '',
                // Explicit visible set: hidden groups and inactive tabs stay out of the
                // whole-datapack scope, matching what Unidex actually shows.
                workspaceIds: getVisibleContextWorkspaceIds(),
                categoryName: '',
                label: 'Whole datapack',
                source: 'unidex-global'
            };
        }
        return {
            scope: 'workspace',
            workspaceId: activeWorkspace,
            workspaceIds: collectContextWorkspaceBranchIds(activeWorkspace),
            categoryName: '',
            source: 'search-monitor'
        };
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

    async function fetchGeminiContext(mode = 'summary', limit = 25, options = {}) {
        const safeMode = normalizeContextMode(mode);
        const safeLimit = modeLimit(safeMode, limit);
        const scopeOptions = Object.assign({}, getCurrentGeminiContextScope(), options?.scope || {});
        const safeScope = normalizeContextScope(scopeOptions.scope);
        const params = new URLSearchParams();
        params.set('mode', safeMode);
        params.set('limit', String(safeLimit));
        params.set('scope', safeScope);
        if (scopeOptions.workspaceId) params.set('workspaceId', String(scopeOptions.workspaceId));
        if (Array.isArray(scopeOptions.workspaceIds) && scopeOptions.workspaceIds.length) {
            params.set('workspaceIds', scopeOptions.workspaceIds.join(','));
        }
        if (safeScope === 'card' && scopeOptions.categoryName) {
            params.set('categoryName', String(scopeOptions.categoryName));
        }
        let remoteError = '';
        if (typeof ns.isHttpContext !== 'function' || ns.isHttpContext()) {
            try {
                const query = `/api/eve-state/modular/gemini-context?${params.toString()}`;
                const { ok, payload } = await ns.requestJson(query);
                if (ok && payload?.ok) {
                    return {
                        ok: true,
                        mode: payload.mode || safeMode,
                        contextText: payload.contextText || '',
                        payload: payload.payload || null,
                        manifest: buildContextManifest({
                            mode: payload.mode || safeMode,
                            payload: payload.payload || null,
                            scope: scopeOptions
                        }, payload.contextText || '', safeLimit)
                    };
                }
                remoteError = payload?.error || 'Failed to build Gemini context.';
            } catch (error) {
                remoteError = error?.message || String(error || 'Failed to fetch Gemini context.');
            }
        } else {
            remoteError = 'Server context API unavailable in file:// mode.';
        }

        if (typeof ns.buildLocalGeminiContext === 'function') {
            const localContext = ns.buildLocalGeminiContext(safeMode, safeLimit, { scope: scopeOptions });
            if (localContext?.ok) {
                const contextText = localContext.contextText || '';
                return {
                    ok: true,
                    mode: localContext.mode || safeMode,
                    contextText,
                    payload: localContext.payload || null,
                    localFallback: true,
                    remoteError,
                    manifest: buildContextManifest({
                        mode: localContext.mode || safeMode,
                        payload: localContext.payload || null,
                        scope: scopeOptions
                    }, contextText, safeLimit)
                };
            }
            remoteError = `${remoteError || 'Server context API unavailable.'} Local fallback failed: ${localContext?.error || 'unknown error'}`;
        }

        return { ok: false, error: remoteError || 'Failed to build Gemini context.' };
    }

    // Lower-detail tiers rebuild the SAME scope with fewer samples and tighter field limits, so
    // stepping down produces a complete, valid JSON snapshot that fits the transport ceiling —
    // unlike byte-chopping a huge one, which shipped Gemini broken JSON on extreme datapacks.
    const CONTEXT_TIER_LADDER = ['full', 'deep', 'summary', 'brief'];
    // Headroom reserved for the nexus-trace block + chunk markers appended after tier selection.
    const LIVE_CONTEXT_APPEND_RESERVE_CHARS = 12000;

    async function sendContextToGemini(mode = 'summary', limit = 25, options = {}) {
        let context = await fetchGeminiContext(mode, limit, options);
        if (!context.ok) return context;

        // Auto-step the detail tier down until the snapshot fits the MODEL budget (not just the
        // transport guard). In Mode 2 the destination is the text brain's 1M-token window, so the
        // budget is far roomier than the live session's.
        const brainSlot = textBrainContextSlot();
        const budgetChars = brainSlot ? textBrainContextBudgetChars() : liveContextBudgetChars();
        let autoDegradedFrom = null;
        let autoDegradedChars = 0;
        let ladderIndex = CONTEXT_TIER_LADDER.indexOf(normalizeContextMode(context.mode));
        if (ladderIndex === -1) ladderIndex = CONTEXT_TIER_LADDER.indexOf('summary');
        while ((context.contextText || '').length > budgetChars - LIVE_CONTEXT_APPEND_RESERVE_CHARS
            && ladderIndex < CONTEXT_TIER_LADDER.length - 1) {
            if (!autoDegradedFrom) {
                autoDegradedFrom = normalizeContextMode(context.mode);
                autoDegradedChars = (context.contextText || '').length;
            }
            ladderIndex += 1;
            const lower = await fetchGeminiContext(CONTEXT_TIER_LADDER[ladderIndex], limit, options);
            if (!lower.ok) break;
            context = lower;
        }

        const payloadHasNexusLog = Array.isArray(context?.payload?.nexusLog) && context.payload.nexusLog.length;
        const traceLimit = context.mode === 'brief' ? 1 : 3;
        const recentNexusTraces = payloadHasNexusLog ? [] : getRecentNexusTraces(traceLimit);
        const rawMessage = (context.contextText || '') + buildNexusTraceContextBlock(recentNexusTraces);
        const prepared = prepareLiveContextMessage(rawMessage, budgetChars);
        const message = prepared.message;
        if (!message) return { ok: false, error: 'Empty Gemini context payload.' };

        const manifest = {
            ...(context.manifest || buildContextManifest(context, message, limit)),
            messageChars: message.length,
            messageLines: message.split(/\r?\n/).length,
            nexusTraceCount: recentNexusTraces.length,
            localFallback: !!context.localFallback,
            contextSource: context.localFallback ? 'browser-state-fallback' : 'server-api',
            transportChunkCount: prepared.parts.length,
            transportChunkChars: LIVE_CONTEXT_CHUNK_CHARS,
            transportTruncated: prepared.truncated,
            autoDegradedFrom,
            autoDegradedChars,
            modelBudgetChars: budgetChars,
            estimatedTokens: Math.round(message.length / 4)
        };

        const rememberReplay = () => {
            window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};
            window.GeminiLiveLinkAgentic._lastContextReplay = { mode: context.mode, limit, options, at: Date.now() };
        };

        // Mode 2: hand the snapshot to the TEXT BRAIN instead of spending the live session's
        // ~128k-token window on it. The brain (1M-token window) includes it on every turn and
        // already tells the live model what to say — so the context informs every reply without
        // the live session ever seeing the bulk.
        if (brainSlot) {
            rememberReplay();
            const handoff = brainSlot.setEveContext(message, { ...manifest, route: 'text-brain' });
            if (typeof window.displayMessage === 'function') {
                const degradeNote = autoDegradedFrom
                    ? ` — auto-stepped down from ${autoDegradedFrom} (${autoDegradedChars.toLocaleString()} chars exceeded the text-brain budget)`
                    : '';
                window.displayMessage(
                    `System Message: Handed EveOS context snapshot (${context.mode}, ${manifest.messageChars} chars, ${manifest.contextSource})${degradeNote} to the Mode 2 Text Brain — it now informs every reply.`,
                    true
                );
            }
            return {
                ok: true,
                sent: true,
                route: 'text-brain',
                mode: context.mode,
                manifest: { ...manifest, route: 'text-brain' },
                localFallback: !!context.localFallback,
                handoffChars: handoff?.chars || message.length
            };
        }

        const sendPayload = (route = 'websocket') => {
            rememberReplay();
            prepared.parts.forEach((part, index) => {
                const payload = {
                    source: 'modular_gemini_context',
                    realtime_input: {
                        media_chunks: [{
                            mime_type: 'text/plain',
                            data: prepared.parts.length > 1
                                ? `[EveOS context chunk ${index + 1}/${prepared.parts.length}]\n${part}`
                                : part
                        }]
                    },
                    is_system_context: true,
                    is_modular_context: true,
                    context_mode: context.mode,
                    context_manifest: {
                        ...manifest,
                        route,
                        chunkIndex: index + 1,
                        chunkCount: prepared.parts.length,
                        sentAt: new Date().toISOString()
                    }
                };
                const sendPart = () => {
                    if (!window.webSocket || window.webSocket.readyState !== WebSocket.OPEN) {
                        console.warn('[GeminiContext] Skipped context chunk because WebSocket is no longer open.', index + 1, prepared.parts.length);
                        return;
                    }
                    window.webSocket.send(JSON.stringify(payload));
                };
                if (index === 0) sendPart();
                else {
                    const timer = window.setTimeout || globalThis.setTimeout;
                    if (typeof timer === 'function') timer(sendPart, index * LIVE_CONTEXT_CHUNK_DELAY_MS);
                    else sendPart();
                }
            });
            if (typeof window.displayMessage === 'function') {
                const degradeNote = autoDegradedFrom
                    ? ` — auto-stepped down from ${autoDegradedFrom} (${autoDegradedChars.toLocaleString()} chars exceeded the transport ceiling)`
                    : '';
                window.displayMessage(
                    `System Message: Sent EveOS context snapshot (${context.mode}, ${manifest.messageChars} chars, ${manifest.transportChunkCount} chunk(s), ${manifest.contextSource})${degradeNote} to Gemini`,
                    true
                );
            }
        };

        if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
            sendPayload('websocket');
            return { ok: true, sent: true, route: 'websocket', mode: context.mode, manifest, localFallback: !!context.localFallback };
        }

        if (typeof window.waitForConnection === 'function') {
            window.waitForConnection(() => sendPayload('queued-websocket'), 1000);
            return { ok: true, sent: true, queued: true, route: 'queued-websocket', mode: context.mode, manifest, localFallback: !!context.localFallback };
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(message);
            return { ok: true, sent: false, copied: true, route: 'clipboard', mode: context.mode, manifest, localFallback: !!context.localFallback };
        }

        return { ok: false, error: 'Gemini socket unavailable and clipboard access denied.' };
    }

    window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};
    window.GeminiLiveLinkAgentic.replayLastContext = async function () {
        const last = window.GeminiLiveLinkAgentic._lastContextReplay;
        if (!last || Date.now() - last.at > 3600000) return false;
        const result = await sendContextToGemini(last.mode, last.limit, last.options || {});
        return !!(result && result.sent);
    };

    Object.assign(ns, {
        syncNow,
        pullNow,
        normalizeBookmarkFilenames,
        getCurrentGeminiContextScope,
        getVisibleContextWorkspaceIds,
        isWorkspaceContextEligible,
        fetchGeminiContext,
        sendContextToGemini
    });

    ns.apiContextReady = true;
})();
