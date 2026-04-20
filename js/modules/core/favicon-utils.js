(function () {
    'use strict';

    const GOOGLE_FAVICON_BASE = 'https://www.google.com/s2/favicons';
    const FAILURE_STORAGE_KEY = 'eveFaviconFailureCacheV1';
    const FAILURE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
    const placeholderCache = new Map();
    const failureCache = new Map();
    let failureCacheLoaded = false;

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

    function loadFailureCache() {
        if (failureCacheLoaded) return;
        failureCacheLoaded = true;

        try {
            const raw = window.localStorage?.getItem(FAILURE_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;

            const now = Date.now();
            Object.entries(parsed).forEach(function ([domain, ts]) {
                const normalized = normalizeDomain(domain);
                const stamp = Number(ts || 0);
                if (!normalized || !Number.isFinite(stamp)) return;
                if (now - stamp > FAILURE_TTL_MS) return;
                failureCache.set(normalized, stamp);
            });
        } catch (error) {
            failureCache.clear();
        }
    }

    function persistFailureCache() {
        try {
            const payload = {};
            const now = Date.now();
            for (const [domain, ts] of failureCache.entries()) {
                if (now - Number(ts || 0) > FAILURE_TTL_MS) continue;
                payload[domain] = Number(ts || now);
            }
            window.localStorage?.setItem(FAILURE_STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            // Ignore persistence failures.
        }
    }

    function pruneFailureCache() {
        loadFailureCache();
        const now = Date.now();
        let dirty = false;
        for (const [domain, ts] of failureCache.entries()) {
            if (now - Number(ts || 0) <= FAILURE_TTL_MS) continue;
            failureCache.delete(domain);
            dirty = true;
        }
        if (dirty) persistFailureCache();
    }

    function markDomainFailure(domain) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return;
        loadFailureCache();
        failureCache.set(normalized, Date.now());
        persistFailureCache();
    }

    function clearDomainFailure(domain) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return;
        loadFailureCache();
        if (!failureCache.delete(normalized)) return;
        persistFailureCache();
    }

    function hasDomainFailure(domain) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return false;
        pruneFailureCache();
        return failureCache.has(normalized);
    }

    function isRemoteFaviconUrl(value) {
        const text = String(value || '').toLowerCase();
        return text.includes('google.com/s2/favicons') || text.includes('gstatic.com/faviconv2');
    }

    function isLocalRenderableIcon(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        return !isRemoteFaviconUrl(text);
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
            const cachedSrc = window.EveFaviconCache.getSrc(normalized, size || 32);
            if (isLocalRenderableIcon(cachedSrc)) {
                clearDomainFailure(normalized);
                return cachedSrc;
            }
            if (cachedSrc && !hasDomainFailure(normalized)) return cachedSrc;
        }

        if (hasDomainFailure(normalized)) return getFallbackSrc(normalized, size || 32);
        return buildRemoteUrl(normalized, size || 32);
    }

    function getBestEffortSrc(domain, size) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return '';

        const src = getSrc(normalized, size);
        if (src) return src;

        if (hasDomainFailure(normalized)) return getFallbackSrc(normalized, size || 32);
        return buildRemoteUrl(normalized, size || 32);
    }

    function createFallbackNode(image) {
        const fallback = document.createElement('span');
        fallback.textContent = String.fromCodePoint(0x1F310);
        fallback.style.fontSize = '1.1rem';
        fallback.style.lineHeight = '1';
        fallback.className = image?.dataset?.fallbackClass || 'eve-favicon-fallback';
        return fallback;
    }

    function handleImageError(image) {
        if (!image) return false;

        const domain = normalizeDomain(
            image.dataset?.faviconDomain
            || image.dataset?.domain
            || getDomainFromUrl(image.currentSrc || image.src || '')
        );
        const size = Number(image.dataset?.faviconSize || image.width || image.height || 32) || 32;
        const fallbackSrc = String(image.dataset?.fallbackSrc || '').trim() || getFallbackSrc(domain, size);
        const currentSrc = String(image.currentSrc || image.src || '');

        if (domain && isRemoteFaviconUrl(currentSrc)) {
            markDomainFailure(domain);
        }

        if (image.dataset.fallbackApplied === '1') {
            const fallbackNode = createFallbackNode(image);
            image.replaceWith(fallbackNode);
            return false;
        }

        image.dataset.fallbackApplied = '1';

        if (fallbackSrc) {
            image.onerror = function () {
                const fallbackNode = createFallbackNode(image);
                image.replaceWith(fallbackNode);
            };
            image.src = fallbackSrc;
            return true;
        }

        const fallbackNode = createFallbackNode(image);
        image.replaceWith(fallbackNode);
        return false;
    }

    window.EveFaviconUtils = {
        getDomainFromUrl,
        getSrc,
        getBestEffortSrc,
        getFallbackSrc,
        buildPlaceholderSrc,
        buildRemoteUrl,
        isLocalContext,
        hasDomainFailure,
        markDomainFailure,
        clearDomainFailure,
        handleImageError
    };
})();
