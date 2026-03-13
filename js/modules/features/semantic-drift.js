// --- SEMANTIC DRIFT ENGINE ---
window.EveSemanticDrift = window.EveSemanticDrift || {};

(function(ns) {
    const CACHE_KEY = 'eveos_drift_cache';
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    let driftCache = null;

    function getCache() {
        if (driftCache) return driftCache;
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            driftCache = raw ? JSON.parse(raw) : {};
        } catch (e) {
            driftCache = {};
        }
        return driftCache;
    }

    function saveCache() {
        if (!driftCache) return;
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(driftCache));
        } catch (e) {
            console.warn('[SemanticDrift] Failed to save cache', e);
        }
    }

    function isFresh(entry) {
        if (!entry || !entry.checkedAt) return false;
        return (Date.now() - entry.checkedAt) < TTL_MS;
    }

    // Normalizes URLs for comparison
    function normalizeHost(urlStr) {
        try {
            return new URL(urlStr).hostname.replace(/^www\./, '');
        } catch (e) {
            return '';
        }
    }

    // A lightweight string distance check to see if title changed significantly
    function isMeaningfulTitleDrift(oldTitle, newTitle) {
        if (!oldTitle || !newTitle) return false;
        const s1 = oldTitle.trim().toLowerCase();
        const s2 = newTitle.trim().toLowerCase();
        if (s1 === s2) return false;
        // If one is just a small substring of the other, maybe not a full drift, but let's be strict for now.
        // For EveOS ghost folders, we want to know if it changed entirely (e.g. Putlocker -> BetaSeries)
        // If they share less than 30% words, it's a drift.
        const words1 = s1.split(/\W+/).filter(w => w.length > 2);
        const words2 = s2.split(/\W+/).filter(w => w.length > 2);

        let matches = 0;
        words1.forEach(w => { if (words2.includes(w)) matches++; });
        const maxWords = Math.max(words1.length, words2.length);

        if (maxWords === 0) return true; // Only short words changed?
        const overlap = matches / maxWords;
        return overlap < 0.4; // Less than 40% overlap = drift
    }

    async function checkLink(link) {
        if (!link || !link.url || link.url.startsWith('javascript:') || link.url === '#') return;

        const cache = getCache();
        if (cache[link.url] && isFresh(cache[link.url])) {
            return; // Still fresh
        }

        const result = {
            checkedAt: Date.now(),
            status: 'ok', // 'ok', 'dead', 'redirected', 'cors-blocked', 'error'
            liveTitle: null,
            redirectTarget: null,
            hasTitleDrift: false
        };

        try {
            // First, do a HEAD request to check basic health and redirects without downloading body
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            let headRes;
            try {
                headRes = await fetch(link.url, {
                    method: 'HEAD',
                    redirect: 'follow',
                    signal: controller.signal
                });
                clearTimeout(timeout);
            } catch (headErr) {
                clearTimeout(timeout);
                // If HEAD fails, it might be CORS or just a server that blocks HEAD.
                // We'll fallback to a GET request below.
            }

            if (headRes && !headRes.ok && headRes.status >= 400) {
                result.status = 'dead';
                cache[link.url] = result;
                return;
            }

            if (headRes && headRes.url && headRes.url !== link.url) {
                const origHost = normalizeHost(link.url);
                const newHost = normalizeHost(headRes.url);
                if (origHost && newHost && origHost !== newHost) {
                    result.status = 'redirected';
                    result.redirectTarget = headRes.url;
                }
            }

            // Now do a GET request to parse title and OGP data (for Phantom Peek)
            const getController = new AbortController();
            const getTimeout = setTimeout(() => getController.abort(), 5000);

            const getRes = await fetch(link.url, {
                method: 'GET',
                signal: getController.signal,
                headers: { 'Accept': 'text/html' }
            });
            clearTimeout(getTimeout);

            if (!getRes.ok) {
                 if (getRes.status === 404 || getRes.status >= 500) {
                     result.status = 'dead';
                 }
            } else {
                const text = await getRes.text();
                // Extremely naive but fast regex parsing for title and some meta tags
                const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    const decodedTitle = titleMatch[1].replace(/&#?\w+;/g, match => {
                        const el = document.createElement('textarea');
                        el.innerHTML = match;
                        return el.value;
                    }).trim();

                    result.liveTitle = decodedTitle;
                    if (link.title && isMeaningfulTitleDrift(link.title, decodedTitle)) {
                        result.hasTitleDrift = true;
                    }
                }

                // Try to grab OGP Image for phantom peek
                const ogImageMatch = text.match(/<meta\s+(?:property="og:image"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:image")/i);
                if (ogImageMatch) {
                    result.ogImage = ogImageMatch[1] || ogImageMatch[2];
                }

                const ogDescMatch = text.match(/<meta\s+(?:property="og:description"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:description")/i);
                if (ogDescMatch) {
                    result.ogDesc = ogDescMatch[1] || ogDescMatch[2];
                }
            }

        } catch (e) {
            // If it's an abort, it timed out
            if (e.name === 'AbortError') {
                result.status = 'dead'; // or timeout
            } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                // High probability of CORS block if it's a cross-origin request
                result.status = 'cors-blocked';
            } else {
                result.status = 'error';
            }
        }

        cache[link.url] = result;
    }

    async function runBackgroundScan(links) {
        if (!Array.isArray(links)) return;
        console.log(`[SemanticDrift] Starting background scan for ${links.length} links...`);

        // Process in small batches so we don't nuke the network stack
        const BATCH_SIZE = 5;
        for (let i = 0; i < links.length; i += BATCH_SIZE) {
            const batch = links.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(batch.map(checkLink));
            saveCache(); // Save incrementally
            // tiny sleep to let UI breathe
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`[SemanticDrift] Scan complete.`);
    }

    ns.startEngine = function() {
        // Wait for dashboard to finish initial render
        setTimeout(() => {
            const allLinks = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
            runBackgroundScan(allLinks);
        }, 5000);
    };

    ns.forceRefreshScan = function() {
        driftCache = {};
        localStorage.removeItem(CACHE_KEY);
        ns.startEngine();
        if (typeof showToast === 'function') showToast('Semantic Drift Scan restarting...', 'info');
    };

    ns.getHealthInfo = function(url) {
        const cache = getCache();
        return cache[url] || null;
    };

    // Auto-start on load if EveOS is ready
    if (document.readyState === 'complete') {
        ns.startEngine();
    } else {
        window.addEventListener('load', () => ns.startEngine());
    }

})(window.EveSemanticDrift);
