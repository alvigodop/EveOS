(function () {
    const core = window.EveFaviconCacheCore;
    if (!core) return;
    const {
        TTL_MS, QUEUED_FETCH_BATCH, QUEUED_FETCH_GAP_MS,
        normalizeDomain, isReservedTestDomain, isReservedIconUrl, getDomainFromUrl, isLocalContext,
        canFetchRemoteFavicons, getCachedIcon, isFailureCoolingDown, markFailure, getPlaceholderFavicon,
        getFallbackSrc, isStartupPaintActive, shouldDeferRenderMissFetch, scheduleDomIconUpdate,
        queueFetch, fetchFaviconDataUri, buildRemoteUrls, buildRemoteUrl, loadDiskCache, saveDiskCache,
        isUsableCachedIcon, delay
    } = core;

    function get(domain) {
        const key = normalizeDomain(domain);
        if (!key) return '';

        // Fast path: in-memory
        const cached = getCachedIcon(key);
        if (cached) return cached;

        if (!canFetchRemoteFavicons()) return getPlaceholderFavicon(key, 32);

        // Miss â€” schedule background fetch (non-blocking)
        queueFetch(key, 32, 'get-miss');

        return ''; // Caller should use fallback
    }

    /**
     * Get the favicon URL to use in an <img> src attribute.
     * Returns cached data URI if available, otherwise returns a local placeholder.
     * This is the primary integration point â€” call this instead of building Google URLs.
     */
    function getSrc(domain, size) {
        const key = normalizeDomain(domain);
        if (!key) return '';
        const sz = size || 32;

        // Fast path: in-memory
        const cached = getCachedIcon(key);
        if (cached) return cached;

        // Do not put remote provider URLs directly into first-paint DOM.
        // They create many parallel image requests on large datapacks. Queue a
        // bounded background cache fill and render a stable local placeholder.
        queueFetch(key, sz, 'render-miss');

        return getFallbackSrc(key, sz);
    }

    /**
     * Fetch, cache, and store a favicon for a domain.
     * Safe to call multiple times â€” deduplicates in-flight requests.
     */
    const _inFlight = new Map();
    core.inFlight = _inFlight;
    async function fetchAndCache(domain, size) {
        const key = normalizeDomain(domain);
        if (!key) return '';
        if (isReservedTestDomain(key)) {
            markFailure(key);
            return '';
        }
        const cached = getCachedIcon(key);
        if (cached) {
            scheduleDomIconUpdate(key, cached);
            return cached;
        }
        if (isFailureCoolingDown(key)) return '';
        if (_inFlight.has(key)) return _inFlight.get(key);
        const promise = (async () => {
            // Wait for disk cache to be ready
            await loadDiskCache();

            // Check disk (might have populated memory during load)
            const hydrated = getCachedIcon(key);
            if (hydrated) {
                scheduleDomIconUpdate(key, hydrated);
                return hydrated;
            }

            const existing = core.diskCache[key];
            if (
                existing
                && !existing.failedAt
                && existing.dataUri
                && (Date.now() - (existing.ts || 0) < TTL_MS)
                && isUsableCachedIcon(existing.dataUri)
            ) {
                core.memoryCache.set(key, existing.dataUri);
                trimMemory();
                scheduleDomIconUpdate(key, existing.dataUri);
                return existing.dataUri;
            }

            // Fetch fresh
            const dataUri = await fetchFaviconDataUri(key, size || 32);
            if (dataUri) {
                core.failureCache.delete(key);
                core.memoryCache.set(key, dataUri);
                trimMemory();
                core.diskCache[key] = { dataUri, ts: Date.now() };
                saveDiskCache();
                scheduleDomIconUpdate(key, dataUri);
            } else {
                markFailure(key);
            }

            return dataUri || '';
        })();

        _inFlight.set(key, promise);
        promise.finally(() => _inFlight.delete(key));
        return promise;
    }

    function trimMemory() {
        if (core.memoryCache.size <= core.MAX_MEMORY) return;
        // Evict oldest entries (first inserted = oldest in Map)
        const excess = core.memoryCache.size - core.MAX_MEMORY;
        const keys = core.memoryCache.keys();
        for (let i = 0; i < excess; i++) {
            const next = keys.next();
            if (next.done) break;
            core.memoryCache.delete(next.value);
        }
    }

    /**
     * Warmup: pre-cache favicons for all visible bookmarks.
     * Called once after dashboard first renders.
     */
    function collectRenderedFaviconDomains() {
        const result = [];
        const seen = new Set();
        if (typeof document === 'undefined') return result;
        document.querySelectorAll('img[data-favicon-domain]').forEach(function (image) {
            const key = normalizeDomain(image.dataset?.faviconDomain || '');
            if (!key || seen.has(key) || getCachedIcon(key)) return;
            seen.add(key);
            result.push(key);
        });
        return result;
    }

    async function refreshRendered(options) {
        if (typeof document === 'undefined') return { updated: 0, queued: 0 };
        const opts = options || {};
        const delayMs = Math.max(0, Number(opts.delayMs || 0) || 0);
        const maxFetch = Math.max(0, Number(opts.maxFetch || 24) || 0);
        const maxUpdate = Math.max(24, Number(opts.maxUpdate || 220) || 220);
        const root = opts.root && typeof opts.root.querySelectorAll === 'function' ? opts.root : document;
        const forceFetch = !!opts.forceFetch || !!opts.force;
        const fallbackOnly = !!opts.fallbackOnly;
        if (delayMs) await delay(delayMs);
        await loadDiskCache();

        let updated = 0;
        let queued = 0;
        const seenMisses = new Set();
        const selector = fallbackOnly
            ? 'img[data-favicon-domain][data-fallback-applied="1"]'
            : 'img[data-favicon-domain]';
        const images = Array.from(root.querySelectorAll(selector));
        if (root.matches && root.matches(selector)) images.unshift(root);
        const total = images.length;
        images.forEach(function (image) {
            const key = normalizeDomain(image.dataset?.faviconDomain || '');
            if (!key) return;
            const size = Number(image.dataset?.faviconSize || image.width || image.height || 32) || 32;
            const fallbackSrc = String(image.dataset?.fallbackSrc || '').trim() || getFallbackSrc(key, size);
            const src = String(image.currentSrc || image.src || '').trim();
            const imageHidden = image.style.display === 'none';
            const imageBroken = image.complete && image.naturalWidth === 0 && image.naturalHeight === 0;
            const cached = getCachedIcon(key);
            if (cached) {
                image.dataset.fallbackApplied = '';
                if (image.src !== cached && updated < maxUpdate) {
                    if (imageHidden) image.style.display = '';
                    image.src = cached;
                    updated += 1;
                }
                return;
            }
            if (fallbackSrc && (imageHidden || imageBroken || !src) && updated < maxUpdate) {
                image.dataset.fallbackApplied = '1';
                if (imageHidden) image.style.display = '';
                if (image.src !== fallbackSrc) {
                    image.src = fallbackSrc;
                    updated += 1;
                }
            }
            if (queued >= maxFetch || seenMisses.has(key)) return;
            seenMisses.add(key);
            if (queueFetch(key, size, forceFetch ? 'forced-refresh' : 'refresh-rendered')) {
                queued += 1;
            }
        });
        return { updated, queued, scanned: total, total };
    }

    function warmup(options) {
        if (core.warmupScheduled || !canFetchRemoteFavicons()) return;
        core.warmupScheduled = true;
        const opts = options || {};
        const warmupDelayMs = Math.max(1500, Number(opts.delayMs || 4200) || 4200);
        const maxUncached = Math.max(12, Number(opts.maxUncached || core.DEFAULT_WARMUP_MAX_UNCACHED) || core.DEFAULT_WARMUP_MAX_UNCACHED);

        // Delay warmup to not compete with initial render
        setTimeout(async function () {
            await loadDiskCache();

            const allLinks = typeof window.getLiveLinks === 'function'
                ? window.getLiveLinks()
                : (window.eveState?.links || (typeof links !== 'undefined' ? links : []));
            if (!Array.isArray(allLinks)) {
                core.warmupScheduled = false;
                return;
            }

            // Collect unique domains that need caching
            const needed = new Set();
            collectRenderedFaviconDomains().forEach(function (domain) {
                if (needed.size < maxUncached) needed.add(domain);
            });
            for (let i = 0; i < allLinks.length; i++) {
                if (needed.size >= maxUncached) break;
                const link = allLinks[i];
                if (!link || !link.url) continue;
                // Skip if link already has a custom icon
                if (link.icon && link.icon !== '\u{1F517}' && !isReservedIconUrl(link.icon)) continue;
                const key = getDomainFromUrl(link.url);
                if (!key || !key.includes('.')) continue;
                if (!core.memoryCache.has(key)) needed.add(key);
            }

            if (needed.size === 0) {
                core.warmupScheduled = false;
                return;
            }
            console.log(`[FaviconCache] Warming up ${needed.size} uncached favicons (${opts.reason || 'background'})...`);

            // Process in small batches to avoid network flooding
            const BATCH = QUEUED_FETCH_BATCH;
            const domains = Array.from(needed);
            for (let i = 0; i < domains.length; i += BATCH) {
                const batch = domains.slice(i, i + BATCH);
                await Promise.allSettled(batch.map(d => fetchAndCache(d, 32)));
                if (i + BATCH < domains.length) await delay(QUEUED_FETCH_GAP_MS);
            }

            console.log(`[FaviconCache] Warmup complete. ${core.memoryCache.size} domains cached.`);
        }, warmupDelayMs);
    }

    /**
     * Clear the entire favicon cache (disk + memory).
     */
    async function clearAll() {
        core.memoryCache.clear();
        core.diskCache = {};
        core.diskLoaded = true;
        const storage = window.EveCoreStorage;
        if (storage) {
            await storage.saveJson(core.IDB_KEY, {}, {
                localFallbackKey: core.IDB_KEY,
                cleanupLocalKeys: [core.IDB_KEY]
            });
        }
    }

    /**
     * Get cache statistics.
     */
    function getStats() {
        return {
            memorySize: core.memoryCache.size,
            failureSize: core.failureCache.size,
            diskSize: core.diskCache ? Object.keys(core.diskCache).length : 0,
            diskLoaded: core.diskLoaded,
            queuedFetches: core.queuedFetches.length,
            renderMissFetchBudget: core.renderMissFetchBudget,
            startupPaintActive: isStartupPaintActive(),
            remoteFetchEnabled: canFetchRemoteFavicons()
        };
    }

    function handleImageError(image) {
        if (!image) return false;
        const key = normalizeDomain(image.dataset?.faviconDomain || image.dataset?.domain || '');
        const size = Number(image.dataset?.faviconSize || image.width || image.height || 32) || 32;
        const fallbackSrc = String(image.dataset?.fallbackSrc || '').trim() || getFallbackSrc(key, size);
        image.style.display = '';
        if (!fallbackSrc) return false;
        image.dataset.fallbackApplied = '1';
        image.onerror = null;
        if (image.src !== fallbackSrc) image.src = fallbackSrc;
        // Stored/manual icon URLs can fail before the domain favicon has been
        // hydrated. Recover in place instead of waiting for a tab switch or
        // dashboard rerender to request the cached/provider icon.
        if (key && !isReservedTestDomain(key) && !isFailureCoolingDown(key)) {
            void fetchAndCache(key, size).catch(function () {});
        }
        return true;
    }

    // Boot: hydrate disk cache, then recover icons that failed before this
    // deferred module was available. Restrict the pass to marked fallbacks so
    // large dashboards do not pay for a full image scan.
    const diskReady = loadDiskCache();

    window.EveFaviconCache = { get, getSrc, fetchAndCache, warmup, refreshRendered, clearAll, getStats, canFetchRemote: canFetchRemoteFavicons };
    window.EveFaviconUtils = window.EveFaviconUtils || {};
    Object.assign(window.EveFaviconUtils, {
        getDomainFromUrl,
        getSrc,
        getBestEffortSrc: getSrc,
        getFallbackSrc,
        buildPlaceholderSrc: getPlaceholderFavicon,
        buildRemoteUrl,
        isLocalContext,
        isReservedTestDomain,
        isReservedIconUrl,
        handleImageError
    });
    void diskReady.then(function () {
        return refreshRendered({
            fallbackOnly: true,
            maxFetch: 32,
            maxUpdate: core.MAX_DOM_ICON_UPDATES_PER_FLUSH
        });
    }).catch(function () {});
})();
