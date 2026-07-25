// WPL (Windows Media Player Playlist) parser module for Audioflix.
// Parses XML SMIL format to extract playlist title and track file locations.
window.EveAudioflixWpl = window.EveAudioflixWpl || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixWpl;
    if (ns.ready) return;

    const text = (v, fallback = '') => String(v ?? '').trim() || fallback;

    function resolveRelativePath(srcPath, wplPath) {
        let cleanSrc = String(srcPath || '').trim();
        if (!cleanSrc) return '';
        if (/^[a-zA-Z]:[\\\/]/i.test(cleanSrc) || /^\\\\/i.test(cleanSrc) || /^https?:\/\//i.test(cleanSrc)) {
            return cleanSrc.replace(/\\/g, '/');
        }
        if (!wplPath) return cleanSrc.replace(/\\/g, '/');

        const normWpl = String(wplPath).replace(/\\/g, '/');
        const wplParts = normWpl.split('/').filter(Boolean);
        wplParts.pop();

        const srcParts = cleanSrc.replace(/\\/g, '/').split('/').filter(Boolean);
        for (const part of srcParts) {
            if (part === '..') {
                if (wplParts.length > 1) wplParts.pop();
            } else if (part !== '.') {
                wplParts.push(part);
            }
        }
        return wplParts.join('/');
    }

    function parseWplXml(xmlText, wplPath = '') {
        const cleanXml = String(xmlText || '').trim();
        if (!cleanXml) return { ok: false, reason: 'Empty WPL file.' };

        let doc;
        try {
            const parser = new DOMParser();
            doc = parser.parseFromString(cleanXml, 'text/xml');
            if (doc.querySelector('parsererror')) {
                throw new Error('XML parse error');
            }
        } catch {
            return parseWplRegex(cleanXml, wplPath);
        }

        const titleEl = doc.querySelector('head > title') || doc.querySelector('title');
        let title = text(titleEl?.textContent);

        if (!title && wplPath) {
            const parts = wplPath.replace(/\\/g, '/').split('/').filter(Boolean);
            title = parts[parts.length - 1]?.replace(/\.wpl$/i, '').trim();
        }
        if (!title) title = 'WPL Playlist';

        const mediaEls = doc.querySelectorAll('seq > media, body media');
        const tracks = [];

        mediaEls.forEach((el) => {
            const src = el.getAttribute('src');
            if (!src) return;
            const fullPath = resolveRelativePath(src, wplPath);
            const fileName = fullPath.split('/').pop() || src;
            const rawTitle = fileName.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || fileName;

            tracks.push({
                title: rawTitle,
                path: fullPath,
                src: src
            });
        });

        return { ok: true, title, tracks, count: tracks.length, wplPath };
    }

    function parseWplRegex(xmlText, wplPath = '') {
        const titleMatch = xmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
        let title = text(titleMatch?.[1]);

        if (!title && wplPath) {
            const parts = wplPath.replace(/\\/g, '/').split('/').filter(Boolean);
            title = parts[parts.length - 1]?.replace(/\.wpl$/i, '').trim();
        }
        if (!title) title = 'WPL Playlist';

        const tracks = [];
        const mediaRegex = /<media\s+[^>]*src=["']([^"']+)["']/gi;
        let match;

        while ((match = mediaRegex.exec(xmlText)) !== null) {
            const src = match[1];
            if (!src) continue;
            const fullPath = resolveRelativePath(src, wplPath);
            const fileName = fullPath.split('/').pop() || src;
            const rawTitle = fileName.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || fileName;

            tracks.push({
                title: rawTitle,
                path: fullPath,
                src: src
            });
        }

        return { ok: true, title, tracks, count: tracks.length, wplPath };
    }

    Object.assign(ns, {
        ready: true,
        resolveRelativePath,
        parseWplXml,
        parseWplRegex
    });
})();
