/**
 * Wikipedia Discovery Media
 * Handles fetching thumbnails and images
 */
(function () {
    if (typeof window.WDMedia === 'undefined') {
        window.WDMedia = {
            initialized: false,

            init: function () {
                this.initialized = true;
                return this;
            },

            fetchThumbnails: async function (results) {
                if (!results || !Array.isArray(results)) return [];

                // Filter results that need thumbnails
                const resultsToFetch = results.filter(result =>
                    !result.thumbnail &&
                    !result.image &&
                    !result.hasImage &&
                    (
                        result.wiki_name === 'Wikipedia' ||
                        result.source === 'wikipedia' ||
                        (result.source === 'live' && result.url && result.url.includes('wikipedia.org')) ||
                        (result.source === 'cache' && result.url && result.url.includes('wikipedia.org')) ||
                        (result.wiki_url && result.wiki_url.includes('wikipedia.org')) ||
                        (result.url && result.url.includes('wikipedia.org'))
                    )
                );

                if (resultsToFetch.length === 0) return results;

                console.log(`WDMedia: Fetching thumbnails for ${resultsToFetch.length} results`);

                try {
                    // Process in batches
                    const batchSize = 50;
                    for (let i = 0; i < resultsToFetch.length; i += batchSize) {
                        const batch = resultsToFetch.slice(i, i + batchSize);
                        const titles = batch.map(result => result.title).join('|');

                        const thumbnailUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=250&pilicense=any&redirects=1&exintro=1&explaintext=1&exchars=300&format=json&origin=*`;

                        try {
                            // Use CORSProxyManager if available
                            const fetcher = (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function')
                                ? CORSProxyManager.fetch
                                : fetch;

                            const response = await fetcher(thumbnailUrl);
                            if (!response.ok) continue;

                            const data = await response.json();
                            if (!data.query || !data.query.pages) continue;

                            // Process each page
                            Object.values(data.query.pages).forEach(page => {
                                // Find result by title (handle redirects and case insensitivity)
                                let result = results.find(r =>
                                    r.title === page.title ||
                                    (r.title && r.title.toLowerCase() === page.title.toLowerCase())
                                );

                                // If not found by direct title, check redirects
                                if (!result && data.query.redirects) {
                                    const redirect = data.query.redirects.find(r => r.to === page.title);
                                    if (redirect) {
                                        result = results.find(r =>
                                            r.title === redirect.from ||
                                            (r.title && r.title.toLowerCase() === redirect.from.toLowerCase())
                                        );
                                    }
                                }

                                if (result) {
                                    // Update thumbnail
                                    if (page.thumbnail && page.thumbnail.source) {
                                        console.log(`WDMedia: Found thumbnail for ${page.title}: ${page.thumbnail.source}`);
                                        result.thumbnail = page.thumbnail.source;
                                        result.hasImage = true;
                                        result.image = page.thumbnail.source;
                                    }

                                    // Update description/snippet if available
                                    if (page.extract) {
                                        const cleanExtract = page.extract.replace(/\n/g, ' ').trim();
                                        if (cleanExtract && (!result.description || result.description.includes('Wikipedia article about') || result.description.includes('Linked from:'))) {
                                            result.description = cleanExtract;
                                            result.snippet = cleanExtract;
                                        }
                                    }
                                }
                            });
                        } catch (error) {
                            console.warn('WDMedia: Error fetching batch thumbnails:', error);
                        }

                        // Add a small delay between batches
                        if (i + batchSize < resultsToFetch.length) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                } catch (error) {
                    console.warn('WDMedia: Error in thumbnail fetching:', error);
                }

                return results;
            }
        };
    }
})();
