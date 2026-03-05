// --- Modular State Sync API ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiReady) return;
    if (!ns.sharedReady || !ns.engineReady) {
        console.warn('[ModularStateSync] Shared helpers or engine missing; API not initialized.');
        return;
    }

    const { state } = ns;

    async function syncNow(force = true) {
        if (!ns.isHttpContext()) return false;
        return ns.pushLocalState(!!force, '', { ignoreEnabled: true });
    }

    async function pullNow(force = true) {
        if (!ns.isHttpContext()) return false;
        const remoteStatus = await ns.getRemoteStatus();
        return ns.pullRemoteState(!!force, remoteStatus?.signature || '', { ignoreEnabled: true });
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

        await ns.pullRemoteState(true, payload?.status?.signature || '', { ignoreEnabled: true });
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

    async function getStorePath() {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Store path endpoint requires server mode (localhost or LAN URL).' };
        }
        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/path');
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to load modular store path.' };
        }
        return {
            ok: true,
            activePath: String(payload.activePath || ''),
            rootPath: String(payload.rootPath || payload.activePath || ''),
            selection: payload.selection || null,
            defaultPath: String(payload.defaultPath || ''),
            settingsFile: String(payload.settingsFile || ''),
            status: payload.status || null
        };
    }

    async function pickFolderPath(initialPath = '') {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Folder picker requires server mode (localhost or LAN URL).' };
        }
        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/pick-folder', {
            method: 'POST',
            body: JSON.stringify({
                initialPath: String(initialPath || '').trim()
            })
        });
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to open folder picker.' };
        }
        return {
            ok: true,
            canceled: !!payload.canceled,
            path: String(payload.path || '')
        };
    }

    async function setStorePath(path, options = {}) {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Store path changes require server mode (localhost or LAN URL).' };
        }

        const createIfMissing = options?.createIfMissing === undefined ? true : !!options.createIfMissing;
        const bootstrap = options?.bootstrap === undefined ? true : !!options.bootstrap;
        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/path', {
            method: 'POST',
            body: JSON.stringify({
                path: String(path || '').trim(),
                createIfMissing
            })
        });
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to set modular store path.' };
        }

        state.remoteSignature = '';
        state.lastUploadedHash = '';
        state.lastSyncedLocalHash = '';

        if (bootstrap) {
            const fileCount = Number(payload?.status?.fileCount || 0);
            if (fileCount > 0) {
                const pulled = await ns.pullRemoteState(true, payload?.status?.signature || '', { ignoreEnabled: true });
                if (!pulled) {
                    state.remoteSignature = payload?.status?.signature || state.remoteSignature;
                    const currentHash = ns.captureStateHash();
                    state.lastUploadedHash = currentHash;
                    state.lastSyncedLocalHash = currentHash;
                }
            } else {
                await ns.pushLocalState(true, '', { ignoreEnabled: true });
            }
        }

        if (ns.isEnabled()) ns.startPolling();

        return {
            ok: true,
            activePath: String(payload.activePath || ''),
            rootPath: String(payload.rootPath || payload.activePath || ''),
            selection: payload.selection || null,
            defaultPath: String(payload.defaultPath || ''),
            status: payload.status || null
        };
    }

    async function backupLayer(options = {}) {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Layer backup requires server mode (localhost or LAN URL).' };
        }

        const body = {
            layer: String(options.layer || 'store').toLowerCase(),
            workspaceId: options.workspaceId || '',
            categoryName: options.categoryName || '',
            bookmarkId: options.bookmarkId || '',
            destinationPath: String(options.destinationPath || '').trim(),
            overwrite: !!options.overwrite
        };
        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/backup-layer', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to backup modular layer.' };
        }
        return {
            ok: true,
            layer: payload.layer,
            destinationPath: payload.destinationPath || '',
            summary: payload.summary || {},
            status: payload.status || null
        };
    }

    async function importLayer(options = {}) {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Layer import requires server mode (localhost or LAN URL).' };
        }

        const body = {
            layer: String(options.layer || '').toLowerCase(),
            workspaceId: options.workspaceId || '',
            categoryName: options.categoryName || '',
            bookmarkId: options.bookmarkId || '',
            sourcePath: String(options.sourcePath || '').trim()
        };
        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/import-layer', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to import modular layer.' };
        }

        await ns.pullRemoteState(true, payload?.status?.signature || '', { ignoreEnabled: true });
        return {
            ok: true,
            layer: payload.layer,
            sourcePath: payload.sourcePath || '',
            summary: payload.summary || {},
            status: payload.status || null
        };
    }

    Object.assign(ns, {
        syncNow,
        pullNow,
        normalizeBookmarkFilenames,
        fetchGeminiContext,
        sendContextToGemini,
        getStorePath,
        pickFolderPath,
        setStorePath,
        backupLayer,
        importLayer
    });

    ns.apiReady = true;
})();
