// Shared disk-path handling for Audioflix playback, localization, and backup repair.
window.EveAudioflixPaths = window.EveAudioflixPaths || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixPaths;
    if (ns.ready) return;

    function text(value) {
        return String(value ?? '').trim();
    }

    function stripQuotes(value) {
        let clean = text(value);
        while (clean.length > 1) {
            const first = clean[0];
            const last = clean[clean.length - 1];
            if (!((first === '"' && last === '"') || (first === "'" && last === "'"))) break;
            clean = clean.slice(1, -1).trim();
        }
        return clean;
    }

    function normalize(value) {
        let clean = stripQuotes(value);
        if (!clean) return '';
        if (/^file:/i.test(clean)) {
            try {
                const parsed = new URL(clean);
                clean = decodeURIComponent(parsed.pathname || '');
                if (/^\/[a-z]:/i.test(clean)) clean = clean.slice(1);
                if (parsed.host) clean = `//${parsed.host}/${clean.replace(/^\/+/, '')}`;
            } catch { /* retain the original value */ }
        }
        clean = clean.replace(/^\\\\\?\\/, '').replace(/\\/g, '/');
        const unc = clean.startsWith('//');
        clean = clean.replace(/\/+/g, '/');
        if (unc && !clean.startsWith('//')) clean = `/${clean}`;
        if (clean.length > 1 && !/^[a-z]:\/$/i.test(clean)) clean = clean.replace(/\/+$/, '');
        return clean;
    }

    function key(value) {
        return normalize(value).toLowerCase();
    }

    function same(a, b) {
        const left = key(a);
        return !!left && left === key(b);
    }

    function isAbsoluteLocal(value) {
        const raw = stripQuotes(value);
        return /^file:/i.test(raw)
            || /^[a-z]:[\\/]/i.test(raw)
            || /^\\\\[^\\]/.test(raw)
            || /^\/\/[^/]/.test(raw);
    }

    function basename(value) {
        const clean = normalize(value);
        if (!clean) return '';
        return clean.split('/').filter(Boolean).pop() || '';
    }

    function dirname(value) {
        const clean = normalize(value);
        if (!clean) return '';
        const index = clean.lastIndexOf('/');
        if (index < 0) return '';
        if (index === 2 && /^[a-z]:/i.test(clean)) return clean.slice(0, 3);
        return clean.slice(0, index);
    }

    function relativeTo(value, root) {
        const clean = normalize(value);
        const cleanRoot = normalize(root);
        if (!clean || !cleanRoot) return null;
        const pathKey = clean.toLowerCase();
        const rootKey = cleanRoot.toLowerCase();
        if (pathKey === rootKey) return '';
        if (!pathKey.startsWith(`${rootKey}/`)) return null;
        return clean.slice(cleanRoot.length + 1);
    }

    function join(root, relative) {
        const cleanRoot = normalize(root);
        const cleanRelative = normalize(relative).replace(/^[a-z]:\//i, '').replace(/^\/+/, '');
        if (!cleanRoot) return cleanRelative;
        if (!cleanRelative) return cleanRoot;
        const combined = `${cleanRoot}/${cleanRelative}`;
        const windowsStyle = /^[a-z]:\//i.test(cleanRoot) || String(root || '').includes('\\');
        return windowsStyle ? combined.replace(/\//g, '\\') : combined;
    }

    function rebase(value, oldRoot, newRoot) {
        const relative = relativeTo(value, oldRoot);
        return join(newRoot, relative == null ? basename(value) : relative);
    }

    function relativeAfterFolder(value, folderName) {
        const parts = normalize(value).split('/').filter(Boolean);
        const wanted = text(folderName).toLowerCase();
        if (!parts.length || !wanted) return [];
        let index = -1;
        for (let i = 0; i < parts.length - 1; i += 1) {
            if (parts[i].toLowerCase() === wanted) index = i;
        }
        return index >= 0 ? parts.slice(index + 1) : [];
    }

    function localizationRank(entry) {
        const source = text(entry?.source);
        if (source.startsWith('folder:') && entry?.kind !== 'shortcut') return 0;
        if (entry?.kind === 'shortcut') return 1;
        if (source.startsWith('group:')) return 2;
        return 3;
    }

    function localCandidates(item) {
        const values = [];
        const add = (value) => {
            const clean = stripQuotes(value);
            if (!clean || /^https?:\/\//i.test(clean)) return;
            if (!values.some((entry) => same(entry, clean))) values.push(clean);
        };
        [...(Array.isArray(item?.localizations) ? item.localizations : [])]
            .sort((a, b) => localizationRank(a) - localizationRank(b))
            .forEach((entry) => {
                add(entry.path);
                if (entry.kind === 'shortcut') add(entry.linkOf);
            });
        add(item?.localPath);
        return values;
    }

    function titleKey(value) {
        return text(value)
            .toLowerCase()
            .replace(/\.[a-z0-9]{2,5}$/i, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function matchScannedFile(item, files, sourceRoots = [], targetRoot = '') {
        const list = (Array.isArray(files) ? files : []).filter((file) => file?.path);
        if (!list.length) return null;
        const candidates = localCandidates(item);
        const rawUrl = text(item?.url);
        if (rawUrl && !/^https?:\/\//i.test(rawUrl)) candidates.push(rawUrl);

        const exact = new Set(candidates.map(key).filter(Boolean));
        const exactMatch = list.find((file) => exact.has(key(file.path)));
        if (exactMatch) return exactMatch;

        const roots = (Array.isArray(sourceRoots) ? sourceRoots : [sourceRoots]).filter(Boolean);
        const relatives = new Set();
        candidates.forEach((candidate) => roots.forEach((root) => {
            const relative = relativeTo(candidate, root);
            if (relative != null) relatives.add(key(relative));
        }));
        if (relatives.size && targetRoot) {
            const relativeMatches = list.filter((file) => {
                const relative = relativeTo(file.path, targetRoot);
                return relative != null && relatives.has(key(relative));
            });
            if (relativeMatches.length === 1) return relativeMatches[0];
        }

        const names = new Set(candidates.map((candidate) => basename(candidate).toLowerCase()).filter(Boolean));
        const nameMatches = list.filter((file) => names.has(
            text(file.fileName || basename(file.path)).toLowerCase()
        ));
        if (nameMatches.length === 1) return nameMatches[0];

        const wantedTitle = titleKey(item?.title);
        if (!wantedTitle) return null;
        const wantedArtist = titleKey(item?.artist);
        const acceptedTitles = new Set([wantedTitle]);
        if (wantedArtist) {
            acceptedTitles.add(`${wantedTitle} ${wantedArtist}`);
            acceptedTitles.add(`${wantedArtist} ${wantedTitle}`);
        }
        const titleMatches = list.filter((file) => acceptedTitles.has(titleKey(file.name || file.fileName)));
        return titleMatches.length === 1 ? titleMatches[0] : null;
    }

    Object.assign(ns, {
        ready: true,
        stripQuotes,
        normalize,
        key,
        same,
        isAbsoluteLocal,
        basename,
        dirname,
        relativeTo,
        relativeAfterFolder,
        join,
        rebase,
        localCandidates,
        titleKey,
        matchScannedFile
    });
})();
