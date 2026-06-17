// --- Modular State Sync API: Context Actions ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextReady) return;
    if (!ns.sharedReady || !ns.engineReady) {
        console.warn('[ModularStateSync] Shared helpers or engine missing; API context not initialized.');
        return;
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

    function getConfigForContextManifest(payload) {
        return window.eveState?.config
            || window.config
            || payload?.bookmarks?.config
            || (typeof config !== 'undefined' ? config : null)
            || {};
    }

    function countLibraryEntries(categories) {
        if (!categories || typeof categories !== 'object') return 0;
        return Object.values(categories).reduce((total, list) => (
            total + (Array.isArray(list) ? list.length : 0)
        ), 0);
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

    function buildContextManifest(context, message, limit) {
        const payload = context?.payload || {};
        const cfg = getConfigForContextManifest(payload);
        const activeWorkspaceId = String(cfg.activeWorkspace || 'main');
        const activeWorkspace = Array.isArray(cfg.workspaces)
            ? cfg.workspaces.find((workspace) => String(workspace?.id || '') === activeWorkspaceId)
            : null;
        return {
            schema: 'eveos.gemini-context-manifest.v1',
            label: 'EveOS Context Snapshot',
            mode: context?.mode || 'summary',
            scope: 'current modular datapack',
            activeWorkspaceId,
            activeWorkspaceName: activeWorkspace?.name || activeWorkspaceId,
            sampleLimit: Math.max(5, Math.min(200, Number(limit) || 25)),
            messageChars: String(message || '').length,
            messageLines: String(message || '').split(/\r?\n/).length,
            counts: getContextPayloadCounts(payload),
            generatedAt: new Date().toISOString()
        };
    }

    async function fetchGeminiContext(mode = 'summary', limit = 25) {
        const safeMode = String(mode || 'summary').toLowerCase() === 'full' ? 'full' : 'summary';
        const safeLimit = Math.max(5, Math.min(200, Number(limit) || 25));
        const query = `/api/eve-state/modular/gemini-context?mode=${encodeURIComponent(safeMode)}&limit=${encodeURIComponent(safeLimit)}`;
        const { ok, payload } = await ns.requestJson(query);
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to build Gemini context.' };
        }
        return {
            ok: true,
            mode: payload.mode || safeMode,
            contextText: payload.contextText || '',
            payload: payload.payload || null,
            manifest: buildContextManifest({
                mode: payload.mode || safeMode,
                payload: payload.payload || null
            }, payload.contextText || '', safeLimit)
        };
    }

    async function sendContextToGemini(mode = 'summary', limit = 25) {
        const context = await fetchGeminiContext(mode, limit);
        if (!context.ok) return context;

        const message = context.contextText || '';
        if (!message) return { ok: false, error: 'Empty Gemini context payload.' };

        const manifest = context.manifest || buildContextManifest(context, message, limit);
        const payload = {
            source: 'modular_gemini_context',
            realtime_input: {
                media_chunks: [{
                    mime_type: 'text/plain',
                    data: message
                }]
            },
            is_system_context: true,
            is_modular_context: true,
            context_mode: context.mode,
            context_manifest: manifest
        };

        const sendPayload = (route = 'websocket') => {
            payload.context_manifest = {
                ...manifest,
                route,
                sentAt: new Date().toISOString()
            };
            window.webSocket.send(JSON.stringify(payload));
            if (typeof window.displayMessage === 'function') {
                window.displayMessage(
                    `System Message: Sent EveOS context snapshot (${context.mode}, ${manifest.messageChars} chars) to Gemini`,
                    true
                );
            }
        };

        if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
            sendPayload('websocket');
            return { ok: true, sent: true, route: 'websocket', mode: context.mode, manifest };
        }

        if (typeof window.waitForConnection === 'function') {
            window.waitForConnection(() => sendPayload('queued-websocket'), 1000);
            return { ok: true, sent: true, queued: true, route: 'queued-websocket', mode: context.mode, manifest };
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(message);
            return { ok: true, sent: false, copied: true, route: 'clipboard', mode: context.mode, manifest };
        }

        return { ok: false, error: 'Gemini socket unavailable and clipboard access denied.' };
    }

    Object.assign(ns, {
        syncNow,
        pullNow,
        normalizeBookmarkFilenames,
        fetchGeminiContext,
        sendContextToGemini
    });

    ns.apiContextReady = true;
})();
