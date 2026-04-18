// --- Modular State Sync API: Store Actions ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiStoreReady) return;
    if (!ns.sharedReady || !ns.engineReady) {
        console.warn('[ModularStateSync] Shared helpers or engine missing; API store actions not initialized.');
        return;
    }

    const { state } = ns;

    async function getStorePath(options = {}) {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Store path endpoint requires server mode (localhost or LAN URL).' };
        }
        const params = new URLSearchParams();
        const scope = String(options.layer || options.scope || '').trim().toLowerCase();
        if (scope) params.set('layer', scope);
        if (options.workspaceId) params.set('workspaceId', String(options.workspaceId));
        if (options.categoryName) params.set('categoryName', String(options.categoryName));
        if (options.folderId) params.set('folderId', String(options.folderId));
        if (options.bookmarkId) params.set('bookmarkId', String(options.bookmarkId));
        const path = params.toString()
            ? `/api/eve-state/modular/path?${params.toString()}`
            : '/api/eve-state/modular/path';
        const { ok, payload } = await ns.requestJson(path);
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to load modular store path.' };
        }
        return {
            ok: true,
            activePath: String(payload.activePath || ''),
            rootPath: String(payload.rootPath || payload.activePath || ''),
            layer: String(payload.layer || scope || 'store'),
            layerPath: String(payload.layerPath || payload.rootPath || payload.activePath || ''),
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
            folderId: options.folderId || '',
            bookmarkId: options.bookmarkId || '',
            destinationPath: String(options.destinationPath || '').trim(),
            overwrite: !!options.overwrite
        };
        return ns.withOperationMonitor(async () => {
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
        }, {
            kind: 'backup',
            startMessage: `Preparing ${body.layer || 'store'} backup`
        });
    }

    async function importLayer(options = {}) {
        if (!ns.isHttpContext()) {
            return { ok: false, error: 'Layer import requires server mode (localhost or LAN URL).' };
        }

        const body = {
            layer: String(options.layer || '').toLowerCase(),
            workspaceId: options.workspaceId || '',
            categoryName: options.categoryName || '',
            folderId: options.folderId || '',
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
        getStorePath,
        pickFolderPath,
        setStorePath,
        backupLayer,
        importLayer
    });

    ns.apiStoreReady = true;
})();
