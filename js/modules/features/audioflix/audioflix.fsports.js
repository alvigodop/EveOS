// Browser-native soundboard folder ports — no EveOS server required (works on file://).
//
// The classic "Ports" feature stores a bare folder PATH and needs the localhost server to
// os.listdir it and stream the bytes, because a web page cannot enumerate a directory from a
// path string and fetch('file://...') is blocked even on file:// pages. This module does it the
// way the PC-image features do: the user GRANTS the folder once via showDirectoryPicker, the
// FileSystemDirectoryHandle is persisted in IndexedDB, and every session we re-enumerate the
// handle in pure JS and hand out blob: URLs — which both <audio> playback and
// decodeAudioData/getDecodedBuffer can consume. Listing + browser playback become fully
// serverless; only the native CABLE bridge / global hotkeys still need a running EveOS port
// (they live in the Python process).
window.EveAudioflixFsPorts = window.EveAudioflixFsPorts || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixFsPorts;
    if (ns.ready) return;

    // Mirror the server-side port filter (audioflix_bridge_ports.py AUDIO_EXTENSIONS).
    const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
    const DB_NAME = 'eve-audioflix-fsports';
    const STORE = 'folders';
    let liveObjectUrls = [];

    function supported() {
        return typeof window.showDirectoryPicker === 'function' && !!window.indexedDB;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function tx(db, mode, run) {
        return new Promise((resolve, reject) => {
            const t = db.transaction(STORE, mode);
            const out = run(t.objectStore(STORE));
            t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
            t.onerror = () => reject(t.error);
        });
    }

    async function allRecords() {
        const db = await openDb();
        try {
            return (await tx(db, 'readonly', (store) => store.getAll())) || [];
        } finally {
            db.close();
        }
    }

    // Ask the user to grant a folder; the handle persists across sessions in IndexedDB.
    // overrides.id / overrides.nickname let a grant be stored under an EXISTING server port's
    // identity ("recalibrating" that port for serverless use): item ids embed this record id, so
    // reusing the port's id keeps every per-item setting (volume/expose/hotkeys/groups) intact.
    // Re-granting the same id just replaces the stored handle.
    async function addFolder(overrides) {
        if (!supported()) throw new Error('This browser does not support folder access (needs Edge/Chrome).');
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        const opts = overrides && typeof overrides === 'object' ? overrides : {};
        const record = {
            id: String(opts.id || '') || 'fsp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            nickname: String(opts.nickname || '').trim() || handle.name || 'Sound folder',
            handle,
            addedAt: Date.now()
        };
        const db = await openDb();
        try {
            await tx(db, 'readwrite', (store) => store.put(record));
        } finally {
            db.close();
        }
        return { id: record.id, nickname: record.nickname };
    }

    async function removeFolder(id) {
        const db = await openDb();
        try {
            await tx(db, 'readwrite', (store) => store.delete(id));
        } finally {
            db.close();
        }
        return true;
    }

    async function permissionOf(handle) {
        // A restored stub (backed-up folder not yet re-granted in this browser) has no handle;
        // treat it exactly like a permission the browser downgraded to 'prompt' — needs reconnect.
        if (!handle) return 'prompt';
        try {
            return await handle.queryPermission({ mode: 'read' });
        } catch (e) {
            return 'error';
        }
    }

    function stateApi() {
        return window.EveAudioflixState;
    }

    // Keep config.audioflix.browserFolders (a JSON-serializable metadata mirror) in step with the
    // IndexedDB registry AND materialize restored stubs. A backup carries the mirror; on a fresh
    // browser (incognito reload / new machine) the handles are gone, so we recreate stub records
    // from the mirror — they list as "Needs reconnect" and re-grant under the SAME id, keeping
    // every per-item setting (volume/expose/hotkey/groups) intact.
    async function reconcile() {
        const api = stateApi();
        if (!supported() || !api?.ensure) return;
        const st = api.ensure();
        const current = Array.isArray(st.browserFolders) ? st.browserFolders : [];
        // A folder promoted to a path-based server Port (see "Save path") keeps its id in
        // state.ports — never re-stub it as a browser folder or leave it in the mirror.
        const portIds = new Set((st.ports || []).map((port) => port.id));
        const mirror = current.filter((folder) => folder && folder.id && !portIds.has(folder.id));
        const db = await openDb();
        try {
            const records = (await tx(db, 'readonly', (store) => store.getAll())) || [];
            const byId = new Map(records.map((rec) => [rec.id, rec]));
            for (const folder of mirror) {
                if (byId.has(folder.id)) continue;
                const stub = { id: folder.id, nickname: folder.nickname || 'Sound folder', handle: null, addedAt: folder.addedAt || Date.now() };
                await tx(db, 'readwrite', (store) => store.put(stub));
                byId.set(stub.id, stub);
            }
            const registry = [...byId.values()]
                .filter((rec) => !portIds.has(rec.id))
                .map((rec) => ({ id: rec.id, nickname: rec.nickname, addedAt: rec.addedAt || 0 }));
            const inSync = registry.length === current.length
                && registry.every((rec) => current.some((folder) => folder.id === rec.id && folder.nickname === rec.nickname));
            if (!inSync) api.update({ browserFolders: registry }, 'audioflix-browser-folders');
        } finally {
            db.close();
        }
    }

    // [{ id, nickname, permission }] — 'granted' | 'prompt' | 'denied' | 'error'
    async function folderStates() {
        if (!supported()) return [];
        const records = await allRecords();
        const states = [];
        for (const rec of records) {
            states.push({ id: rec.id, nickname: rec.nickname, permission: await permissionOf(rec.handle) });
        }
        return states;
    }

    // Re-grant folders the browser downgraded to 'prompt' since last session. requestPermission
    // needs a user gesture, so this is only called from the Reconnect button click.
    async function reconnectAll() {
        const records = await allRecords();
        let granted = 0;
        for (const rec of records) {
            try {
                if ((await permissionOf(rec.handle)) === 'granted') { granted++; continue; }
                if ((await rec.handle.requestPermission({ mode: 'read' })) === 'granted') granted++;
            } catch (e) { /* denied or handle gone — surfaced via folderStates badge */ }
        }
        return granted;
    }

    // Enumerate every GRANTED folder (top-level audio files, matching the server port behavior)
    // into soundboard-shaped raw items. The id embeds the persisted record id + filename so the
    // existing per-item maps (portVolumes / exposedPortedSounds / portHotkeys) keep working
    // unchanged across sessions and across server/browser modes.
    // Resolve an absolute disk path to a playable blob: URL through the granted folder handles.
    //
    // A localized music track stores a real path (C:\...\All Songs\track.mp3). A browser cannot
    // open that path — fetch('file://') is blocked, and even a file:// page treats other file URLs
    // as separate origins — so playback used to go through the localhost port server and simply
    // fell silent whenever that server was not running. The handles the user already granted for
    // Browser Folders can serve the same bytes with no server at all, which is why the soundboard
    // works offline and the music library did not.
    //
    // Handles expose only their folder NAME, never an absolute path, so match on the parent folder
    // name and confirm by actually opening the file; failing that, accept any granted folder that
    // directly holds a file of that name.
    const pathBlobCache = new Map();

    function splitPath(localPath) {
        const parts = String(localPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
        return { file: parts.pop() || '', dir: parts.pop() || '' };
    }

    async function fileUrlForPath(localPath) {
        if (!supported() || !localPath) return '';
        const cached = pathBlobCache.get(localPath);
        if (cached) return cached;
        const { file, dir } = splitPath(localPath);
        if (!file) return '';

        const records = await allRecords();
        const granted = [];
        for (const rec of records) {
            if (!rec.handle) continue;
            if ((await permissionOf(rec.handle)) !== 'granted') continue;
            granted.push(rec);
        }
        // Same-named parent folder first, then any granted folder holding that filename.
        const ordered = [
            ...granted.filter((r) => String(r.handle.name || '').toLowerCase() === dir.toLowerCase()),
            ...granted.filter((r) => String(r.handle.name || '').toLowerCase() !== dir.toLowerCase())
        ];
        for (const rec of ordered) {
            try {
                const handle = await rec.handle.getFileHandle(file);
                const url = URL.createObjectURL(await handle.getFile());
                liveObjectUrls.push(url);
                pathBlobCache.set(localPath, url);
                return url;
            } catch { /* not in this folder — keep looking */ }
        }
        return '';
    }

    // Blob URLs are revoked when the ported list is rebuilt; drop the path cache with them so a
    // later lookup mints a fresh one instead of handing back a dead URL.
    function clearPathCache() { pathBlobCache.clear(); }

    async function listSounds() {
        clearPathCache();
        if (!supported()) return [];
        liveObjectUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { } });
        liveObjectUrls = [];
        const records = await allRecords();
        const items = [];
        for (const rec of records) {
            try {
                if ((await permissionOf(rec.handle)) !== 'granted') continue;
                const files = [];
                for await (const [name, entry] of rec.handle.entries()) {
                    if (entry.kind !== 'file') continue;
                    const dot = name.lastIndexOf('.');
                    if (dot < 0 || !AUDIO_EXTENSIONS.has(name.slice(dot).toLowerCase())) continue;
                    files.push({ name, entry });
                }
                files.sort((a, b) => a.name.localeCompare(b.name));
                for (const f of files) {
                    const url = URL.createObjectURL(await f.entry.getFile());
                    liveObjectUrls.push(url);
                    items.push({
                        id: `ported_${rec.id}_${f.name}`,
                        title: f.name.replace(/\.[^/.]+$/, ''),
                        url,
                        category: rec.nickname
                    });
                }
            } catch (err) {
                console.warn(`[Audioflix] browser folder "${rec.nickname}" could not be read:`, err);
            }
        }
        return items;
    }

    function renderPortsManager(state, fsPortFolders, deadServerPorts, esc, closeSvg) {
        const ports = state.ports || [];
        const fsSupported = supported();
        const fsById = new Map(fsPortFolders.map(f => [f.id, f]));
        // Server ports can be "recalibrated": granting their folder stores the handle under the
        // PORT's id, so the port itself loads serverless with every per-item setting intact.
        const serverRows = ports.map(p => {
            const link = fsById.get(p.id);
            const status = link
                ? `<code style="display: block; font-size: 0.78rem; color: ${link.permission === 'granted' ? '#7ee2a8' : '#f2b96b'};">${link.permission === 'granted' ? 'Linked — loads without the server (browser access)' : 'Linked — needs reconnect'}</code>`
                : (deadServerPorts.has(p.id) ? '<code style="display: block; font-size: 0.78rem; color: #f2b96b;">Not loaded — server offline. Grant Folder to load it without the server.</code>' : '');
            const grantBtn = fsSupported ? `<button type="button" class="audioflix-add-toggle" data-af-action="link-fsport" data-af-id="${esc(p.id)}" data-af-nickname="${esc(p.nickname)}" style="margin-right: 6px; flex: 0 0 auto;">${link ? 'Re-grant' : 'Grant Folder'}</button>` : '';
            return `<div class="audioflix-port-item"><div><strong>${esc(p.nickname)}</strong><code style="display: block; font-size: 0.8rem; color: #8ab4f8;">${esc(p.path)}</code>${status}</div>${grantBtn}<button type="button" class="audioflix-icon-btn danger" data-af-action="remove-port" data-af-id="${esc(p.id)}">${closeSvg}</button></div>`;
        }).join('') || '<div class="audioflix-empty">No ports configured.</div>';
        // Standalone Browser Folders (not linked to a port): granted-handle sources that need NO
        // server (work on file://). A folder the browser downgraded to 'prompt' since last session
        // shows a Reconnect action (one click re-grants all — requestPermission needs a gesture).
        const standalone = fsPortFolders.filter(f => !ports.some(p => p.id === f.id));
        const pendingCount = fsPortFolders.filter(f => f.permission !== 'granted').length;
        // A non-granted standalone folder (browser-downgraded permission OR a restored backup stub)
        // gets a per-folder Re-grant that re-selects the folder under the same id, so its per-item
        // settings return once reconnected.
        const fsRows = standalone.map(f => {
            // Save path is offered ALWAYS (including on file:// where the folder is happily
            // granted): typing the path once makes it a Port whose path rides in the backup, so a
            // restore on localhost is ready to go. A granted folder KEEPS its handle, so the same
            // entry still loads serverless here — server-dependent on localhost, file:// adaptable.
            // Re-grant only appears when the handle is missing/downgraded and must be re-picked.
            const granted = f.permission === 'granted';
            const btn = (act, label) => `<button type="button" class="audioflix-add-toggle" data-af-action="${act}" data-af-id="${esc(f.id)}" data-af-nickname="${esc(f.nickname)}" data-af-granted="${granted ? '1' : '0'}" style="margin-right: 6px; flex: 0 0 auto;">${label}</button>`;
            const actions = fsSupported
                ? `${btn('portify-fsport', 'Save path')}${granted ? '' : btn('regrant-fsport', 'Re-grant')}`
                : '';
            return `<div class="audioflix-port-item"><div><strong>${esc(f.nickname)}</strong><code style="display: block; font-size: 0.8rem; color: ${f.permission === 'granted' ? '#7ee2a8' : '#f2b96b'};">${f.permission === 'granted' ? 'Connected (browser access)' : 'Needs reconnect'}</code></div>${actions}<button type="button" class="audioflix-icon-btn danger" data-af-action="remove-fsport" data-af-id="${esc(f.id)}">${closeSvg}</button></div>`;
        }).join('') || '<div class="audioflix-empty">No standalone browser folders. Use a port row\'s Grant Folder to link it, or grant a new folder here.</div>';
        const fsSection = fsSupported
            ? `<h4 style="margin-top: 14px;">Browser Folders <span style="font-weight: normal; font-size: 0.78rem; color: #9aa8bd;">(no server needed — works on file://)</span></h4>${fsRows}<div style="display: flex; gap: 8px; margin-top: 8px;"><button type="button" class="audioflix-add-toggle" data-af-action="add-fsport">Grant Folder</button>${pendingCount ? `<button type="button" class="audioflix-add-toggle" data-af-action="reconnect-fsports">Reconnect ${pendingCount} folder${pendingCount === 1 ? '' : 's'}</button>` : ''}</div>`
            : '';
        return `<div class="audioflix-ports-mgr"><h4>Soundboard Ports</h4>${serverRows}<form class="audioflix-ports-form" data-af-form="add-port"><label><span>Nickname</span><input name="nickname" required></label><label><span>Directory Path</span><input name="path" required></label><button type="submit" data-af-action="submit-form">Add Port</button></form>${fsSection}</div>`;
    }

    async function handleAction(action, id, actionTarget) {
        if (action === 'remove-port') {
            try { await removeFolder(id); await reconcile(); } catch (e) { }
            return null;
        }
        if (action === 'link-fsport') {
            try {
                await addFolder({ id, nickname: actionTarget.dataset.afNickname });
                await reconcile();
                return 'Port granted browser access — it now loads without the server';
            } catch (err) {
                if (err?.name !== 'AbortError') return err.message || 'Folder access failed';
            }
            return null;
        }
        if (action === 'regrant-fsport') {
            try {
                await addFolder({ id, nickname: actionTarget.dataset.afNickname });
                await reconcile();
                return 'Browser folder reconnected — per-item settings restored';
            } catch (err) {
                if (err?.name !== 'AbortError') return err.message || 'Folder access failed';
            }
            return null;
        }
        if (action === 'add-fsport') {
            try {
                const rec = await addFolder();
                if (rec) { await reconcile(); return `Browser folder "${rec.nickname}" connected`; }
            } catch (err) {
                if (err?.name !== 'AbortError') return err.message || 'Folder access failed';
            }
            return null;
        }
        if (action === 'remove-fsport') {
            try { await removeFolder(id); await reconcile(); } catch (e) { }
            return null;
        }
        if (action === 'reconnect-fsports') {
            try {
                const n = await reconnectAll();
                return `Reconnected ${n ?? 0} browser folder${n === 1 ? '' : 's'}`;
            } catch (err) {
                return err.message || 'Folder reconnect failed';
            }
        }
        return null;
    }

    async function loadPortedSounds(state, base, deadServerPorts) {
        const ports = state.ports || [], fetched = [], portVols = state.portVolumes || {}, portExposed = state.exposedPortedSounds || {}, portHotkeys = state.portHotkeys || {};
        let fsPortFolders = [];
        try {
            if (supported()) {
                // Surface restored-backup folders (and keep the mirror current) before listing.
                await reconcile().catch(() => {});
                fsPortFolders = await folderStates();
                if (fsPortFolders.some(f => f.permission === 'prompt')) {
                    try { await reconnectAll(); fsPortFolders = await folderStates(); } catch (e) { }
                }
            }
        } catch (err) { console.error('Failed to read browser folder ports:', err); }
        const grantedFs = new Set(fsPortFolders.filter(f => f.permission === 'granted').map(f => f.id));
        for (const p of ports) {
            if (grantedFs.has(p.id)) continue;
            try {
                const res = await fetch(`${base}/api/audioflix/port/list?path=${encodeURIComponent(p.path)}`), data = await res.json();
                if (data.ok && Array.isArray(data.files)) data.files.forEach(f => {
                    const id = `ported_${p.id}_${f.name}`;
                    fetched.push({ id, type: 'sound', title: f.name.replace(/\.[^/.]+$/, ""), url: `${base}/api/audioflix/port/file?path=${encodeURIComponent(f.path)}`, category: p.nickname, isPorted: true, volume: portVols[id] ?? 1, exposed: portExposed[id] === true, hotkey: portHotkeys[id] ?? '' });
                });
                else if (!data.ok) deadServerPorts.add(p.id);
            } catch (err) { deadServerPorts.add(p.id); console.error(`Failed to load port: ${p.nickname}`, err); }
        }
        try {
            if (supported()) (await listSounds()).forEach(r => {
                fetched.push({ ...r, type: 'sound', isPorted: true, volume: portVols[r.id] ?? 1, exposed: portExposed[r.id] === true, hotkey: portHotkeys[r.id] ?? '' });
            });
        } catch (err) { console.error('Failed to load browser folder ports:', err); }
        return { fetched, fsPortFolders };
    }

    Object.assign(ns, {
        ready: true,
        supported,
        fileUrlForPath,
        clearPathCache,
        addFolder,
        removeFolder,
        folderStates,
        reconnectAll,
        listSounds,
        renderPortsManager,
        handleAction,
        loadPortedSounds,
        reconcile
    });
})();
