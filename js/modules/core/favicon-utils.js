(function () {
    'use strict';

    const GOOGLE_FAVICON_BASE = 'https://www.google.com/s2/favicons';
    const placeholderCache = new Map();

    function normalizeDomain(domain) {
        return String(domain || '').toLowerCase().replace(/^www\./, '');
    }

    function getDomainFromUrl(rawUrl) {
        const text = String(rawUrl || '').trim();
        if (!text) return '';

        try {
            return normalizeDomain(new URL(text).hostname || '');
        } catch (error) {
            // Fall through to scheme-less / malformed URL recovery.
        }

        try {
            if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
                return normalizeDomain(new URL(`https://${text}`).hostname || '');
            }
        } catch (error) {
            // Fall through to plain-text extraction.
        }

        const candidate = text
            .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
            .split(/[/?#]/)[0]
            .split('@')
            .pop()
            .replace(/:\d+$/, '');

        return normalizeDomain(candidate);
    }

    function isLocalContext() {
        try {
            return window.location && window.location.protocol === 'file:';
        } catch (e) {
            return false;
        }
    }

    function buildRemoteUrl(domain, size) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return '';
        return `${GOOGLE_FAVICON_BASE}?domain=${encodeURIComponent(normalized)}&sz=${size || 32}`;
    }

    function hashString(value) {
        let hash = 0;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function buildPlaceholderSrc(domain, size) {
        const normalized = normalizeDomain(domain) || 'bookmark';
        const key = `${normalized}|${size || 32}`;
        if (placeholderCache.has(key)) return placeholderCache.get(key);

        const sz = size || 32;
        const palettes = [
            { bg: '#1f3b73', fg: '#f5f7ff' },
            { bg: '#0f766e', fg: '#ecfeff' },
            { bg: '#7c2d12', fg: '#fff7ed' },
            { bg: '#6d28d9', fg: '#f5f3ff' },
            { bg: '#9f1239', fg: '#fff1f2' },
            { bg: '#365314', fg: '#f7fee7' },
            { bg: '#1d4ed8', fg: '#eff6ff' },
            { bg: '#7f1d1d', fg: '#fef2f2' }
        ];
        const palette = palettes[hashString(normalized) % palettes.length];
        const labelMatch = normalized.match(/[a-z0-9]/i);
        const label = (labelMatch ? labelMatch[0] : '?').toUpperCase();
        const radius = Math.max(6, Math.round(sz * 0.22));
        const fontSize = Math.max(12, Math.round(sz * 0.5));
        const svg = [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">`,
            `<rect width="${sz}" height="${sz}" rx="${radius}" fill="${palette.bg}"/>`,
            `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${palette.fg}">${label}</text>`,
            '</svg>'
        ].join('');
        const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        placeholderCache.set(key, dataUri);
        return dataUri;
    }

    function getFallbackSrc(domain, size) {
        const normalized = normalizeDomain(domain) || 'bookmark';
        return buildPlaceholderSrc(normalized, size || 32);
    }

    function getSrc(domain, size) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return '';

        if (window.EveFaviconCache && typeof window.EveFaviconCache.getSrc === 'function') {
            return window.EveFaviconCache.getSrc(normalized, size || 32);
        }

        if (isLocalContext()) return buildRemoteUrl(normalized, size || 32);
        return buildRemoteUrl(normalized, size || 32);
    }

    function getBestEffortSrc(domain, size) {
        const src = getSrc(domain, size);
        if (src) return src;

        const normalized = normalizeDomain(domain);
        if (!normalized) return '';
        if (isLocalContext()) return buildPlaceholderSrc(normalized, size || 32);
        return buildRemoteUrl(normalized, size || 32);
    }

    window.EveFaviconUtils = {
        getDomainFromUrl,
        getSrc,
        getBestEffortSrc,
        getFallbackSrc,
        buildPlaceholderSrc,
        buildRemoteUrl,
        isLocalContext
    };
})();
