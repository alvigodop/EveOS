// WPL (Windows Media Player Playlist) parser module for Audioflix.
// Parses XML SMIL format to extract playlist title and track file locations.
window.EveAudioflixWpl = window.EveAudioflixWpl || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixWpl;
    if (ns.ready) return;

    const text = (v, fallback = '') => String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim() || fallback;

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

    // The playlist name comes from the FILE NAME whenever the path is known. Windows Media Player
    // keeps the original name inside the XML's <title>, so renaming the .wpl on disk left EveOS
    // showing the stale old name — which looked like a cached or "locked" path but was really just
    // the embedded title winning. That title is now only the fallback for pasted XML with no path.
    function playlistTitle(embeddedTitle, wplPath) {
        const fromPath = text(wplPath)
            ? text(String(wplPath).replace(/\\/g, '/').split('/').filter(Boolean).pop()).replace(/\.wpl$/i, '').trim()
            : '';
        return fromPath || text(embeddedTitle) || 'WPL Playlist';
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
        const title = playlistTitle(titleEl?.textContent, wplPath);

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

    function unescapeXml(str) {
        return String(str || '')
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }

    function parseWplRegex(xmlText, wplPath = '') {
        const titleMatch = xmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = playlistTitle(unescapeXml(text(titleMatch?.[1])), wplPath);

        const tracks = [];
        const mediaRegex = /<media\s+[^>]*src=["']([^"']+)["']/gi;
        let match;

        while ((match = mediaRegex.exec(xmlText)) !== null) {
            const src = unescapeXml(match[1]);
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
