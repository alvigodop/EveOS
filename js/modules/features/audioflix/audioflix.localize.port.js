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
        const { S, state, text, musicItems, rememberDir, effectiveLocalPath } = deps;

        function extractSubfolders(filePath, rootPath) {
            if (!filePath) return [];
            const normFile = String(filePath).replace(/\\/g, '/');
            const normRoot = String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');

            const fileLower = normFile.toLowerCase();
            const rootLower = normRoot.toLowerCase();

            let relPath = '';
            if (rootLower && fileLower.startsWith(rootLower + '/')) {
                relPath = normFile.slice(normRoot.length + 1);
            } else {
                const parts = normFile.split('/').filter(Boolean);
                if (parts.length > 1) {
                    const dirParts = parts.slice(0, -1);
                    const rootName = normRoot.split('/').filter(Boolean).pop()?.toLowerCase();
                    const rootIdx = rootName ? dirParts.findIndex(p => p.toLowerCase() === rootName) : -1;
                    if (rootIdx !== -1 && rootIdx < dirParts.length - 1) {
                        return dirParts.slice(rootIdx + 1).map(text).filter(Boolean);
                    }
                    return [dirParts[dirParts.length - 1]].map(text).filter(Boolean);
                }
                return [];
            }

            const parts = relPath.split('/').filter(Boolean);
            return parts.slice(0, -1).map(text).filter(Boolean);
        }

        // Music port: scan a folder and extract all audio files into EveOS as music tracks tagged with a FOLDER (not group).
        // Physical subfolders inside the main folder path automatically become manual classifiers attached to the imported songs.
        async function importMusicPort(folderPath, folderName) {
            const N = window.EveAudioflixNative;
            if (!N?.scanLocalized) return { ok: false, reason: 'Music Port needs the EveOS localhost server running.' };
            const cleanPath = text(folderPath);
            if (!cleanPath) return { ok: false, reason: 'Please specify a valid folder path.' };
            
            const scan = await N.scanLocalized(cleanPath);
            if (!scan?.ok) return { ok: false, reason: scan?.message || 'Could not scan that folder.' };
            
            const rootDir = scan.dir || cleanPath;
            const pathParts = rootDir.replace(/\\/g, '/').split('/').filter(Boolean);
            const defaultFolderName = pathParts[pathParts.length - 1] || 'Ported Music';
            const targetFolder = text(folderName, defaultFolderName);
            
            const files = scan.files || [];
            if (!files.length) return { ok: false, reason: 'No supported audio files found in that folder.' };
            
            rememberDir(cleanPath);
            const C = window.EveAudioflixClassifiers;
            const allItems = musicItems();
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
                const normFilePath = String(f.path).trim();

                const existing = allItems.find((it) => 
                    (it.localPath && String(it.localPath).trim().toLowerCase() === normFilePath.toLowerCase()) ||
                    (it.url && String(it.url).trim().toLowerCase() === normFilePath.toLowerCase())
                );

                if (existing) {
                    const mergedClassifiers = [...new Set([...(existing.classifiers || []).map(text), ...subClassifiers])].filter(Boolean);
                    S()?.updateItem?.('music', existing.id, {
                        folder: targetFolder,
                        card: targetFolder,
                        isPorted: true,
                        isMusicPort: true,
                        localPath: f.path,
                        classifiers: mergedClassifiers
                    });
                    updatedCount += 1;
                } else {
                    const added = S()?.addItem?.('music', {
                        title: rawTitle,
                        url: f.path,
                        localPath: f.path,
                        folder: targetFolder,
                        card: targetFolder,
                        isPorted: true,
                        isMusicPort: true,
                        classifiers: subClassifiers
                    });
                    if (added?.id) {
                        addedCount += 1;
                    }
                }
            });
            
            const totalProcessed = addedCount + updatedCount;
            const clsCount = allNewClassifiers.size;
            const clsNote = clsCount ? ` with ${clsCount} subfolder classifier${clsCount === 1 ? '' : 's'} (${[...allNewClassifiers].join(', ')})` : '';

            // Save / update connection tracking in state.musicPortConnections
            const currentConns = (state().musicPortConnections || []).slice();
            const nextConns = currentConns.filter(c => c.folder !== targetFolder).concat({
                id: `port_${Date.now()}`,
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
            const conn = conns.find(c => c.folder === targetFolder);
            
            const folderTracks = musicItems().filter(it => text(it.folder || it.card) === targetFolder);
            const diskPath = conn?.path || getScopeDir('folder', targetFolder) || folderTracks.find(it => it.localPath)?.localPath;

            if (!diskPath) return { ok: false, reason: `No disk path registered for folder "${targetFolder}".` };

            const scan = await N.scanLocalized(diskPath);
            if (!scan?.ok) return { ok: false, reason: scan?.message || 'Could not scan folder path.' };

            const rootDir = scan.dir || diskPath;
            const files = scan.files || [];

            const fileClassifiersMap = new Map();
            const allNewClassifiers = new Set();

            files.forEach((f) => {
                const subFolders = extractSubfolders(f.path, rootDir);
                fileClassifiersMap.set(f.path, subFolders);
                subFolders.forEach((cls) => allNewClassifiers.add(cls));
            });

            const C = window.EveAudioflixClassifiers;
            allNewClassifiers.forEach((clsName) => C?.addManual?.(clsName));

            const scannedPathSet = new Set(files.map(f => String(f.path).trim().toLowerCase()));

            let addedCount = 0;
            let restoredCount = 0;
            let missingCount = 0;

            files.forEach((f) => {
                const rawTitle = f.name.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || f.name;
                const subClassifiers = fileClassifiersMap.get(f.path) || [];
                const normFilePath = String(f.path).trim().toLowerCase();

                const existing = folderTracks.find((it) => 
                    (it.localPath && String(it.localPath).trim().toLowerCase() === normFilePath) ||
                    (it.url && String(it.url).trim().toLowerCase() === normFilePath)
                );

                if (existing) {
                    const mergedClassifiers = [...new Set([...(existing.classifiers || []).map(text), ...subClassifiers])].filter(Boolean);
                    const patch = {
                        folder: targetFolder,
                        card: targetFolder,
                        isPorted: true,
                        localPath: f.path,
                        classifiers: mergedClassifiers
                    };
                    if (existing.missingLocal) {
                        patch.missingLocal = false;
                        restoredCount += 1;
                    }
                    S()?.updateItem?.('music', existing.id, patch);
                } else {
                    const added = S()?.addItem?.('music', {
                        title: rawTitle,
                        url: f.path,
                        localPath: f.path,
                        folder: targetFolder,
                        card: targetFolder,
                        isPorted: true,
                        isMusicPort: true,
                        classifiers: subClassifiers
                    });
                    if (added?.id) addedCount += 1;
                }
            });

            folderTracks.forEach((it) => {
                const localP = String(it.localPath || it.url || '').trim().toLowerCase();
                if (localP && !scannedPathSet.has(localP)) {
                    if (!it.missingLocal) {
                        S()?.updateItem?.('music', it.id, { missingLocal: true });
                        missingCount += 1;
                    }
                }
            });

            const nextConns = (state().musicPortConnections || []).filter(c => c.folder !== targetFolder).concat({
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
