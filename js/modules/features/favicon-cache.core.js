(function () {
    if (window.EveFaviconCacheCore) return;

    const IDB_KEY = 'eveFaviconCache';
    const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const FAILURE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
    const FAVICON_PROVIDER_BASE = 'https://icons.duckduckgo.com/ip3';
    const GOOGLE_FAVICON_PROVIDER_BASE = 'https://www.google.com/s2/favicons';
    const MAX_MEMORY = 500; // In-memory LRU cap
    const RENDER_MISS_FETCH_BUDGET = 80;
    const QUEUED_FETCH_BATCH = 3;
    const QUEUED_FETCH_GAP_MS = 180;
    const DEFAULT_WARMUP_MAX_UNCACHED = 120;
    const MAX_DOM_ICON_UPDATES_PER_FLUSH = 160;
    const placeholderCache = new Map();

    // â”€â”€ In-memory fast-path cache â”€â”€
    // Populated from IDB on boot, used synchronously during render
    const memoryCache = new Map();
    const failureCache = new Map();
    let diskCache = null; // { [domain]: { dataUri, ts } }
    let diskLoaded = false;
    let diskLoadPromise = null;
    let _warmupScheduled = false;
    let _renderMissFetchBudget = RENDER_MISS_FETCH_BUDGET;
    let _renderMissFetchBudgetResetAt = Date.now();
    let _fetchQueueTimer = 0;
    let _fetchQueueRunning = false;
    const queuedFetches = [];
    const queuedFetchKeys = new Set();
    const pendingDomIconUpdates = new Map();
    let domIconUpdateTimer = 0;

    // â”€â”€ Core: load disk cache from IDB â”€â”€
    async function loadDiskCache() {
        if (diskLoaded) return diskCache;
        if (diskLoadPromise) return diskLoadPromise;

        diskLoadPromise = (async () => {
            try {
                const storage = window.EveCoreStorage;
                if (storage) {
                    const raw = await storage.loadJson(IDB_KEY, {}, { localFallbackKey: IDB_KEY });
                    diskCache = (raw && typeof raw === 'object') ? raw : {};
                } else {
                    diskCache = {};
                }
            } catch (e) {
                console.warn('[FaviconCache] Failed to load disk cache:', e);
                diskCache = {};
            }
            diskLoaded = true;

            // Hydrate memory from disk
            const now = Date.now();
            const entries = Object.entries(diskCache);
            for (const [domain, entry] of entries) {
                if (entry?.failedAt && now - (entry.failedAt || 0) <= FAILURE_TTL_MS) {
                    failureCache.set(domain, entry.failedAt);
                    continue;
                }
                if (!entry || !entry.dataUri) continue;
                if (now - (entry.ts || 0) > TTL_MS) continue; // expired
                if (isUsableCachedIcon(entry.dataUri)) {
                    memoryCache.set(domain, entry.dataUri);
                }
            }

            // Evict expired entries from disk
            let dirty = false;
            for (const [domain, entry] of entries) {
                if (entry?.failedAt && now - (entry.failedAt || 0) <= FAILURE_TTL_MS) {
                    failureCache.set(domain, entry.failedAt);
                    continue;
                }
                if (!entry || now - (entry.ts || 0) > TTL_MS || (entry.failedAt && now - (entry.failedAt || 0) > FAILURE_TTL_MS)) {
                    delete diskCache[domain];
                    failureCache.delete(domain);
                    dirty = true;
                }
            }
            if (dirty) saveDiskCache();

            return diskCache;
        })();

        return diskLoadPromise;
    }

    // â”€â”€ Core: save disk cache to IDB (debounced) â”€â”€
    let _saveTimer = 0;
    function saveDiskCache() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function () {
            _saveTimer = 0;
            const storage = window.EveCoreStorage;
            if (!storage || !diskCache) return;
            void storage.saveJson(IDB_KEY, diskCache, {
                localFallbackKey: IDB_KEY,
                cleanupLocalKeys: [IDB_KEY]
            }).catch(function (e) {
                console.warn('[FaviconCache] Failed to persist cache:', e);
            });
        }, 2000);
    }

    // â”€â”€ Fetch a favicon and convert to data URI â”€â”€
    function normalizeDomain(domain) {
        return String(domain || '').toLowerCase().replace(/^www\./, '');
    }

    function isReservedTestDomain(domain) {
        const key = normalizeDomain(domain);
        return key === 'example'
            || key.endsWith('.example')
            || key === 'test'
            || key.endsWith('.test')
            || key === 'invalid'
            || key.endsWith('.invalid');
    }

    function isReservedIconUrl(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        try {
            return isReservedTestDomain(new URL(text, window.location?.href || undefined).hostname || '');
        } catch (error) {
            return isReservedTestDomain(getDomainFromUrl(text));
        }
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

    function canFetchRemoteFavicons() {
        return true;
    }

    function isRemoteIconUrl(value) {
        return /^https?:\/\//i.test(String(value || ''));
    }

    function isSupportedRemoteIconUrl(value) {
        const text = String(value || '').toLowerCase();
        return text.includes('icons.duckduckgo.com/ip3/')
            || text.includes('google.com/s2/favicons')
            || text.includes('gstatic.com/faviconv2');
    }

    function isUsableCachedIcon(value) {
        if (!value) return false;
        if (!isRemoteIconUrl(value)) return true;
        return isSupportedRemoteIconUrl(value);
    }

    function getCachedIcon(key) {
        if (!memoryCache.has(key)) return '';
        const cached = memoryCache.get(key);
        return isUsableCachedIcon(cached) ? cached : '';
    }

    function isFailureCoolingDown(key) {
        const failedAt = Number(failureCache.get(normalizeDomain(key)) || 0);
        if (!failedAt) return false;
        if (Date.now() - failedAt <= FAILURE_TTL_MS) return true;
        failureCache.delete(normalizeDomain(key));
        return false;
    }

    function markFailure(key) {
        const normalized = normalizeDomain(key);
        if (!normalized) return;
        const failedAt = Date.now();
        failureCache.set(normalized, failedAt);
        if (diskCache) {
            diskCache[normalized] = { dataUri: '', ts: failedAt, failedAt };
            saveDiskCache();
        }
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

    function getPlaceholderFavicon(domain, size) {
        const key = `${normalizeDomain(domain)}|${size || 32}`;
        if (placeholderCache.has(key)) return placeholderCache.get(key);

        const normalized = normalizeDomain(domain) || 'bookmark';
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
        const key = normalizeDomain(domain) || 'bookmark';
        return getPlaceholderFavicon(key, size || 32);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0) || 0)));
    }

    function isStartupPaintActive() {
        return !!window._eveStartupBookmarkPaintActive;
    }

    function shouldDeferRenderMissFetch() {
        return isStartupPaintActive()
            || !!window._eveMegaPerfMode
            || (typeof document !== 'undefined' && document.visibilityState === 'hidden');
    }

    function scheduleDomIconUpdate(domain, src) {
        const key = normalizeDomain(domain);
        if (!key || !src || typeof document === 'undefined') return;
        pendingDomIconUpdates.set(key, src);
        if (domIconUpdateTimer) return;
        domIconUpdateTimer = setTimeout(function flushDomIconUpdates() {
            domIconUpdateTimer = 0;
            if (!pendingDomIconUpdates.size) return;
            const updates = new Map(pendingDomIconUpdates);
            pendingDomIconUpdates.clear();
            let applied = 0;
            updates.forEach(function (nextSrc, imageDomain) {
                if (applied >= MAX_DOM_ICON_UPDATES_PER_FLUSH) return;
                const safeDomain = window.CSS?.escape
                    ? window.CSS.escape(imageDomain)
                    : imageDomain.replace(/["\\]/g, '\\$&');
                document.querySelectorAll(
                    `img[data-favicon-domain="${safeDomain}"]`
                ).forEach(function (image) {
                    if (applied >= MAX_DOM_ICON_UPDATES_PER_FLUSH) return;
                    image.dataset.fallbackApplied = '';
                    if (image.src === nextSrc) return;
                    if (image.style.display === 'none') image.style.display = '';
                    image.src = nextSrc;
                    applied += 1;
                });
            });
        }, 220);
    }

    function runQueuedFetchesSoon() {
        if (_fetchQueueRunning || _fetchQueueTimer || !queuedFetches.length) return;
        _fetchQueueTimer = setTimeout(async function processQueuedFetches() {
            _fetchQueueTimer = 0;
            if (_fetchQueueRunning) return;
            _fetchQueueRunning = true;
            try {
                await loadDiskCache();
                while (queuedFetches.length) {
                    const batch = queuedFetches.splice(0, QUEUED_FETCH_BATCH);
                    batch.forEach(item => queuedFetchKeys.delete(item.key));
                    await Promise.allSettled(batch.map(item => window.EveFaviconCache?.fetchAndCache?.(item.key, item.size)));
                    if (queuedFetches.length) await delay(QUEUED_FETCH_GAP_MS);
                }
            } finally {
                _fetchQueueRunning = false;
            }
        }, isStartupPaintActive() ? 1800 : 650);
    }

    function queueFetch(domain, size, source) {
        const key = normalizeDomain(domain);
        if (isReservedTestDomain(key)) {
            markFailure(key);
            return false;
        }
        if (!key || getCachedIcon(key) || isFailureCoolingDown(key) || window.EveFaviconCacheCore?.inFlight?.has(key) || queuedFetchKeys.has(key)) return false;

        const isWarmup = source === 'warmup';
        const isForcedRefresh = source === 'forced-refresh';
        if (!isWarmup && !isForcedRefresh) {
            if (Date.now() - _renderMissFetchBudgetResetAt > 60000) {
                _renderMissFetchBudget = RENDER_MISS_FETCH_BUDGET;
                _renderMissFetchBudgetResetAt = Date.now();
            }
            if (shouldDeferRenderMissFetch()) return false;
            if (_renderMissFetchBudget <= 0) return false;
            _renderMissFetchBudget -= 1;
        }

        queuedFetchKeys.add(key);
        queuedFetches.push({ key, size: size || 32 });
        runQueuedFetchesSoon();
        return true;
    }

    function loadIconUrlAsDataUri(url, size) {
        const sz = size || 32;

        return new Promise(function (resolve) {
            const img = new Image();
            img.referrerPolicy = 'no-referrer';

            img.onload = function () {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || sz;
                    canvas.height = img.naturalHeight || sz;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUri = canvas.toDataURL('image/png');
                    resolve(dataUri);
                } catch (e) {
                    // CORS taint â€” can't canvas, store the URL directly
                    resolve(url);
                }
            };

            img.onerror = function () {
                resolve(''); // Nothing to cache
            };

            img.src = url;
        });
    }

    async function fetchFaviconDataUri(domain, size) {
        const urls = buildRemoteUrls(domain, size || 32);
        for (let i = 0; i < urls.length; i += 1) {
            const dataUri = await loadIconUrlAsDataUri(urls[i], size || 32);
            if (dataUri) return dataUri;
        }
        return '';
    }

    function buildRemoteUrls(domain, size) {
        const key = normalizeDomain(domain);
        const sz = size || 32;
        if (!key || isReservedTestDomain(key)) return [];
        return [
            `${FAVICON_PROVIDER_BASE}/${encodeURIComponent(key)}.ico`,
            `${GOOGLE_FAVICON_PROVIDER_BASE}?domain=${encodeURIComponent(key)}&sz=${encodeURIComponent(String(sz))}`
        ];
    }

    function buildRemoteUrl(domain, size) {
        return buildRemoteUrls(domain, size || 32)[0] || '';
    }

    const core = {
        IDB_KEY, TTL_MS, FAILURE_TTL_MS, FAVICON_PROVIDER_BASE, GOOGLE_FAVICON_PROVIDER_BASE, MAX_MEMORY,
        RENDER_MISS_FETCH_BUDGET, QUEUED_FETCH_BATCH, QUEUED_FETCH_GAP_MS, DEFAULT_WARMUP_MAX_UNCACHED,
        MAX_DOM_ICON_UPDATES_PER_FLUSH, placeholderCache, memoryCache, failureCache, queuedFetches, queuedFetchKeys,
        pendingDomIconUpdates, loadDiskCache, saveDiskCache, normalizeDomain, isReservedTestDomain, isReservedIconUrl,
        getDomainFromUrl, isLocalContext, canFetchRemoteFavicons, isRemoteIconUrl, isSupportedRemoteIconUrl,
        isUsableCachedIcon, getCachedIcon, isFailureCoolingDown, markFailure, hashString, getPlaceholderFavicon,
        getFallbackSrc, delay, isStartupPaintActive, shouldDeferRenderMissFetch, scheduleDomIconUpdate,
        runQueuedFetchesSoon, queueFetch, loadIconUrlAsDataUri, fetchFaviconDataUri, buildRemoteUrls, buildRemoteUrl
    };
    Object.defineProperties(core, {
        diskCache: { get: () => diskCache, set: (value) => { diskCache = value; } },
        diskLoaded: { get: () => diskLoaded, set: (value) => { diskLoaded = value; } },
        diskLoadPromise: { get: () => diskLoadPromise, set: (value) => { diskLoadPromise = value; } },
        warmupScheduled: { get: () => _warmupScheduled, set: (value) => { _warmupScheduled = value; } },
        renderMissFetchBudget: { get: () => _renderMissFetchBudget, set: (value) => { _renderMissFetchBudget = value; } },
        renderMissFetchBudgetResetAt: { get: () => _renderMissFetchBudgetResetAt, set: (value) => { _renderMissFetchBudgetResetAt = value; } }
    });
    window.EveFaviconCacheCore = core;
})();
