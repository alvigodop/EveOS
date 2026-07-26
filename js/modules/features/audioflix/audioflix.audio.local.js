// Resolve an Audioflix item to its best playable source without changing the canonical record.
// Localized files always win; an online URL is retained only as a verified fallback.
window.EveAudioflixLocalPlayback = window.EveAudioflixLocalPlayback || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixLocalPlayback;
    if (ns.ready) return;

    const text = (value) => String(value ?? '').trim();

    async function prepare(item) {
        const playable = item && typeof item === 'object' ? { ...item } : {};
        const paths = window.EveAudioflixPaths;
        const originalUrl = text(playable.url);
        const browserFallback = originalUrl && !paths?.isAbsoluteLocal?.(originalUrl) ? originalUrl : '';
        const candidates = paths?.localCandidates?.(playable) || [];
        if (paths?.isAbsoluteLocal?.(originalUrl)
            && !candidates.some((candidate) => paths?.same?.(candidate, originalUrl))) {
            candidates.push(originalUrl);
        }

        for (const localPath of candidates) {
            let blobUrl = '';
            try {
                blobUrl = await window.EveAudioflixFsPorts?.fileUrlForPath?.(localPath) || '';
            } catch { /* Try the localhost bridge next. */ }
            if (blobUrl) {
                playable.url = blobUrl;
                return { item: playable, localPath, status: '' };
            }

            const native = window.EveAudioflixNative;
            const localUrl = native?.getLocalFileUrl?.(localPath) || '';
            if (!localUrl || typeof native?.probeLocalFile !== 'function') continue;
            try {
                if (await native.probeLocalFile(localUrl)) {
                    playable.url = localUrl;
                    return { item: playable, localPath, status: '' };
                }
            } catch { /* Continue through the remaining local candidates. */ }
        }

        if (candidates.length && browserFallback) {
            playable.url = browserFallback;
            return {
                item: playable,
                localPath: '',
                status: `Local copy unavailable for ${playable.title || 'track'} - streaming instead.`
            };
        }
        if (candidates.length) {
            throw new Error(
                `Cannot reach the local copy of ${playable.title || 'this track'}. `
                + 'Reconnect its Browser Folder or start EveOS localhost.'
            );
        }
        return { item: playable, localPath: '', status: '' };
    }

    Object.assign(ns, { ready: true, prepare });
})();
