/**
 * Thumbnail Loader Module
 * 
 * Handles fetching and lazy-loading thumbnails for Wikipedia and Fandom results.
 */
const ThumbnailLoader = {};

/**
 * Initialize the module
 */
ThumbnailLoader.init = function () {
    console.log('ThumbnailLoader initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('ThumbnailLoader', ThumbnailLoader);
    }
};

/**
 * Fetch thumbnails for Wikipedia results in batches
 * @param {Array} results - Array of result objects to fetch thumbnails for
 * @returns {Promise<Array>} - Results with thumbnails populated
 */
ThumbnailLoader.fetchWikipediaThumbnails = async function (results) {
    const resultsToFetch = results.filter(result =>
        !result.thumbnail &&
        !result.image &&
        !result.hasImage &&
        (result.wiki_name === 'Wikipedia' || result.wiki_url?.includes('wikipedia.org'))
    );

    if (resultsToFetch.length === 0) return results;

    console.log(`ThumbnailLoader: Fetching thumbnails for ${resultsToFetch.length} Wikipedia results`);

    try {
        // Process in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < resultsToFetch.length; i += batchSize) {
            const batch = resultsToFetch.slice(i, i + batchSize);
            const titles = batch.map(result => result.title).join('|');

            const thumbnailUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=pageimages&pithumbsize=200&format=json&origin=*`;

            try {
                const response = await fetch(thumbnailUrl);
                if (!response.ok) continue;

                const data = await response.json();
                if (!data.query || !data.query.pages) continue;

                // Process each page
                Object.values(data.query.pages).forEach(page => {
                    if (page.thumbnail && page.thumbnail.source) {
                        // Find the corresponding result
                        const result = results.find(r => r.title === page.title);
                        if (result) {
                            result.thumbnail = page.thumbnail.source;
                            result.hasImage = true;
                        }
                    }
                });
            } catch (error) {
                console.warn('ThumbnailLoader: Error fetching thumbnails batch:', error);
            }
        }
    } catch (error) {
        console.warn('ThumbnailLoader: Error in thumbnail fetching:', error);
    }

    return results;
};

/**
 * Load thumbnails for Fandom results in the background (Lazy Loading)
 * Fetches thumbnails via Fandom API and updates the DOM directly
 * @param {Array} results - Array of result objects to fetch thumbnails for
 * @param {string} containerSelector - CSS selector for the results container
 * @returns {Promise<void>}
 */
ThumbnailLoader._fandomDomainCache = new Map(); // Cache promises or results

ThumbnailLoader.loadFandomThumbnails = async function (results, containerSelector = '#results') {
    const containerDiv = document.querySelector(containerSelector);
    if (!containerDiv) return;

    // Filter results that don't have thumbnails yet
    const resultsToLoad = results.filter(r =>
        (r.domain || r.url) &&
        !r.thumbnail &&
        !r.hasTriedThumbnail
    );

    if (resultsToLoad.length === 0) return;

    // Check environment - prevent spam on file:// if no proxy
    const isLocal = window.location.protocol === 'file:';
    const hasProxy = window.CorsProxyManager && CorsProxyManager.getProxyUrl;

    // If local and the proxy manager says proxies won't work (which it does on file://), 
    // and we are trying to hit Fandom APIs which notoriously dislike Origin: null, we should skip.
    // However, if the user has a local proxy server set up (rare), it might work.
    // Given the specific 404 errors observed, it's safer to skip or limit this on file://
    if (isLocal && (!hasProxy || (window.CorsProxyManager && window.CorsProxyManager.proxyStrategy === 'none'))) {
        console.warn('ThumbnailLoader: Skipping Fandom thumbnail fetch on file:// protocol (CORS restricted).');
        return;
    }

    console.log(`ThumbnailLoader: Lazy loading thumbnails for ${resultsToLoad.length} Fandom results`);

    for (const result of resultsToLoad) {
        result.hasTriedThumbnail = true;
        const domain = result.domain || new URL(result.url).hostname;

        // Deduplication: Don't fetch the same domain's wiki info 50 times
        if (ThumbnailLoader._fandomDomainCache.has(domain)) {
            // If already fetched (or fetching), use the cached result
            const cachedImage = await ThumbnailLoader._fandomDomainCache.get(domain);
            if (cachedImage) {
                ThumbnailLoader.applyFandomThumbnail(result, cachedImage, containerDiv);
            }
            continue;
        }

        // Start fetch and cache the promise to handle concurrent requests for same domain
        const fetchPromise = (async () => {
            try {
                // Fandom API for details - Note: 'Mercury' endpoint is legacy/undocumented.
                // If it frequently 404s, we should consider removing it or falling back.
                const apiUrl = `https://${domain}/api/v1/Mercury/Wiki/Details`;

                let fetchUrl = apiUrl;
                if (window.CORSProxyManager) {
                    fetchUrl = CORSProxyManager.getProxyUrl(apiUrl);
                }

                const response = await fetch(fetchUrl);
                if (!response.ok) {
                    // console.warn(`ThumbnailLoader: Failed to fetch for ${domain} (${response.status})`);
                    return null;
                }

                const data = await response.json();
                if (data.image) {
                    return data.image;
                }
            } catch (e) {
                // console.warn(`ThumbnailLoader: Error fetching for ${domain}`, e);
            }
            return null;
        })();

        ThumbnailLoader._fandomDomainCache.set(domain, fetchPromise);

        // Await the result and apply
        const image = await fetchPromise;
        if (image) {
            ThumbnailLoader.applyFandomThumbnail(result, image, containerDiv);
        }
    }
};

/**
 * Apply the found thumbnail to the result in the DOM
 */
ThumbnailLoader.applyFandomThumbnail = function (result, imageUrl, containerDiv) {
    result.thumbnail = imageUrl;
    result.hasImage = true;

    const link = containerDiv.querySelector(`a[href="${result.url}"]`);
    if (link) {
        const item = link.closest('.result-item, .search-result-item');
        if (item && !item.querySelector('.result-thumbnail')) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.className = 'result-thumbnail';
            // CRITICAL: Supress referrer to avoid Fandom hotlink protection (404/403 on localhost)
            img.referrerPolicy = 'no-referrer';
            img.style.maxWidth = '100px';
            img.style.maxHeight = '100px';
            img.style.objectFit = 'contain';

            item.insertBefore(img, item.firstChild);
            item.classList.add('has-thumbnail');
        }
    }
};

window.ThumbnailLoader = ThumbnailLoader;
