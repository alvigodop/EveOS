// Music-library localization for Audioflix: convert online (yt-dlp) tracks into local files, and
// re-attach a folder of already-localized files back onto matching tracks.
//
// A localized track becomes DUAL-SOURCE: it keeps its online `url` and gains a `localPath` (the
// same shape a duplicate merge produces), so playback can prefer the offline file and fall back to
// the stream. Scopes: the whole library, one folder, one group, or a single song. Downloads run
// one at a time server-side; the client loops the scope so the user sees N/total progress.
//
// The "music port" (importMusicPort) scans a chosen folder and extracts its audio files into EveOS
// as new tracks under a FOLDER tag — the same way the soundboard ports a folder (not a group like an
// imported playlist). reimportMerge is the lighter variant: re-attach files to existing tracks by
// title (restoring localPaths after a datapack move) rather than adding new ones.
window.EveAudioflixLocalize = window.EveAudioflixLocalize || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixLocalize;
    if (ns.ready) return;

    const S = () => window.EveAudioflixState;
    const state = () => S()?.ensure?.() || {};
    const text = (v) => String(v ?? '').trim();
    const isHttp = (u) => /^https?:\/\//i.test(text(u));
    // Loose title key: lowercase, drop a trailing file extension, collapse non-alphanumerics.
    const normTitle = (v) => text(v).toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

    const musicItems = () => state().music || [];

    // All music items in a scope: 'library' (all), 'folder', 'group', or 'song' (one id).
    function collectScope(scope, key) {
        const all = musicItems();
        if (scope === 'song') return all.filter((it) => it.id === key);
        if (scope === 'folder') return all.filter((it) => text(it.folder || it.card) === text(key));
        if (scope === 'group') {
            const map = state().musicGroupMap || {};
            return all.filter((it) => (map[it.id] || []).includes(text(key)));
        }
        return all;
    }

    // The subset worth downloading: online tracks lacking a local file (or marked missing on disk).
    // `force` also re-includes tracks that already have a localPath — the relocalize path for when
    // the local copy was deleted or you want a fresh download (the server overwrites).
    function localizeCandidates(scope, key, force = false) {
        return collectScope(scope, key).filter((it) => (isHttp(it.url) || Boolean(it.localPath)) && (force || !text(it.localPath) || it.missingLocal === true));
    }

    // Counts the localize form needs: online tracks in scope, how many are not-yet-local or missing on disk.
    function scopeStats(scope, key) {
        const items = collectScope(scope, key);
        const online = items.filter((it) => isHttp(it.url) || Boolean(it.localPath));
        const missingLocalCount = online.filter((it) => it.missingLocal === true).length;
        const notLocal = online.filter((it) => !text(it.localPath) || it.missingLocal === true).length;
        const alreadyLocal = online.length - notLocal;
        return { online: online.length, notLocal, alreadyLocal, missingLocal: missingLocalCount };
    }

    // Audit local PC disk status for a scope using scanLocalized.
    async function auditScopeDiskStatus(scope, key) {
        const targetDir = getScopeDir(scope, key);
        const items = collectScope(scope, key);
        if (!targetDir || !items.length) return { ok: true, checked: 0, missing: 0 };

        const N = window.EveAudioflixNative;
        let existingFiles = new Set();
        if (N?.scanLocalized) {
            try {
                const scan = await N.scanLocalized(targetDir);
                if (scan?.ok && Array.isArray(scan.files)) {
                    scan.files.forEach((f) => {
                        if (f.name) existingFiles.add(f.name.toLowerCase());
                        if (f.path) existingFiles.add(f.path.toLowerCase().replace(/\\/g, '/'));
                    });
                }
            } catch {}
        }

        let checked = 0, missing = 0;
        items.forEach((it) => {
            if (text(it.localPath)) {
                checked += 1;
                const filename = text(it.localPath).replace(/.*[/\\]/, '').toLowerCase();
                const normPath = text(it.localPath).toLowerCase().replace(/\\/g, '/');
                const exists = existingFiles.has(filename) || existingFiles.has(normPath);
                if (!exists) {
                    S()?.updateItem?.('music', it.id, { missingLocal: true });
                    missing += 1;
                } else {
                    if (it.missingLocal) S()?.updateItem?.('music', it.id, { missingLocal: false });
                }
            }
        });

        return { ok: true, checked, missing, targetDir };
    }

    function extractDir(filePath) {
        const p = text(filePath).replace(/\\/g, '/');
        const idx = p.lastIndexOf('/');
        if (idx <= 0) return '';
        return p.substring(0, idx).replace(/\//g, '\\');
    }

    const lastDir = () => text(state().localizeDir);
    const rememberDir = (dir, scope = 'library', key = '') => {
        const clean = text(dir);
        if (!clean) return;
        const scopeKey = `${scope}:${key || ''}`;
        const scopeDirs = { ...(state().localizeScopeDirs || {}), [scopeKey]: clean };
        S()?.update?.({ localizeDir: clean, localizeScopeDirs: scopeDirs }, 'audioflix-localize-dir');
    };

    function getScopeDir(scope = 'library', key = '') {
        const scopeKey = `${scope}:${key || ''}`;
        const savedScopeDir = text(state().localizeScopeDirs?.[scopeKey]);
        if (savedScopeDir) return savedScopeDir;

        const items = collectScope(scope, key);
        const withLocal = items.find((it) => text(it.localPath));
        if (withLocal) {
            const derived = extractDir(withLocal.localPath);
            if (derived) return derived;
        }
        return lastDir();
    }

    // Batch-update target directory for a scope (e.g. folder or group) and migrate localPaths for all member tracks.
    function updateScopeDir(scope, key, newTargetDir) {
        const dir = text(newTargetDir).replace(/[/\\]+$/, '');
        if (!dir) return { ok: false, reason: 'Invalid directory path' };
        
        rememberDir(dir, scope, key);
        const items = collectScope(scope, key);
        let updatedCount = 0;

        items.forEach((it) => {
            let hasChange = false;
            const patch = {};
            if (text(it.localPath)) {
                const filename = text(it.localPath).replace(/.*[/\\]/, '');
                if (filename) {
                    const newPath = `${dir}\\${filename}`;
                    if (text(it.localPath) !== newPath) {
                        patch.localPath = newPath;
                        hasChange = true;
                    }
                }
            }
            if (text(it.url) && !isHttp(it.url)) {
                const filename = text(it.url).replace(/.*[/\\]/, '');
                if (filename) {
                    const newUrl = `${dir}\\${filename}`;
                    if (text(it.url) !== newUrl) {
                        patch.url = newUrl;
                        hasChange = true;
                    }
                }
            }
            // Keep the class-based localizations for THIS scope in sync with the new dir, or the
            // effective path (which prefers localizations) would keep resolving to the old folder.
            const scopeSource = `${scope}:${key}`;
            if (Array.isArray(it.localizations) && it.localizations.some((l) => l.source === scopeSource && l.kind === 'file')) {
                patch.localizations = it.localizations.map((l) => {
                    if (l.source !== scopeSource || l.kind !== 'file' || !text(l.path)) return l;
                    const fn = text(l.path).replace(/.*[/\\]/, '');
                    return fn ? { ...l, path: `${dir}\\${fn}` } : l;
                });
                patch.localPath = effectiveLocalPath({ localizations: patch.localizations, localPath: patch.localPath || it.localPath });
                hasChange = true;
            }
            if (hasChange) {
                S()?.updateItem?.('music', it.id, patch);
                updatedCount += 1;
            }
        });

        return { ok: true, updatedCount, total: items.length, targetDir: dir };
    }

    // Recalibrate/re-link local file paths for a scope to targetDir without downloading from online URLs.
    async function recalibrateScopePath(scope, key, targetDir) {
        const dir = text(targetDir).replace(/[/\\]+$/, '');
        if (!dir) return { ok: false, reason: 'No target folder path provided.' };

        const migration = updateScopeDir(scope, key, dir);
        let scannedMatches = 0;

        const N = window.EveAudioflixNative;
        if (N?.scanLocalized) {
            try {
                const scan = await N.scanLocalized(dir);
                if (scan?.ok && Array.isArray(scan.files)) {
                    const byName = new Map();
                    scan.files.forEach((f) => {
                        if (f.name && f.path) byName.set(f.name.toLowerCase(), f.path);
                    });
                    const items = collectScope(scope, key);
                    items.forEach((it) => {
                        let filename = text(it.localPath).replace(/.*[/\\]/, '');
                        if (!filename && text(it.url)) filename = text(it.url).replace(/.*[/\\]/, '');
                        if (filename && byName.has(filename.toLowerCase())) {
                            const matchPath = byName.get(filename.toLowerCase());
                            S()?.updateItem?.('music', it.id, {
                                localPath: matchPath,
                                ...(isHttp(it.url) ? {} : { url: matchPath })
                            });
                            scannedMatches += 1;
                        }
                    });
                }
            } catch {}
        }

        return {
            ok: true,
            recalibrated: Math.max(migration.updatedCount, scannedMatches),
            total: migration.total,
            targetDir: dir
        };
    }

    // --- Localization class model -------------------------------------------------------------
    // A track can be localized under several scopes at once. Its EFFECTIVE local file is picked by
    // class priority: 1st = a folder file, 3rd = a group shortcut (a reference to a file localized
    // elsewhere, so we never duplicate it), 2nd/dup = a group's own file. localPath is kept in sync
    // with the winner so playback (audio.js -> getLocalFileUrl) needs no change.
    const locClass = (l) => (l.source.startsWith('folder:') && l.kind === 'file') ? 0
        : (l.source.startsWith('group:') && l.kind === 'shortcut') ? 1
            : (l.source.startsWith('group:') && l.kind === 'file') ? 2 : 3;
    const orderedLocs = (track) => [...(track.localizations || [])].filter((l) => text(l.path)).sort((a, b) => locClass(a) - locClass(b));
    function effectiveLocalPath(track) {
        const ordered = orderedLocs(track);
        return ordered.length ? ordered[0].path : text(track?.localPath);
    }
    // Add/replace a track's localization for one source, then refresh its effective localPath.
    function addLocalization(track, source, path, kind = 'file') {
        const cleanPath = text(path);
        if (!track?.id || !cleanPath || !source) return;
        const next = (track.localizations || []).filter((l) => l.source !== source);
        next.push({ source, path: cleanPath, kind });
        S()?.updateItem?.('music', track.id, { localizations: next, localPath: effectiveLocalPath({ localizations: next, localPath: track.localPath }) });
    }
    // library/song localize attributes to the track's own folder (so it counts as 1st class) or a
    // manual tag; folder/group scopes map straight through.
    function sourceForScope(scope, key, track) {
        if (scope === 'folder') return `folder:${key}`;
        if (scope === 'group') return `group:${key}`;
        const folder = text(track.folder || track.card);
        return folder ? `folder:${folder}` : `manual:${track.id}`;
    }

    async function downloadInto(N, it, dir) {
        const res = await N.localizeTrack({ id: it.id, title: it.title, url: it.url }, dir);
        return (res?.ok && res.filePath) ? { ok: true, path: res.filePath } : { ok: false, error: res?.error || res?.message || 'download failed' };
    }

    // Group localization, three ways (all keep the class priority intact when resolving playback):
    //   'link'  — reuse: a folder-localized song keeps its folder file (1st class, skipped); a song
    //             already localized anywhere ELSE gets a shortcut into this group (3rd class, so no
    //             second copy on disk); anything left downloads into the group path (2nd class).
    //   'smart' — class-aware but no shortcuts: folder-localized songs are skipped (their folder copy
    //             stays primary); every other online song downloads into this group's path.
    //   'dup'   — ignore classes: every online song gets its own copy in the group path, so the track
    //             ends up with two real physical locations (the folder file still plays first).
    async function localizeGroup(groupKey, dir, onProgress, mode = 'link') {
        const N = window.EveAudioflixNative;
        const source = `group:${groupKey}`;
        const members = collectScope('group', groupKey);
        let done = 0, shortcut = 0, skipped = 0, failed = 0, lastError = '';
        for (let i = 0; i < members.length; i += 1) {
            const it = members[i];
            onProgress?.({ index: i + 1, total: members.length, title: it.title });
            const folderFile = (it.localizations || []).find((l) => l.source.startsWith('folder:') && l.kind === 'file' && text(l.path));
            // A real file this track already has somewhere else (another group, or a legacy localPath).
            const elsewhereFile = (it.localizations || []).find((l) => l.kind === 'file' && text(l.path) && l.source !== source)
                || (text(it.localPath) ? { path: it.localPath } : null);
            if (mode !== 'dup' && folderFile) { skipped += 1; continue; }        // 1st class stays primary
            if (mode === 'link' && elsewhereFile) {                              // 3rd class: reference it
                addLocalization(it, source, elsewhereFile.path, 'shortcut');
                shortcut += 1;
                continue;
            }
            if (!isHttp(it.url)) { skipped += 1; continue; }
            const dl = await downloadInto(N, it, dir);
            if (dl.ok) { addLocalization(it, source, dl.path, 'file'); done += 1; }
            else { failed += 1; lastError = dl.error; }
        }
        return { ok: failed === 0 || done + shortcut > 0, done, shortcut, skipped, failed, total: members.length, targetDir: dir, mode, lastError };
    }

    // Download every candidate in the scope to targetDir, tagging each with a scope-appropriate
    // localization. `force` re-downloads already-local tracks (relocalize). Group scope dispatches
    // to the class-aware path (`mode`).
    async function localizeScope(scope, key, targetDir, onProgress, force = false, mode = 'link') {
        const N = window.EveAudioflixNative;
        if (!N?.localizeTrack) return { ok: false, reason: 'Localization needs the EveOS localhost server running.' };
        const dir = text(targetDir);
        if (!dir) return { ok: false, reason: 'No target folder was chosen.' };
        updateScopeDir(scope, key, dir);
        if (scope === 'group') return localizeGroup(key, dir, onProgress, mode);
        const items = localizeCandidates(scope, key, force);
        if (!items.length) return { ok: true, done: 0, failed: 0, total: 0, targetDir: dir, note: 'Nothing to localize.' };
        let done = 0, failed = 0, lastError = '';
        for (let i = 0; i < items.length; i += 1) {
            const it = items[i];
            onProgress?.({ index: i + 1, total: items.length, title: it.title });
            const dl = await downloadInto(N, it, dir);
            if (dl.ok) { addLocalization(it, sourceForScope(scope, key, it), dl.path, 'file'); done += 1; }
            else { failed += 1; lastError = dl.error; }
        }
        return { ok: done > 0 || failed === 0, done, failed, total: items.length, targetDir: dir, lastError };
    }

    // For a group's "view paths" popover: 1st-class folder files of its members + the group's own
    // files/shortcuts, plus the group's remembered directory.
    function groupLocalizationPaths(groupKey) {
        const members = collectScope('group', groupKey);
        const firstClass = [], groupPaths = [];
        members.forEach((it) => (it.localizations || []).forEach((l) => {
            if (l.source.startsWith('folder:') && l.kind === 'file') firstClass.push({ title: it.title, source: l.source.slice(7), path: l.path });
            else if (l.source === `group:${groupKey}`) groupPaths.push({ title: it.title, kind: l.kind, path: l.path });
        }));
        return { firstClass, groupPaths, groupDir: getScopeDir('group', groupKey) };
    }

    // For the song settings panel: this track's localizations, most-important class first.
    function songLocalizationList(track) {
        return orderedLocs(track).map((l) => ({
            label: l.source.startsWith('folder:') ? `Folder · ${l.source.slice(7)}`
                : l.kind === 'shortcut' ? `Group shortcut · ${l.source.slice(6)}`
                    : l.source.startsWith('group:') ? `Group · ${l.source.slice(6)}` : l.source,
            path: l.path,
            kind: l.kind
        }));
    }

    // Music port: scan a folder and re-attach files to tracks by title, restoring localPath.
    async function reimportMerge(dir) {
        const N = window.EveAudioflixNative;
        if (!N?.scanLocalized) return { ok: false, reason: 'Reimport needs the EveOS localhost server running.' };
        const scan = await N.scanLocalized(dir);
        if (!scan?.ok) return { ok: false, reason: scan?.message || 'Could not read that folder.' };
        const byTitle = new Map();
        musicItems().forEach((it) => { const k = normTitle(it.title); if (k && !byTitle.has(k)) byTitle.set(k, it); });
        let matched = 0;
        (scan.files || []).forEach((f) => {
            const it = byTitle.get(normTitle(f.name));
            if (it && f.path && text(it.localPath) !== f.path) { S()?.updateItem?.('music', it.id, { localPath: f.path }); matched += 1; }
        });
        return { ok: true, matched, scanned: (scan.files || []).length, dir: scan.dir };
    }

    // Music port: scan a folder and extract all audio files into EveOS as music tracks tagged with a FOLDER (not group).
    async function importMusicPort(folderPath, folderName) {
        const N = window.EveAudioflixNative;
        if (!N?.scanLocalized) return { ok: false, reason: 'Music Port needs the EveOS localhost server running.' };
        const cleanPath = text(folderPath);
        if (!cleanPath) return { ok: false, reason: 'Please specify a valid folder path.' };
        
        const scan = await N.scanLocalized(cleanPath);
        if (!scan?.ok) return { ok: false, reason: scan?.message || 'Could not scan that folder.' };
        
        const pathParts = cleanPath.replace(/\\/g, '/').split('/').filter(Boolean);
        const defaultFolderName = pathParts[pathParts.length - 1] || 'Ported Music';
        const targetFolder = text(folderName, defaultFolderName);
        
        const files = scan.files || [];
        if (!files.length) return { ok: false, reason: 'No supported audio files found in that folder.' };
        
        rememberDir(cleanPath);
        let addedCount = 0;
        files.forEach((f) => {
            const rawTitle = f.name.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || f.name;
            const added = S()?.addItem?.('music', {
                title: rawTitle,
                url: f.path,
                folder: targetFolder,
                card: targetFolder
            });
            if (added?.id) {
                S()?.updateItem?.('music', added.id, {
                    localPath: f.path
                });
                addedCount += 1;
            }
        });
        
        return { ok: true, added: addedCount, total: files.length, folder: targetFolder, path: cleanPath };
    }

    Object.assign(ns, {
        ready: true,
        lastDir,
        getScopeDir,
        updateScopeDir,
        recalibrateScopePath,
        auditScopeDiskStatus,
        collectScope,
        localizeCandidates,
        scopeStats,
        effectiveLocalPath,
        localizeScope,
        localizeGroup,
        groupLocalizationPaths,
        songLocalizationList,
        reimportMerge,
        importMusicPort
    });
})();
