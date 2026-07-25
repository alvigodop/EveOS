// WPL (Windows Media Player playlist) connections for the Audioflix music library.
//
// A .wpl is a local XML file rather than a web playlist, so it cannot go through the YouTube
// lister the way an imported URL playlist does — importing AND re-syncing both mean re-reading
// the file from disk. Everything else matches the URL-playlist contract: the connection stays
// live, tracks already in the library are linked rather than duplicated, and a track that has
// left the file is greyed (upstreamMissing) instead of deleted.
//
// Split out of audioflix.playlists.js to keep that file under the project line cap.
window.EveAudioflixPlaylistsWpl = window.EveAudioflixPlaylistsWpl || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixPlaylistsWpl;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const { text, newId, connections, saveConnections, tracksFor, DEFAULT_WPL_FOLDER } = deps;

        const S = () => window.EveAudioflixState;
        const norm = (value) => String(value || '').trim().toLowerCase().replace(/\\/g, '/');

        // Turn whatever the user handed us (raw XML, a path, a pre-parsed object) into a parse result.
        async function readWplSource(wplInput, wplPath) {
            const parser = window.EveAudioflixWpl;
            const N = window.EveAudioflixNative;
            if (wplInput && typeof wplInput === 'object' && wplInput.tracks) return wplInput;

            const clean = text(wplInput);
            if (!clean) return { ok: false, reason: 'Please specify a WPL playlist file path or content.' };

            if (clean.includes('<smil') || clean.includes('<seq') || clean.includes('<?wpl') || clean.includes('<media')) {
                return parser?.parseWplXml?.(clean, text(wplPath));
            }
            if (N?.readWplFile) {
                const readRes = await N.readWplFile(clean);
                if (readRes?.ok && readRes.content) return parser?.parseWplXml?.(readRes.content, readRes.path || clean);
                return {
                    ok: false,
                    reason: `Could not read WPL file from disk (${readRes?.message || 'EveOS server offline'}). Start an EveOS server (start-server.bat) or use "📂 Browse File" to pick your .wpl file directly!`
                };
            }
            return parser ? parser.parseWplXml(clean, clean) : { ok: false, reason: 'WPL parser unavailable.' };
        }

        // Link every track the file lists (matching one already in the library where possible),
        // then grey anything still bound to this connection that the file no longer mentions.
        function reconcileTracks(connection, parsed, targetFolder) {
            const linkedIds = new Set();
            let added = 0;
            const existingMusic = (S()?.ensure?.()?.music || []).slice();

            (parsed.tracks || []).forEach((t) => {
                const rawTitle = text(t.title, 'Untitled Track');
                const trackPath = text(t.path);
                const normPath = norm(trackPath);
                const normTitle = rawTitle.toLowerCase();

                const targetTrack = existingMusic.find((m) => {
                    const mPath = norm(m.localPath || m.url);
                    const mTitle = String(m.title || '').toLowerCase();
                    if (normPath && mPath && (mPath === normPath || mPath.endsWith(normPath) || normPath.endsWith(mPath))) return true;
                    return !!(normTitle && mTitle && mTitle === normTitle);
                });

                if (targetTrack) {
                    S()?.updateItem?.('music', targetTrack.id, {
                        playlistId: connection.id,
                        sourceId: trackPath || targetTrack.sourceId || targetTrack.id,
                        upstreamMissing: false
                    });
                    if (connection.group) S()?.toggleMusicGroup?.(targetTrack.id, connection.group, true);
                    linkedIds.add(targetTrack.id);
                    added += 1;
                    return;
                }

                const created = S()?.addItem?.('music', {
                    title: rawTitle, url: trackPath, localPath: trackPath,
                    folder: targetFolder, card: targetFolder, isPorted: true
                });
                if (!created?.id) return;
                S()?.updateItem?.('music', created.id, {
                    sourceId: trackPath, playlistId: connection.id, localPath: trackPath,
                    isPorted: true, upstreamMissing: false
                });
                if (connection.group) S()?.toggleMusicGroup?.(created.id, connection.group, true);
                linkedIds.add(created.id);
                added += 1;
            });

            // Greyed, not gone — same rule the URL playlists follow.
            const missing = tracksFor(connection.id).filter((track) => !linkedIds.has(track.id));
            missing.forEach((track) => S()?.updateItem?.('music', track.id, { upstreamMissing: true }));
            return { added, missing: missing.length };
        }

        async function importWplPlaylist(wplInput, options = {}) {
            const parsed = await readWplSource(wplInput, options.wplPath);
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
            if (connection.group) S()?.addMusicGroup?.(connection.group);

            const result = reconcileTracks(connection, parsed, targetFolder);
            saveConnections(connections().concat(connection), 'audioflix-wpl-import');
            return { ok: true, connection, added: result.added, folder: targetFolder, group: groupTitle };
        }

        // Re-read the .wpl at the connection's stored path. If that path is stale the user can
        // correct it from the Groups panel (Edit link) rather than re-importing from scratch.
        async function syncWplPlaylist(connection, targetFolder = '') {
            const source = text(connection.url);
            if (!source || source === 'wpl://local') {
                return { ok: false, reason: 'This WPL playlist has no file path saved. Use "Edit link" in Groups to point it at the .wpl file.' };
            }
            const parsed = await readWplSource(source, source);
            if (!parsed || !parsed.ok) return { ok: false, reason: parsed?.reason || `Could not re-read "${source}".` };

            const folderToUse = text(targetFolder) || text(connection.folder, DEFAULT_WPL_FOLDER);
            const result = reconcileTracks(connection, parsed, folderToUse);
            saveConnections(connections().map((entry) => entry.id === connection.id
                ? Object.assign({}, entry, {
                    url: parsed.wplPath || entry.url,
                    folder: folderToUse,
                    lastSyncedAt: Date.now(),
                    trackCount: (parsed.tracks || []).length
                })
                : entry), 'audioflix-wpl-sync');
            return { ok: true, connection: { ...connection, folder: folderToUse }, added: result.added, restored: 0, missing: result.missing };
        }

        return { importWplPlaylist, syncWplPlaylist };
    };

    ns.ready = true;
})();
