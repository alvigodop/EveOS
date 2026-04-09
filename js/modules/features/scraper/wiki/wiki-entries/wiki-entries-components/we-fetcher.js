/**
 * Wiki Entries - Fetcher
 * Handles Wikipedia API data fetching and image resolution
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WEFetcher = {
        version: '1.0.0',

        init: function () {
            console.log('WEFetcher initialized');
            return this;
        },

        /**
         * Fetch data for a Wikipedia entry (mostly for the image)
         * @param {string} title - The title to update
         * @param {Function} onSuccess - Callback with fetched data
         */
        fetchWikipediaData: async function (title, onSuccess) {
            console.log(`WEFetcher: Fetching data for Wikipedia: ${title}`);
            const fetchWikipediaJson = window.EveOS?.API?.Core?.fetchWikimediaJson;

            // Stage 1: Standard API call (pageimages)
            let url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|categories|pageimages&exintro=1&pithumbsize=300&redirects=1&pilicense=any&format=json&origin=*`;

            try {
                let data = typeof fetchWikipediaJson === 'function'
                    ? await fetchWikipediaJson(url)
                    : await (await fetch(url)).json();
                let page = Object.values(data.query?.pages || {})[0];

                if (!page || page.missing) {
                    console.warn(`WEFetcher: Page not found for ${title}`);
                    return null;
                }

                // Canonical title (after redirects)
                const canonicalTitle = page.title;
                let imageUrl = page.thumbnail ? page.thumbnail.source : null;

                // Stage 2: Fallback if no thumbnail found (Scan page images)
                if (!imageUrl) {
                    imageUrl = await this.findFallbackImage(canonicalTitle);
                }

                const result = {
                    title: canonicalTitle,
                    originalTitle: title,
                    snippet: page.extract,
                    imageUrl: imageUrl,
                    lastUpdate: new Date().toISOString()
                };

                if (onSuccess) {
                    onSuccess(result);
                }

                return result;

            } catch (e) {
                console.error(`WEFetcher: Error updating Wikipedia data for ${title}:`, e);
                return null;
            }
        },

        /**
         * Find a fallback image by scanning page images
         * @param {string} canonicalTitle - The canonical page title
         * @returns {Promise<string|null>} - Image URL or null
         */
        findFallbackImage: async function (canonicalTitle) {
            console.log(`WEFetcher: No thumbnail, trying fallback image scan...`);
            try {
                // Fetch list of images on the page
                const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(canonicalTitle)}&prop=images&imlimit=20&format=json&origin=*`;
                const fetchWikipediaJson = window.EveOS?.API?.Core?.fetchWikimediaJson;
                const imgData = typeof fetchWikipediaJson === 'function'
                    ? await fetchWikipediaJson(imagesUrl)
                    : await (await fetch(imagesUrl)).json();
                const imgPage = Object.values(imgData.query?.pages || {})[0];

                if (imgPage && imgPage.images && imgPage.images.length > 0) {
                    // Filter images to find a good candidate
                    const badKeywords = ['icon', 'logo_sh', 'stip', 'pixel', 'magnify', 'ambox', 'stub', 'symbol', 'flag', 'question', 'folder', 'increase', 'decrease', 'commons-logo', 'wikiquote'];
                    const candidate = imgPage.images.find(img => {
                        const name = img.title.toLowerCase();
                        if (!name.endsWith('.jpg') && !name.endsWith('.png') && !name.endsWith('.jpeg') && !name.endsWith('.svg')) return false;
                        return !badKeywords.some(kw => name.includes(kw));
                    });

                    if (candidate) {
                        return await this.resolveImageUrl(candidate.title);
                    }
                }
            } catch (fallbackError) {
                console.warn('WEFetcher: Fallback image fetch failed:', fallbackError);
            }
            return null;
        },

        /**
         * Resolve URL for an image file
         * @param {string} imageTitle - The file title (e.g., "File:Example.jpg")
         * @returns {Promise<string|null>} - Resolved image URL or null
         */
        resolveImageUrl: async function (imageTitle) {
            console.log(`WEFetcher: Found candidate image: ${imageTitle}`);
            try {
                const fileUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(imageTitle)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
                const fetchWikipediaJson = window.EveOS?.API?.Core?.fetchWikimediaJson;
                const fileData = typeof fetchWikipediaJson === 'function'
                    ? await fetchWikipediaJson(fileUrl)
                    : await (await fetch(fileUrl)).json();
                const filePage = Object.values(fileData.query?.pages || {})[0];

                if (filePage && filePage.imageinfo && filePage.imageinfo[0] && filePage.imageinfo[0].url) {
                    const url = filePage.imageinfo[0].url;
                    console.log(`WEFetcher: Resolved fallback image URL: ${url}`);
                    return url;
                }
            } catch (error) {
                console.warn('WEFetcher: Image URL resolution failed:', error);
            }
            return null;
        }
    };

    // Expose globally
    window.WEFetcher = WEFetcher;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WEFetcher', WEFetcher);
    }
})();
