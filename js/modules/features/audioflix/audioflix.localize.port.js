// Music Port: bring a folder tree of audio files into the library as tracks, and keep that folder
// CONNECTED so it can be re-synced later (the same relationship an imported playlist has with its
// source). Sub-folder names under the port root become manual classifiers on the tracks they hold,
// so "Main/Anime/song.mp3" arrives tagged "Anime". Split out of audioflix.localize.js to keep that
// module under the project line cap.
window.EveAudioflixLocalizePort = window.EveAudioflixLocalizePort || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixLocalizePort;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const { S, state, text, paths, musicItems, rememberDir, getScopeDir, effectiveLocalPath } = deps;

        function extractSubfolders(filePath, rootPath) {
            if (!filePath) return [];
            const relative = paths?.relativeTo?.(filePath, rootPath);
            const parts = (relative == null
                ? paths?.relativeAfterFolder?.(filePath, paths?.basename?.(rootPath))
                : paths?.normalize?.(relative).split('/').filter(Boolean)) || [];
            return parts.slice(0, -1).map(text).filter(Boolean);
        }

        function localizationPatch(item, file, folder, classifiers) {
            const source = `folder:${folder}`;
            const current = Array.isArray(item?.localizations) ? item.localizations : [];
            const sourceKey = source.toLowerCase();
            const hasSource = current.some((entry) => text(entry.source).toLowerCase() === sourceKey);
            const localizations = hasSource
                ? current.map((entry) => text(entry.source).toLowerCase() === sourceKey
                    ? { ...entry, source, path: file.path, kind: 'file' }
                    : entry)
                : [...current, { source, path: file.path, kind: 'file' }];
            const localPath = effectiveLocalPath({ ...item, localizations, localPath: file.path }) || file.path;
            return {
                folder,
                card: folder,
                isPorted: true,
                isMusicPort: true,
                localizations,
                localPath,
                missingLocal: false,
                classifiers,
                ...(/^https?:\/\//i.test(text(item?.url)) ? {} : { url: localPath })
            };
        }

        function matchTrack(items, file, roots, targetRoot, usedIds) {
            const available = items.filter((item) => !usedIds.has(item.id));
            const exact = available.filter((item) => (
                [...(paths?.localCandidates?.(item) || []), item.url]
                    .some((candidate) => paths?.same?.(candidate, file.path))
            ));
            if (exact.length === 1) return exact[0];
            const matched = available.filter((item) => (
                paths?.matchScannedFile?.(item, [file], roots, targetRoot)?.path === file.path
            ));
            return matched.length === 1 ? matched[0] : null;
        }

        // Music port: scan a folder and extract all audio files into EveOS as music tracks tagged with a FOLDER (not group).
        // Physical subfolders inside the main folder path automatically become manual classifiers attached to the imported songs.
        async function importMusicPort(folderPath, folderName) {
            const N = window.EveAudioflixNative;
            if (!N?.scanLocalized) return { ok: false, reason: 'Music Port needs the EveOS localhost server running.' };
            const cleanPath = paths?.stripQuotes?.(folderPath) || text(folderPath);
            if (!cleanPath) return { ok: false, reason: 'Please specify a valid folder path.' };
            
            const scan = await N.scanLocalized(cleanPath);
            if (!scan?.ok) return { ok: false, reason: scan?.message || 'Could not scan that folder.' };
            
            const rootDir = scan.dir || cleanPath;
            const defaultFolderName = paths?.basename?.(rootDir) || 'Ported Music';
            const targetFolder = text(folderName) || defaultFolderName;
            
            const files = scan.files || [];
            if (!files.length) return { ok: false, reason: 'No supported audio files found in that folder.' };
            
            rememberDir(rootDir, 'folder', targetFolder);
            const C = window.EveAudioflixClassifiers;
            const allItems = musicItems();
            const usedIds = new Set();
            let addedCount = 0;
            let updatedCount = 0;

            // 1. Extract subfolder names for each file and collect unique classifiers
            const fileClassifiersMap = new Map();
            const allNewClassifiers = new Set();

            files.forEach((f) => {
                const subFolders = extractSubfolders(f.path, rootDir);
                fileClassifiersMap.set(f.path, subFolders);
                subFolders.forEach((cls) => allNewClassifiers.add(cls));
            });

            // 2. Register all new subfolder classifiers in state
            allNewClassifiers.forEach((clsName) => {
                C?.addManual?.(clsName);
            });

            // 3. Ensure targetFolder is NOT created as a group (purge from musicGroups if present)
            S()?.removeMusicGroup?.(targetFolder);

            files.forEach((f) => {
                const rawTitle = f.name.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || f.name;
                const subClassifiers = fileClassifiersMap.get(f.path) || [];
                const targetItems = allItems.filter((item) => (
                    text(item.folder || item.card).toLowerCase() === targetFolder.toLowerCase()
                ));
                const exact = allItems.find((item) => !usedIds.has(item.id) && (
                    [...(paths?.localCandidates?.(item) || []), item.url]
                        .some((candidate) => paths?.same?.(candidate, f.path))
                ));
                const existing = exact || matchTrack(targetItems, f, [rootDir], rootDir, usedIds);

                if (existing) {
                    usedIds.add(existing.id);
                    const mergedClassifiers = [...new Set([...(existing.classifiers || []).map(text), ...subClassifiers])].filter(Boolean);
                    S()?.updateItem?.('music', existing.id, localizationPatch(
                        existing, f, targetFolder, mergedClassifiers
                    ));
                    updatedCount += 1;
                } else {
                    const added = S()?.addItem?.('music', {
                        title: rawTitle,
                        url: f.path,
                        localPath: f.path,
                        localizations: [{ source: `folder:${targetFolder}`, path: f.path, kind: 'file' }],
                        folder: targetFolder,
                        card: targetFolder,
                        isPorted: true,
                        isMusicPort: true,
                        classifiers: subClassifiers
                    });
                    if (added?.id) {
                        usedIds.add(added.id);
                        addedCount += 1;
                    }
                }
            });
            
            const totalProcessed = addedCount + updatedCount;
            const clsCount = allNewClassifiers.size;
            const clsNote = clsCount ? ` with ${clsCount} subfolder classifier${clsCount === 1 ? '' : 's'} (${[...allNewClassifiers].join(', ')})` : '';

            // Save / update connection tracking in state.musicPortConnections
            const currentConns = (state().musicPortConnections || []).slice();
            const existingConnection = currentConns.find((entry) => (
                text(entry.folder).toLowerCase() === targetFolder.toLowerCase()
            ));
            const nextConns = currentConns.filter((entry) => entry !== existingConnection).concat({
                id: existingConnection?.id || `port_${Date.now()}`,
                path: rootDir,
                folder: targetFolder,
                lastSyncedAt: Date.now(),
                trackCount: totalProcessed
            });
            S()?.update?.({ musicPortConnections: nextConns }, 'audioflix-music-port-connections');

            return { 
                ok: true, 
                added: totalProcessed, 
                total: files.length, 
                folder: targetFolder, 
                path: rootDir,
                reason: `Extracted ${totalProcessed} track(s) into folder tag "${targetFolder}"${clsNote}.`
            };
        }

        // Re-scan a Music Ported folder path on disk, adding new tracks & flagging missing ones
        async function syncMusicPortFolder(folderName) {
            const N = window.EveAudioflixNative;
            if (!N?.scanLocalized) return { ok: false, reason: 'Folder sync needs the EveOS localhost server running.' };

            const targetFolder = text(folderName);
            if (!targetFolder) return { ok: false, reason: 'Specify a folder tag to sync.' };

            const conns = state().musicPortConnections || [];
            const conn = conns.find((entry) => (
                text(entry.folder).toLowerCase() === targetFolder.toLowerCase()
            ));
            
            const folderTracks = musicItems().filter((item) => (
                text(item.folder || item.card).toLowerCase() === targetFolder.toLowerCase()
            ));
            const firstLocal = folderTracks.find((item) => text(item.localPath))?.localPath;
            const diskPath = text(conn?.path)
                || text(getScopeDir?.('folder', targetFolder))
                || text(paths?.dirname?.(firstLocal));

            if (!diskPath) return { ok: false, reason: `No disk path registered for folder "${targetFolder}".` };

            const scan = await N.scanLocalized(diskPath);
            if (!scan?.ok) return { ok: false, reason: scan?.message || 'Could not scan folder path.' };

            const rootDir = scan.dir || diskPath;
            const files = scan.files || [];
            rememberDir(rootDir, 'folder', targetFolder);

            const fileClassifiersMap = new Map();
            const allNewClassifiers = new Set();

            files.forEach((f) => {
                const subFolders = extractSubfolders(f.path, rootDir);
                fileClassifiersMap.set(f.path, subFolders);
                subFolders.forEach((cls) => allNewClassifiers.add(cls));
            });

            const C = window.EveAudioflixClassifiers;
            allNewClassifiers.forEach((clsName) => C?.addManual?.(clsName));

            let addedCount = 0;
            let restoredCount = 0;
            let missingCount = 0;
            const matchedIds = new Set();
            const oldRoots = [conn?.path, getScopeDir?.('folder', targetFolder), rootDir].filter(Boolean);

            files.forEach((f) => {
                const rawTitle = f.name.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || f.name;
                const subClassifiers = fileClassifiersMap.get(f.path) || [];
                const existing = matchTrack(folderTracks, f, oldRoots, rootDir, matchedIds);

                if (existing) {
                    matchedIds.add(existing.id);
                    const mergedClassifiers = [...new Set([...(existing.classifiers || []).map(text), ...subClassifiers])].filter(Boolean);
                    const patch = localizationPatch(existing, f, targetFolder, mergedClassifiers);
                    if (existing.missingLocal) {
                        restoredCount += 1;
                    }
                    S()?.updateItem?.('music', existing.id, patch);
                } else {
                    const added = S()?.addItem?.('music', {
                        title: rawTitle,
                        url: f.path,
                        localPath: f.path,
                        localizations: [{ source: `folder:${targetFolder}`, path: f.path, kind: 'file' }],
                        folder: targetFolder,
                        card: targetFolder,
                        isPorted: true,
                        isMusicPort: true,
                        classifiers: subClassifiers
                    });
                    if (added?.id) {
                        matchedIds.add(added.id);
                        addedCount += 1;
                    }
                }
            });

            folderTracks.forEach((it) => {
                const ownsFolderFile = (it.localizations || []).some((entry) => (
                    text(entry.source).toLowerCase() === `folder:${targetFolder}`.toLowerCase()
                    && entry.kind !== 'shortcut'
                ));
                if (!(it.isMusicPort || ownsFolderFile) || matchedIds.has(it.id)) return;
                if (!it.missingLocal) S()?.updateItem?.('music', it.id, { missingLocal: true });
                missingCount += 1;
            });

            const nextConns = (state().musicPortConnections || []).filter((entry) => entry !== conn).concat({
                id: conn?.id || `port_${Date.now()}`,
                path: rootDir,
                folder: targetFolder,
                lastSyncedAt: Date.now(),
                trackCount: files.length
            });
            S()?.update?.({ musicPortConnections: nextConns }, 'audioflix-music-port-sync');

            return {
                ok: true,
                folder: targetFolder,
                path: rootDir,
                added: addedCount,
                restored: restoredCount,
                missing: missingCount,
                totalOnDisk: files.length,
                reason: `Synced "${targetFolder}": +${addedCount} new, ${restoredCount} restored, ${missingCount} missing on disk.`
            };
        }
        return { extractSubfolders, importMusicPort, syncMusicPortFolder };
    };

    ns.ready = true;
})();
