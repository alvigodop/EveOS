/**
 * Wikipedia Discovery - Direct Mode
 * Handles searching Wikipedia using the direct PHP API (client-side)
 */
(function () {
    if (typeof window.WDSearchDirect === 'undefined') {
        window.WDSearchDirect = {
            search: function (query, callback) {
                console.log('WDSearchDirect: Using direct fetch for discovery with query:', query);

                if (typeof callback !== 'function') {
                    console.error('WDSearchDirect: No valid callback provided.');
                    return;
                }

                const wikipediaUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${query}&limit=10&namespace=0&format=json&origin=*`;

                const fetchWikimediaResponse = window.EveOS?.API?.Core?.fetchWikimediaResponse;
                const fetchPromise = (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function')
                    ? CORSProxyManager.fetch(wikipediaUrl)
                    : (typeof fetchWikimediaResponse === 'function'
                        ? fetchWikimediaResponse(wikipediaUrl)
                        : fetch(wikipediaUrl));

                fetchPromise
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        this._processResults(data, callback);
                    })
                    .catch(error => {
                        console.error('WDSearchDirect: Direct API request failed:', error);
                        callback([]);
                    });
            },

            _processResults: function (data, callback) {
                try {
                    if (!Array.isArray(data) || data.length < 3) {
                        console.error('WDSearchDirect: Invalid data format from Wikipedia API');
                        callback && callback([]);
                        return;
                    }

                    const titles = data[1] || [];
                    const urls = data[3] || [];
                    const descriptions = data[2] || [];

                    const results = titles.map((title, i) => {
                        return {
                            title: title,
                            url: urls[i] || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
                            description: descriptions[i] || `Wikipedia article about ${title}`,
                            source: 'wikipedia',
                            icon: 'https://en.wikipedia.org/favicon.ico',
                            wiki_name: 'Wikipedia',
                            isMainArticle: false
                        };
                    });

                    console.log('WDSearchDirect: Found ' + results.length + ' results');
                    callback && callback(results);
                } catch (error) {
                    console.error('WDSearchDirect: Error processing results', error);
                    callback && callback([]);
                }
            }
        };
    }
})();
