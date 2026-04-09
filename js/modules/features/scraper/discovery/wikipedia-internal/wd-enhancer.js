/**
 * Wikipedia Discovery Enhancer
 * Handles smart result enhancement
 */
(function () {
    if (typeof window.WDEnhancer === 'undefined') {
        window.WDEnhancer = {
            initialized: false,

            init: function () {
                this.initialized = true;
                return this;
            },

            enhanceResults: async function (results, searchTerm) {
                // Only enhance if we have few results or no main article
                if (results.length > 5 && results.some(r => r.isMainArticle)) {
                    return results;
                }

                // Check availability of smart dedup toggle (User Preference)
                const smartDedupToggle = document.getElementById('smartDedupToggle');
                // If toggle exists and is unchecked, disable enhancement
                if (smartDedupToggle && !smartDedupToggle.checked) {
                    console.log('WDEnhancer: Smart linking disabled per user preference');
                    return results;
                }

                console.log('WDEnhancer: Enhancing results with web data for:', searchTerm);

                try {
                    const searchQuery = `${searchTerm} wiki information`;
                    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchQuery)}&limit=5&namespace=0&format=json&origin=*`;

                    const data = (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function')
                        ? await (await CORSProxyManager.fetch(url)).json()
                        : (typeof window.EveOS?.API?.Core?.fetchWikimediaJson === 'function'
                            ? await window.EveOS.API.Core.fetchWikimediaJson(url)
                            : await (await fetch(url)).json());

                    // OpenSearch returns [query, titles, descriptions, urls]
                    if (data && data[1] && data[1].length > 0) {
                        const newResults = [];
                        for (let i = 0; i < data[1].length; i++) {
                            const title = data[1][i];
                            const description = data[2][i] || '';
                            const url = data[3][i] || '';

                            // Skip if duplicates
                            if (results.some(r => r.title === title || r.url === url)) continue;

                            newResults.push({
                                title: title,
                                snippet: description || `Information about ${title}`,
                                description: description,
                                url: url,
                                wiki_name: 'Wikipedia',
                                source: 'wikipedia',
                                isWebEnhanced: true,
                                isMainArticle: (title.toLowerCase() === searchTerm.toLowerCase())
                            });
                        }

                        if (newResults.length > 0) {
                            console.log('WDEnhancer: Added enhanced results:', newResults.length);
                            return [...results, ...newResults];
                        }
                    }
                } catch (error) {
                    console.warn('WDEnhancer: Error enhancing results:', error);
                }

                return results;
            }
        };
    }
})();
