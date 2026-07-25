// Live playlist connections for the Audioflix music library.
//
// An imported playlist becomes a music GROUP whose tracks live in a folder (default
// "Youtube Playlists"). The connection stays live: re-syncing re-reads the upstream playlist and
// reconciles. A track removed upstream is NEVER auto-deleted — it is flagged so the UI can grey
// it out, leaving the choice to remove it from EveOS or move it somewhere else to keep.
//
// Listing the upstream playlist needs the EveOS server (a file:// page cannot read youtube.com
// directly — CORS). The imported tracks and connection settings live in the datapack, so they
// show, play, back up and restore everywhere; only SYNC asks for localhost.
window.EveAudioflixPlaylists = window.EveAudioflixPlaylists || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixPlaylists;
    if (ns.ready) return;

    const DEFAULT_FOLDER = 'Youtube Playlists';

    const text = (value, fallback = '') => String(value ?? '').trim().replace(/^["']+|["']+$/g, '').trim() || fallback;

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function newId() {
        return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Pure reconciliation between the tracks EveOS already has for a connection and what the
    // upstream playlist currently contains. Exported so the rules are testable without a browser.
    //   add     — upstream entries with no local track yet
    //   restore — local tracks previously flagged missing that are back upstream
    //   missing — local tracks no longer upstream (grey out; never auto-delete)
    //   keep    — unchanged
    function diffPlaylist(localTracks, upstreamEntries) {
        const locals = Array.isArray(localTracks) ? localTracks : [];
        const upstream = Array.isArray(upstreamEntries) ? upstreamEntries : [];
        const upstreamById = new Map();
        upstream.forEach((entry) => {
            const sourceId = text(entry?.sourceId);
            if (sourceId && !upstreamById.has(sourceId)) upstreamById.set(sourceId, entry);
        });
        const localById = new Map();
        locals.forEach((track) => {
            const sourceId = text(track?.sourceId);
            if (sourceId && !localById.has(sourceId)) localById.set(sourceId, track);
        });

        const add = [];
        upstreamById.forEach((entry, sourceId) => {
            if (!localById.has(sourceId)) add.push(entry);
        });

        const restore = [];
        const missing = [];
        const keep = [];
        localById.forEach((track, sourceId) => {
            if (upstreamById.has(sourceId)) {
                if (track.upstreamMissing) restore.push(track);
                else keep.push(track);
            } else {
                // Already flagged stays flagged — don't report it as a fresh removal every sync.
                if (!track.upstreamMissing) missing.push(track);
            }
        });
        return { add, restore, missing, keep };
    }

    function connections() {
        return (state().musicPlaylists || []).slice();
    }

    function getConnection(connectionId) {
        return connections().find((entry) => entry.id === connectionId) || null;
    }

    function tracksFor(connectionId) {
        return (state().music || []).filter((track) => track.playlistId === connectionId);
    }

    function saveConnections(next, reason) {
        window.EveAudioflixState?.update?.({ musicPlaylists: next }, reason || 'audioflix-music-playlists');
    }

    // Add one upstream entry as a music track bound to this connection.
    function addTrack(connection, entry, targetFolder = '') {
        const dur = Number(entry?.duration || 0);
        const folderName = text(targetFolder) || text(connection.folder, DEFAULT_FOLDER);
        const added = window.EveAudioflixState?.addItem?.('music', {
            title: text(entry?.title, 'Untitled Track'),
            url: text(entry?.url),
            artist: text(entry?.artist),
            folder: folderName,
            duration: dur
        });
        if (!added) return null;
        window.EveAudioflixState?.updateItem?.('music', added.id, {
            sourceId: text(entry?.sourceId),
            playlistId: connection.id,
            duration: dur,
            upstreamMissing: false
        });
        if (connection.group) window.EveAudioflixState?.toggleMusicGroup?.(added.id, connection.group, true);
        return added;
    }

    function applyDiff(connection, diff, targetFolder = '') {
        diff.add.forEach((entry) => addTrack(connection, entry, targetFolder));
        diff.restore.forEach((track) => window.EveAudioflixState?.updateItem?.('music', track.id, { upstreamMissing: false }));
        // Greyed, not gone: the user decides whether to drop it or move it somewhere to keep.
        diff.missing.forEach((track) => window.EveAudioflixState?.updateItem?.('music', track.id, { upstreamMissing: true }));
    }

    async function fetchUpstream(url, force) {
        const payload = await window.EveAudioflixNative?.listPlaylist?.(url, force);
        if (!payload || payload.ok !== true) {
            const reason = payload?.reason || payload?.message
                || 'Playlist sync needs the EveOS server (a file:// page cannot read the playlist directly). Start start-server.bat and open EveOS on localhost.';
            return { ok: false, reason };
        }
        return payload;
    }

    const DEFAULT_WPL_FOLDER = 'WPL Playlists';

    // Import a playlist URL as a group of tracks. options: { folder, group }
    async function importPlaylist(url, options = {}) {
        const clean = text(url);
        if (!clean) return { ok: false, reason: 'Enter a playlist URL.' };
        const existing = connections().find((entry) => entry.url === clean);
        if (existing) return syncPlaylist(existing.id, true, options.folder);

        const upstream = await fetchUpstream(clean, true);
        if (!upstream.ok) return upstream;

        const connection = {
            id: newId(),
            url: clean,
            playlistId: text(upstream.playlistId),
            title: text(upstream.title, 'Playlist'),
            provider: 'youtube',
            group: text(options.group, text(upstream.title, 'Playlist')),
            folder: text(options.folder, DEFAULT_FOLDER),
            lastSyncedAt: Date.now(),
            trackCount: (upstream.entries || []).length
        };
        if (connection.group) window.EveAudioflixState?.addMusicGroup?.(connection.group);
        saveConnections(connections().concat(connection), 'audioflix-playlist-import');
        applyDiff(connection, diffPlaylist([], upstream.entries || []), options.folder);
        return { ok: true, connection, added: (upstream.entries || []).length, missing: 0 };
    }

    // Import a WPL (Windows Media Player) playlist XML file or path. options: { folder, group }
    async function importWplPlaylist(wplInput, options = {}) {
        const parser = window.EveAudioflixWpl;
        const N = window.EveAudioflixNative;
        let parsed = null;

        if (typeof wplInput === 'object' && wplInput.tracks) {
            parsed = wplInput;
        } else if (typeof wplInput === 'string') {
            const clean = text(wplInput);
            if (!clean) return { ok: false, reason: 'Please specify a WPL playlist file path or content.' };

            if (clean.includes('<smil') || clean.includes('<seq') || clean.includes('<?wpl') || clean.includes('<media')) {
                parsed = parser?.parseWplXml?.(clean, options.wplPath || '');
            } else if (N?.readWplFile) {
                const readRes = await N.readWplFile(clean);
                if (readRes?.ok && readRes.content) {
                    parsed = parser?.parseWplXml?.(readRes.content, readRes.path || clean);
                } else {
                    return {
                        ok: false,
                        reason: `Could not read WPL file from disk (${readRes?.message || 'EveOS server offline'}). Start an EveOS server (start-server.bat) or use "📂 Browse File" to pick your .wpl file directly!`
                    };
                }
            } else if (parser) {
                parsed = parser.parseWplXml(clean, clean);
            }
        }

        if (!parsed || !parsed.ok) {
            return { ok: false, reason: parsed?.reason || 'Could not parse that WPL file. Use "📂 Browse File" to select your .wpl file directly.' };
        }

        const targetFolder = text(options.folder, DEFAULT_WPL_FOLDER);
        const groupTitle = text(options.group, text(parsed.title, 'WPL Playlist'));

        const connection = {
            id: newId(),
            url: parsed.wplPath || 'wpl://local',
            playlistId: `wpl_${Date.now()}`,
            title: groupTitle,
            provider: 'wpl',
            group: groupTitle,
            folder: targetFolder,
            lastSyncedAt: Date.now(),
            trackCount: (parsed.tracks || []).length
        };

        if (connection.group) window.EveAudioflixState?.addMusicGroup?.(connection.group);

        let addedCount = 0;
        const existingMusic = (window.EveAudioflixState?.ensure?.()?.music || []).slice();

        (parsed.tracks || []).forEach((t) => {
            const rawTitle = text(t.title, 'Untitled Track');
            const trackPath = text(t.path);
            const normPath = trackPath.toLowerCase().replace(/\\/g, '/');
            const normTitle = rawTitle.toLowerCase();

            // Match existing track in EveOS library by path or title
            let targetTrack = existingMusic.find((m) => {
                const mPath = String(m.localPath || m.url || '').toLowerCase().replace(/\\/g, '/');
                const mTitle = String(m.title || '').toLowerCase();
                if (normPath && mPath && (mPath === normPath || mPath.endsWith(normPath) || normPath.endsWith(mPath))) return true;
                if (normTitle && mTitle && mTitle === normTitle) return true;
                return false;
            });

            if (targetTrack) {
                // Existing track found: link to WPL connection and attach to WPL Group
                window.EveAudioflixState?.updateItem?.('music', targetTrack.id, {
                    playlistId: connection.id,
                    sourceId: trackPath || targetTrack.sourceId || targetTrack.id
                });
                if (connection.group) {
                    window.EveAudioflixState?.toggleMusicGroup?.(targetTrack.id, connection.group, true);
                }
                addedCount += 1;
            } else {
                // New track: add under targetFolder and attach to WPL Group
                const added = window.EveAudioflixState?.addItem?.('music', {
                    title: rawTitle,
                    url: trackPath,
                    localPath: trackPath,
                    folder: targetFolder,
                    card: targetFolder,
                    isPorted: true
                });

                if (added?.id) {
                    window.EveAudioflixState?.updateItem?.('music', added.id, {
                        sourceId: trackPath,
                        playlistId: connection.id,
                        localPath: trackPath,
                        isPorted: true
                    });
                    if (connection.group) {
                        window.EveAudioflixState?.toggleMusicGroup?.(added.id, connection.group, true);
                    }
                    addedCount += 1;
                }
            }
        });

        saveConnections(connections().concat(connection), 'audioflix-wpl-import');
        return { ok: true, connection, added: addedCount, folder: targetFolder, group: groupTitle };
    }

    // Re-read the upstream playlist and reconcile against what EveOS holds.
    async function syncPlaylist(connectionId, force = true, targetFolder = '') {
        const connection = getConnection(connectionId);
        if (!connection) return { ok: false, reason: 'That playlist connection no longer exists.' };
        const upstream = await fetchUpstream(connection.url, force);
        if (!upstream.ok) return upstream;

        const folderToUse = text(targetFolder) || connection.folder;
        const diff = diffPlaylist(tracksFor(connection.id), upstream.entries || []);
        applyDiff(connection, diff, folderToUse);
        const next = connections().map((entry) => entry.id === connection.id
            ? Object.assign({}, entry, {
                title: text(upstream.title, entry.title),
                playlistId: text(upstream.playlistId, entry.playlistId),
                folder: text(targetFolder) ? text(targetFolder) : entry.folder,
                lastSyncedAt: Date.now(),
                trackCount: (upstream.entries || []).length
            })
            : entry);
        saveConnections(next, 'audioflix-playlist-sync');
        return { ok: true, connection: { ...connection, folder: folderToUse }, added: diff.add.length, restored: diff.restore.length, missing: diff.missing.length };
    }

    // Move a track OUT of the playlist connection but keep it in EveOS (its own folder/group).
    // Used on a greyed track the user wants to hold onto after it left the upstream playlist.
    function detachTrack(trackId, target = {}) {
        if (!trackId) return false;
        const patch = { playlistId: '', upstreamMissing: false };
        if (target.folder !== undefined) patch.folder = text(target.folder);
        window.EveAudioflixState?.updateItem?.('music', trackId, patch);
        if (target.group) window.EveAudioflixState?.toggleMusicGroup?.(trackId, text(target.group), true);
        return true;
    }

    function removeTrack(trackId) {
        if (!trackId) return false;
        window.EveAudioflixState?.removeItem?.('music', trackId);
        return true;
    }

    // Edit where an imported playlist stores its tracks (folder/group), moving existing ones.
    function updateConnection(connectionId, patch = {}) {
        const connection = getConnection(connectionId);
        if (!connection) return false;
        const nextFolder = patch.folder !== undefined ? text(patch.folder, DEFAULT_FOLDER) : connection.folder;
        const nextGroup = patch.group !== undefined ? text(patch.group) : connection.group;
        const tracks = tracksFor(connection.id);
        if (nextFolder !== connection.folder) {
            tracks.forEach((track) => window.EveAudioflixState?.updateItem?.('music', track.id, { folder: nextFolder }));
        }
        if (nextGroup !== connection.group) {
            if (nextGroup) window.EveAudioflixState?.addMusicGroup?.(nextGroup);
            tracks.forEach((track) => {
                if (connection.group) window.EveAudioflixState?.toggleMusicGroup?.(track.id, connection.group, false);
                if (nextGroup) window.EveAudioflixState?.toggleMusicGroup?.(track.id, nextGroup, true);
            });
        }
        saveConnections(connections().map((entry) => entry.id === connection.id
            ? Object.assign({}, entry, { folder: nextFolder, group: nextGroup })
            : entry), 'audioflix-playlist-settings');
        return true;
    }

    // Drop the connection. Tracks are kept by default (just unlinked) so a disconnect never
    // silently deletes a library; pass { removeTracks: true } to clear them out too.
    function removeConnection(connectionId, options = {}) {
        const connection = getConnection(connectionId);
        if (!connection) return false;
        tracksFor(connection.id).forEach((track) => {
            if (options.removeTracks) removeTrack(track.id);
            else window.EveAudioflixState?.updateItem?.('music', track.id, { playlistId: '', upstreamMissing: false });
        });
        saveConnections(connections().filter((entry) => entry.id !== connection.id), 'audioflix-playlist-remove');
        return true;
    }

    // Get connection matching a specific group name
    function getPlaylistForGroup(groupName) {
        const clean = text(groupName);
        if (!clean) return null;
        return connections().find((entry) => text(entry.group) === clean || text(entry.title) === clean) || null;
    }

    // Sync a single playlist by its group name
    async function syncPlaylistByGroup(groupName, force = true, targetFolder = '') {
        const conn = getPlaylistForGroup(groupName);
        if (!conn) return { ok: false, reason: `No live playlist connection found for group "${groupName}".` };
        return syncPlaylist(conn.id, force, targetFolder);
    }

    // Check if a track in an imported group was added locally (not from the upstream playlist source)
    function isLocalTrackInImportedGroup(item) {
        if (!item || !item.id) return false;
        const groups = window.EveAudioflixState?.ensure?.()?.musicGroupMap?.[item.id] || [];
        if (!groups.length) return false;
        const importedConn = connections().find(c => groups.includes(c.group));
        if (!importedConn) return false;
        return !item.sourceId || item.playlistId !== importedConn.id;
    }

    Object.assign(ns, {
        ready: true,
        DEFAULT_FOLDER,
        DEFAULT_WPL_FOLDER,
        diffPlaylist,
        connections,
        getConnection,
        getPlaylistForGroup,
        syncPlaylistByGroup,
        isLocalTrackInImportedGroup,
        tracksFor,
        importPlaylist,
        importWplPlaylist,
        syncPlaylist,
        detachTrack,
        removeTrack,
        updateConnection,
        removeConnection
    });
})();
