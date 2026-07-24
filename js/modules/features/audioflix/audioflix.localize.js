// Music-library localization for Audioflix: convert online (yt-dlp) tracks into local files, and
// re-attach a folder of already-localized files back onto matching tracks.
//
// A localized track becomes DUAL-SOURCE: it keeps its online `url` and gains a `localPath` (the
// same shape a duplicate merge produces), so playback can prefer the offline file and fall back to
// the stream. Scopes: the whole library, one folder, one group, or a single song. Downloads run
// one at a time server-side; the client loops the scope so the user sees N/total progress.
//
// The reimport "music port" (handlePortAction) scans a chosen folder and matches files to tracks by
// a normalized title — the workflow for restoring localPaths after a datapack move or on a fresh
// machine, where the mp3s exist on disk but the state only has online urls.
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

    // The subset worth downloading: online tracks that don't already have a local file.
    function localizeCandidates(scope, key) {
        return collectScope(scope, key).filter((it) => isHttp(it.url) && !text(it.localPath));
    }

    const lastDir = () => text(state().localizeDir);
    const rememberDir = (dir) => S()?.update?.({ localizeDir: text(dir) }, 'audioflix-localize-dir');

    // Download every candidate in the scope to targetDir, tagging each with its resulting localPath.
    async function localizeScope(scope, key, targetDir, onProgress) {
        const N = window.EveAudioflixNative;
        if (!N?.localizeTrack) return { ok: false, reason: 'Localization needs the EveOS localhost server running.' };
        const dir = text(targetDir);
        if (!dir) return { ok: false, reason: 'No target folder was chosen.' };
        const items = localizeCandidates(scope, key);
        if (!items.length) return { ok: true, done: 0, failed: 0, total: 0, targetDir: dir, note: 'Nothing to localize.' };
        rememberDir(dir);
        let done = 0, failed = 0, lastError = '';
        for (let i = 0; i < items.length; i += 1) {
            const it = items[i];
            onProgress?.({ index: i + 1, total: items.length, title: it.title });
            const res = await N.localizeTrack({ id: it.id, title: it.title, url: it.url }, dir);
            if (res?.ok && res.filePath) { S()?.updateItem?.('music', it.id, { localPath: res.filePath }); done += 1; }
            else { failed += 1; lastError = res?.error || res?.message || 'download failed'; }
        }
        return { ok: done > 0 || failed === 0, done, failed, total: items.length, targetDir: dir, lastError };
    }

    // Scope button (data-af-scope / data-af-key): prompt for a folder, then localize with progress.
    async function handleScopeAction(target, uiCtx) {
        const scope = target?.dataset?.afScope || 'library';
        const key = target?.dataset?.afKey || '';
        const setStatus = (s) => { if (uiCtx) { uiCtx.playbackStatus = s; uiCtx.rerender(); } };
        const candidates = localizeCandidates(scope, key);
        if (!candidates.length) { setStatus('Nothing to localize here (already local, or no online URLs).'); return; }
        let dir = '';
        try { dir = String((await window.showPrompt?.(`Folder on this PC to save ${candidates.length} localized file${candidates.length === 1 ? '' : 's'}:`, lastDir())) || '').trim(); } catch { }
        if (!dir) return;
        setStatus(`Localizing 0/${candidates.length}...`);
        const res = await localizeScope(scope, key, dir, (p) => setStatus(`Localizing ${p.index}/${p.total}: ${p.title}`));
        setStatus(res.ok
            ? `Localized ${res.done}/${res.total} to ${res.targetDir}${res.failed ? ` (${res.failed} failed — ${res.lastError})` : ''}.`
            : (res.reason || 'Localization failed.'));
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

    async function handlePortAction(target, uiCtx) {
        const setStatus = (s) => { if (uiCtx) { uiCtx.playbackStatus = s; uiCtx.rerender(); } };
        let dir = '';
        try { dir = String((await window.showPrompt?.('Folder of localized music files to re-attach by title:', lastDir())) || '').trim(); } catch { }
        if (!dir) return;
        setStatus('Scanning localized folder...');
        const res = await reimportMerge(dir);
        setStatus(res.ok ? `Re-attached ${res.matched} of ${res.scanned} file(s) to matching tracks.` : (res.reason || 'Reimport failed.'));
    }

    Object.assign(ns, {
        ready: true,
        lastDir,
        collectScope,
        localizeCandidates,
        localizeScope,
        handleScopeAction,
        reimportMerge,
        importMusicPort,
        handlePortAction
    });
})();
