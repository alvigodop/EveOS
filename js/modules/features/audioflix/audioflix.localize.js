// Music-library localization for Audioflix: turn online (yt-dlp) tracks into local files and
// re-attach already-localized folders back onto tracks.
//
// A localized track is DUAL-SOURCE: it keeps its online `url` and gains a `localPath`, so playback
// prefers the offline file and falls back to the stream. Scopes: library, folder, group, song.
// importMusicPort extracts a folder's audio into EveOS as new tracks under a FOLDER tag (like a
// soundboard port); reimportMerge instead re-attaches files to existing tracks by title.
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
    // The disk audit lives in a sibling module (see it for the shortcut-vs-physical rules).
    const auditScopeDiskStatus = window.EveAudioflixLocalizeAudit.create({
        S, text, collectScope, getScopeDir: (s, k) => getScopeDir(s, k), extractDir: (p) => extractDir(p)
    });

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
        // Normalize to backslashes (the convention extractDir already uses) so a dir typed with
        // forward slashes can't produce mixed-separator paths that later fail string comparisons.
        const dir = text(newTargetDir).replace(/[/\\]+$/, '').replace(/\//g, '\\');
        if (!dir) return { ok: false, reason: 'Invalid directory path' };
        
        // Read the OLD remembered dir before rememberDir() overwrites it — the legacy-upgrade branch
        // below needs to know where this scope used to point.
        const previousDir = text(state().localizeScopeDirs?.[`${scope}:${key || ''}`]);
        rememberDir(dir, scope, key);
        const items = collectScope(scope, key);
        let updatedCount = 0;

        // Recalibrating ONE scope must only move THAT scope's own entry. A song lives physically in a
        // single place (normally its folder file); the other entries are where a shortcut should sit or
        // where a group keeps its own duplicate copy. The old code rewrote localPath/url for every
        // member, so recalibrating a folder stomped the group's paths (and vice versa) — the
        // "EveOS logic overwrote the songs" case. `linkOf` is never rewritten here: a shortcut's
        // physical target belongs to whichever scope really owns the bytes.
        const scopeSource = `${scope}:${key}`;
        const sameDir = (a, b) => !!a && !!b && extractDir(a).toLowerCase() === String(b).toLowerCase().replace(/[/\\]+$/, '');

        items.forEach((it) => {
            const patch = {};
            const existing = Array.isArray(it.localizations) ? it.localizations : [];
            const owns = existing.some((l) => l.source === scopeSource);
            let next = existing;

            if (owns) {
                next = existing.map((l) => {
                    if (l.source !== scopeSource || !text(l.path)) return l;
                    const fn = text(l.path).replace(/.*[/\\]/, '');
                    return fn ? { ...l, path: `${dir}\\${fn}` } : l;   // keeps kind AND linkOf intact
                });
            } else if (text(it.localPath) && (sameDir(it.localPath, previousDir) || !previousDir)) {
                // Legacy upgrade: a pre-classifier localPath that lived in this scope's old folder
                // becomes a proper entry for this scope, so future recalibrations stay scoped.
                const fn = text(it.localPath).replace(/.*[/\\]/, '');
                if (fn) next = [...existing, { source: scopeSource, path: `${dir}\\${fn}`, kind: 'file', linkOf: '' }];
            }

            if (next !== existing) {
                patch.localizations = next;
                // The effective path is re-derived from class priority, never assumed to be this scope.
                const effective = effectiveLocalPath({ localizations: next, localPath: it.localPath });
                if (effective && effective !== text(it.localPath)) patch.localPath = effective;
                // A local-file `url` follows the physical file only when this scope owns it.
                if (text(it.url) && !isHttp(it.url) && effective) patch.url = effective;
            }

            if (Object.keys(patch).length) {
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
    // `linkOf` (shortcuts only) records the PHYSICAL file the link points at, so the disk sensor can
    // verify the real bytes rather than deciding a shortcut is missing.
    function addLocalization(track, source, path, kind = 'file', linkOf = '') {
        const cleanPath = text(path);
        if (!track?.id || !cleanPath || !source) return;
        const next = (track.localizations || []).filter((l) => l.source !== source);
        next.push(linkOf ? { source, path: cleanPath, kind, linkOf: text(linkOf) } : { source, path: cleanPath, kind });
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

    // Group localization, three ways (class priority always decides playback):
    //   'link'  — reuse: folder copy stays 1st; already-local elsewhere becomes a 3rd-class shortcut
    //             (no second copy on disk); the rest download into the group path (2nd class).
    //   'smart' — no shortcuts: folder copies skipped, every other online song downloads here.
    //   'dup'   — ignore classes: own copy of every song here (folder file still plays first).
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
                // Create a REAL link in the group folder so the shortcut exists on disk too (it used
                // to be EveOS-only, so the group's path looked empty in Explorer). The stored path is
                // the link inside this group; `linkOf` remembers the physical file it points at, which
                // is what keeps the disk sensor from reading it as missing.
                const linked = await N?.linkLocalFile?.(elsewhereFile.path, dir, it.title);
                if (linked?.ok && linked.path) addLocalization(it, source, linked.path, 'shortcut', elsewhereFile.path);
                else addLocalization(it, source, elsewhereFile.path, 'shortcut', elsewhereFile.path);
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
        members.forEach((it) => {
            const locs = (it.localizations && it.localizations.length) ? it.localizations : (it.localPath ? [{ source: `folder:${it.folder || it.card || 'General'}`, path: it.localPath, kind: 'file' }] : []);
            locs.forEach((l) => {
                if (l.source.startsWith('folder:') && l.kind === 'file') firstClass.push({ title: it.title, source: l.source.slice(7), path: l.path });
                else if (l.source === `group:${groupKey}`) groupPaths.push({ title: it.title, kind: l.kind, path: l.path });
                else if (l.path) groupPaths.push({ title: it.title, kind: 'shortcut', path: l.path });
            });
        });
        return { firstClass, groupPaths, groupDir: getScopeDir('group', groupKey) };
    }

    // For the song settings panel: this track's localizations, most-important class first.
    function songLocalizationList(track) {
        return orderedLocs(track).map((l) => ({
            label: l.source.startsWith('folder:') ? `Folder · ${l.source.slice(7)}`
                : l.kind === 'shortcut' ? `Group shortcut · ${l.source.slice(6)}`
                    : l.source.startsWith('group:') ? `Group · ${l.source.slice(6)}` : l.source,
            path: l.path,
            kind: l.kind,
            source: l.source,
            linkOf: text(l.linkOf)
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

    // Music Port (folder -> tracks, sub-folder names -> classifiers, plus folder sync) lives in a
    // sibling module; it shares this module's state primitives.
    const { extractSubfolders, importMusicPort, syncMusicPortFolder } =
        window.EveAudioflixLocalizePort.create({ S, state, text, musicItems, rememberDir, effectiveLocalPath });

    // Point one localization entry at a different file (user edit from the track settings panel).
    // Only that entry moves; the effective localPath is then re-derived from class priority.
    function setLocalizationPath(trackId, source, newPath) {
        const track = musicItems().find((it) => it.id === trackId);
        const clean = text(newPath);
        if (!track || !clean) return { ok: false };
        const next = (track.localizations || []).map((l) => (l.source === source ? { ...l, path: clean } : l));
        if (!next.some((l) => l.source === source)) return { ok: false, reason: 'Unknown localization entry.' };
        S()?.updateItem?.('music', trackId, { localizations: next, localPath: effectiveLocalPath({ localizations: next, localPath: track.localPath }) });
        return { ok: true };
    }

    Object.assign(ns, {
        ready: true,
        setLocalizationPath,
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
        importMusicPort,
        syncMusicPortFolder
    });
})();
