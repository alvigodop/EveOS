// Disk-status audit for Audioflix localization: for each track in a scope, verify that a physical
// file it claims really exists and flag/clear `missingLocal`. Split out of audioflix.localize.js to
// keep that module under the project line cap.
//
// The subtlety this exists for: a 3rd-class SHORTCUT keeps its real bytes in whichever folder first
// localized the song, so checking only the current scope folder made every shortcut read as
// "missing". Each localization is therefore verified against its own directory, and a shortcut is
// verified through its `linkOf` target.
window.EveAudioflixLocalizeAudit = window.EveAudioflixLocalizeAudit || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixLocalizeAudit;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const { S, text, paths, collectScope, getScopeDir, extractDir } = deps;

        async function auditScopeDiskStatus(scope, key) {
            const targetDir = getScopeDir(scope, key);
            const items = collectScope(scope, key);
            if (!targetDir || !items.length) return { ok: true, checked: 0, missing: 0 };

            const N = window.EveAudioflixNative;
            const indexFiles = (files) => {
                const index = { paths: new Set(), names: new Set() };
                (Array.isArray(files) ? files : []).forEach((file) => {
                    if (file?.path) index.paths.add(paths?.key?.(file.path) || text(file.path).toLowerCase());
                    const name = text(file?.fileName || paths?.basename?.(file?.path)).toLowerCase();
                    if (name) index.names.add(name);
                });
                return index;
            };
            let targetFiles = indexFiles([]);
            try {
                const scan = await N?.scanLocalized?.(targetDir);
                if (scan?.ok) targetFiles = indexFiles(scan.files);
            } catch {}

            let checked = 0, missing = 0, shortcuts = 0;
            // PRESENT if any physical file the track claims really exists. Checking only `localPath`
            // against this one folder is what made shortcuts read as missing: their real bytes live in
            // the folder that first localized them, so a shortcut is verified via its `linkOf` target.
            const presentIn = (dirFiles, p) => {
                const clean = text(p);
                if (!clean) return false;
                const filename = text(paths?.basename?.(clean)).toLowerCase();
                const pathKey = paths?.key?.(clean) || clean.toLowerCase().replace(/\\/g, '/');
                return dirFiles.paths.has(pathKey) || dirFiles.names.has(filename);
            };
            const targetKey = paths?.key?.(targetDir) || String(targetDir).toLowerCase();
            const dirCache = new Map([[targetKey, targetFiles]]);
            const filesFor = async (dir) => {
                const key = paths?.key?.(dir) || String(dir || '').toLowerCase();
                if (!key) return indexFiles([]);
                if (dirCache.has(key)) return dirCache.get(key);
                let index = indexFiles([]);
                try {
                    const scan = await N?.scanLocalized?.(dir);
                    if (scan?.ok) index = indexFiles(scan.files);
                } catch { /* unreachable folder -> treated as empty */ }
                dirCache.set(key, index);
                return index;
            };
            const dirOf = (p) => extractDir(p);

            for (const it of items) {
                const claims = [];
                (it.localizations || []).forEach((l) => {
                    const physical = l.kind === 'shortcut' && text(l.linkOf) ? text(l.linkOf) : text(l.path);
                    if (physical) claims.push(physical);
                    if (l.kind === 'shortcut') shortcuts += 1;
                });
                if (!claims.length && text(it.localPath)) claims.push(text(it.localPath));
                if (!claims.length) continue;
                checked += 1;
                let found = false;
                for (const claim of claims) {
                    const ownFiles = await filesFor(dirOf(claim));
                    if (presentIn(ownFiles, claim) || presentIn(targetFiles, claim)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    if (!it.missingLocal) S()?.updateItem?.('music', it.id, { missingLocal: true });
                    missing += 1;
                } else if (it.missingLocal) {
                    S()?.updateItem?.('music', it.id, { missingLocal: false });
                }
            }

            return { ok: true, checked, missing, shortcuts, targetDir };
        }
        return auditScopeDiskStatus;
    };

    ns.ready = true;
})();
