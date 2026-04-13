/* EveOS Favicon Cache — Caches domain favicons as data URIs in IndexedDB */
(function () {
    'use strict';

    const IDB_KEY = 'eveFaviconCache';
    const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const GOOGLE_FAVICON_BASE = 'https://www.google.com/s2/favicons';
    const MAX_MEMORY = 500; // In-memory LRU cap

    // ── In-memory fast-path cache ──
    // Populated from IDB on boot, used synchronously during render
    const memoryCache = new Map();
    let diskCache = null; // { [domain]: { dataUri, ts } }
    let diskLoaded = false;
    let diskLoadPromise = null;
    let _warmupScheduled = false;

    // ── Core: load disk cache from IDB ──
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
                if (!entry || !entry.dataUri) continue;
                if (now - (entry.ts || 0) > TTL_MS) continue; // expired
                memoryCache.set(domain, entry.dataUri);
            }

            // Evict expired entries from disk
            let dirty = false;
            for (const [domain, entry] of entries) {
                if (!entry || now - (entry.ts || 0) > TTL_MS) {
                    delete diskCache[domain];
                    dirty = true;
                }
            }
            if (dirty) saveDiskCache();

            return diskCache;
        })();

        return diskLoadPromise;
    }

    // ── Core: save disk cache to IDB (debounced) ──
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

    // ── Fetch a favicon and convert to data URI ──
    function fetchFaviconDataUri(domain, size) {
        const sz = size || 32;
        const url = `${GOOGLE_FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${sz}`;

        return new Promise(function (resolve) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
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
                    // CORS taint — can't canvas, store the URL directly
                    resolve(url);
                }
            };

            img.onerror = function () {
                resolve(''); // Nothing to cache
            };

            img.src = url;
        });
    }

    // ── Public API ──

    /**
     * Get a cached favicon data URI for a domain.
     * Returns the data URI string if cached, or '' if not yet available.
     * Triggers an async fetch + cache if not found.
     */
    function get(domain) {
        if (!domain) return '';
        const key = domain.toLowerCase().replace(/^www\./, '');

        // Fast path: in-memory
        if (memoryCache.has(key)) return memoryCache.get(key);

        // Miss — schedule background fetch (non-blocking)
        fetchAndCache(key, 32);

        return ''; // Caller should use fallback
    }

    /**
     * Get the favicon URL to use in an <img> src attribute.
     * Returns cached data URI if available, otherwise returns the live Google URL.
     * This is the primary integration point — call this instead of building Google URLs.
     */
    function getSrc(domain, size) {
        if (!domain) return '';
        const key = domain.toLowerCase().replace(/^www\./, '');
        const sz = size || 32;

        // Fast path: in-memory
        if (memoryCache.has(key)) return memoryCache.get(key);

        // Schedule background cache
        fetchAndCache(key, sz);

        // Return live URL as temporary fallback (will be cached for next render)
        return `${GOOGLE_FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${sz}`;
    }

    /**
     * Fetch, cache, and store a favicon for a domain.
     * Safe to call multiple times — deduplicates in-flight requests.
     */
    const _inFlight = new Map();
    async function fetchAndCache(domain, size) {
        const key = domain.toLowerCase().replace(/^www\./, '');
        if (memoryCache.has(key)) return memoryCache.get(key);
        if (_inFlight.has(key)) return _inFlight.get(key);

        const promise = (async () => {
            // Wait for disk cache to be ready
            await loadDiskCache();

            // Check disk (might have populated memory during load)
            if (memoryCache.has(key)) return memoryCache.get(key);

            const existing = diskCache[key];
            if (existing && existing.dataUri && (Date.now() - (existing.ts || 0) < TTL_MS)) {
                memoryCache.set(key, existing.dataUri);
                trimMemory();
                return existing.dataUri;
            }

            // Fetch fresh
            const dataUri = await fetchFaviconDataUri(key, size || 32);
            if (dataUri) {
                memoryCache.set(key, dataUri);
                trimMemory();
                diskCache[key] = { dataUri, ts: Date.now() };
                saveDiskCache();
            }

            return dataUri || '';
        })();

        _inFlight.set(key, promise);
        promise.finally(() => _inFlight.delete(key));
        return promise;
    }

    function trimMemory() {
        if (memoryCache.size <= MAX_MEMORY) return;
        // Evict oldest entries (first inserted = oldest in Map)
        const excess = memoryCache.size - MAX_MEMORY;
        const keys = memoryCache.keys();
        for (let i = 0; i < excess; i++) {
            const next = keys.next();
            if (next.done) break;
            memoryCache.delete(next.value);
        }
    }

    /**
     * Warmup: pre-cache favicons for all visible bookmarks.
     * Called once after dashboard first renders.
     */
    function warmup() {
        if (_warmupScheduled) return;
        _warmupScheduled = true;

        // Delay warmup to not compete with initial render
        setTimeout(async function () {
            await loadDiskCache();

            const allLinks = window.eveState?.links || (typeof links !== 'undefined' ? links : []);
            if (!Array.isArray(allLinks)) return;

            // Collect unique domains that need caching
            const needed = new Set();
            for (let i = 0; i < allLinks.length; i++) {
                const link = allLinks[i];
                if (!link || !link.url) continue;
                // Skip if link already has a custom icon
                if (link.icon && link.icon !== '\u{1F517}') continue;
                try {
                    const hostname = new URL(link.url).hostname;
                    if (!hostname || !hostname.includes('.')) continue;
                    const key = hostname.toLowerCase().replace(/^www\./, '');
                    if (!memoryCache.has(key)) needed.add(key);
                } catch (e) { /* skip invalid URLs */ }
            }

            if (needed.size === 0) return;
            console.log(`[FaviconCache] Warming up ${needed.size} uncached favicons...`);

            // Process in small batches to avoid network flooding
            const BATCH = 6;
            const domains = Array.from(needed);
            for (let i = 0; i < domains.length; i += BATCH) {
                const batch = domains.slice(i, i + BATCH);
                await Promise.allSettled(batch.map(d => fetchAndCache(d, 32)));
                // Tiny yield between batches
                await new Promise(r => setTimeout(r, 50));
            }

            console.log(`[FaviconCache] Warmup complete. ${memoryCache.size} domains cached.`);
        }, 3000);
    }

    /**
     * Clear the entire favicon cache (disk + memory).
     */
    async function clearAll() {
        memoryCache.clear();
        diskCache = {};
        diskLoaded = true;
        const storage = window.EveCoreStorage;
        if (storage) {
            await storage.saveJson(IDB_KEY, {}, {
                localFallbackKey: IDB_KEY,
                cleanupLocalKeys: [IDB_KEY]
            });
        }
    }

    /**
     * Get cache statistics.
     */
    function getStats() {
        return {
            memorySize: memoryCache.size,
            diskSize: diskCache ? Object.keys(diskCache).length : 0,
            diskLoaded: diskLoaded
        };
    }

    // Boot: start loading disk cache early
    loadDiskCache();

    // Expose
    window.EveFaviconCache = {
        get,
        getSrc,
        fetchAndCache,
        warmup,
        clearAll,
        getStats
    };
})();
