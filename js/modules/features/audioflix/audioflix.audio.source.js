window.EveAudioflixAudioSource = window.EveAudioflixAudioSource || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioSource;
    if (ns.ready) return;

    const DIRECT_AUDIO_RE = /\.(mp3|wav|ogg|oga|flac|aac|m4a|webm|opus)(?:$|[?#])/i;
    const PLATFORM_RE = /^https?:\/\/(?:www\.|music\.)?(?:youtube\.com|youtu\.be|soundcloud\.com|bandcamp\.com|vimeo\.com)\b/i;

    function needsResolution(url) {
        const value = String(url || '').trim();
        return PLATFORM_RE.test(value) || (/^https?:\/\//i.test(value) && !DIRECT_AUDIO_RE.test(value));
    }

    async function resolveItem(item) {
        const safeItem = item && typeof item === 'object' ? { ...item } : {};
        if (!safeItem.url || !needsResolution(safeItem.url)) return safeItem;

        const resolved = await window.EveAudioflixNative?.resolveUrl?.(safeItem.url);
        if (!resolved?.ok || !resolved.audioUrl) {
            const reason = resolved?.reason || 'The platform URL did not resolve to an audio stream.';
            throw new Error(reason);
        }

        safeItem.sourceUrl = safeItem.url;
        safeItem.url = window.EveAudioflixNative?.getProxyUrl?.(resolved.audioUrl) || resolved.audioUrl;
        safeItem.resolvedDuration = Math.max(0, Number(resolved.duration || 0) || 0);
        safeItem.resolvedTitle = String(resolved.title || '').trim();
        return safeItem;
    }

    Object.assign(ns, {
        ready: true,
        needsResolution,
        resolveItem
    });
})();
