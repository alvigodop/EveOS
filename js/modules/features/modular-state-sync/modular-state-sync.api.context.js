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
            payload: payload.payload || null
        };
    }

    async function sendContextToGemini(mode = 'summary', limit = 25) {
        const context = await fetchGeminiContext(mode, limit);
        if (!context.ok) return context;

        const message = context.contextText || '';
        if (!message) return { ok: false, error: 'Empty Gemini context payload.' };

        if (typeof window.sendTextMessage === 'function') {
            window.sendTextMessage(message, true);
            if (typeof window.displayMessage === 'function') {
                window.displayMessage(`System Message: Sent modular state context (${context.mode}) to Gemini`, true);
            }
            return { ok: true, sent: true, mode: context.mode };
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(message);
            return { ok: true, sent: false, copied: true, mode: context.mode };
        }

        return { ok: false, error: 'sendTextMessage unavailable and clipboard access denied.' };
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
