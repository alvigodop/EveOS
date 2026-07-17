// --- Modular State Sync API: Context Actions ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextReady) return;
    if (!ns.sharedReady || !ns.engineReady) {
        console.warn('[ModularStateSync] Shared helpers or engine missing; API context not initialized.');
        return;
    }

    const syncApi = ns.contextSyncApi;
    const scopeApi = ns.contextScopeApi;
    const transportApi = ns.contextTransportApi;
    if (!syncApi || !scopeApi || !transportApi) {
        console.warn('[ModularStateSync] Context helper modules missing; API context not initialized.');
        return;
    }
    const { syncNow, pullNow, normalizeBookmarkFilenames } = syncApi;
    const {
        normalizeContextMode,
        modeLimit,
        normalizeContextScope,
        getCurrentGeminiContextScope,
        describeWorkspaceTabPath,
        getVisibleContextWorkspaceIds,
        isWorkspaceContextEligible
    } = scopeApi;
    const {
        LIVE_CONTEXT_CHUNK_CHARS,
        LIVE_CONTEXT_CHUNK_DELAY_MS,
        liveContextBudgetChars,
        textBrainContextBudgetChars,
        textBrainContextSlot,
        getRecentNexusTraces,
        buildNexusTraceContextBlock,
        prepareLiveContextMessage,
        buildContextManifest
    } = transportApi;
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

    async function sendContextToGeminiCore(mode = 'summary', limit = 25, options = {}) {
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

    // Traced wrapper: every relay send (button sends, replays) lands in the Data Stream
    // insight timeline, so scoped context handoffs are visible in the Agent Space viewer
    // instead of only their config side-effects.
    async function sendContextToGemini(mode = 'summary', limit = 25, options = {}) {
        const result = await sendContextToGeminiCore(mode, limit, options);
        try {
            const manifest = result?.manifest || {};
            ns.recordDataStreamEvent?.({
                type: 'relay',
                outcome: result?.sent ? 'sent' : (result?.copied ? 'copied' : 'skipped'),
                reason: result?.ok ? '' : String(result?.error || 'failed'),
                route: result?.route || '',
                relayMode: result?.mode || mode,
                scope: { label: String(manifest.scope || ''), scope: String(manifest.scopeMode || '') },
                counts: manifest.counts || null,
                messageChars: Number(manifest.messageChars) || 0,
                transportChunks: Number(manifest.transportChunkCount) || 1,
                autoDegradedFrom: manifest.autoDegradedFrom || null
            });
        } catch { /* tracing is best effort */ }
        return result;
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
        describeWorkspaceTabPath,
        getVisibleContextWorkspaceIds,
        isWorkspaceContextEligible,
        fetchGeminiContext,
        sendContextToGemini
    });

    ns.apiContextReady = true;
})();
