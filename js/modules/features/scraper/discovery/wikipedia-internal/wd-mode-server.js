/**
 * Wikipedia Discovery - Server Mode
 * Handles searching Wikipedia using the local node server
 */
(function () {
    if (typeof window.WDSearchServer === 'undefined') {
        window.WDSearchServer = {
            search: function (query, callback) {
                console.log('WDSearchServer: Using server mode for discovery with query:', query);

                if (typeof callback !== 'function') {
                    console.error('WDSearchServer: No valid callback provided.');
                    return;
                }

                // Use localhost server
                const serverUrl = `http://localhost:3000/api/wikipedia/search?q=${encodeURIComponent(query)}`;

                fetch(serverUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Server error! Status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        // Server returns different format, process it
                        if (data && data.results && Array.isArray(data.results)) {
                            const results = data.results.map(item => ({
                                title: item.title,
                                url: item.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                                description: item.description || item.snippet || `Wikipedia article about ${item.title}`,
                                source: 'wikipedia',
                                icon: 'https://en.wikipedia.org/favicon.ico',
                                wiki_name: 'Wikipedia',
                                thumbnail: item.thumbnail || item.image,
                                isMainArticle: false
                            }));
                            console.log('WDSearchServer: Server returned ' + results.length + ' results');
                            callback(results);
                        } else if (Array.isArray(data)) {
                            // Handle OpenSearch-style response from server
                            // We can delegate to Direct's processor if available, or duplicate logic
                            if (window.WDSearchDirect && typeof WDSearchDirect._processResults === 'function') {
                                WDSearchDirect._processResults(data, callback);
                            } else {
                                this._processOpenSearchData(data, callback);
                            }
                        } else {
                            console.warn('WDSearchServer: Unexpected server response format');
                            callback([]);
                        }
                    })
                    .catch(error => {
                        console.error('WDSearchServer: Server request failed:', error);
                        console.log('WDSearchServer: Falling back to direct API...');
                        // Fallback to direct mode if available
                        if (window.WDSearchDirect && typeof WDSearchDirect.search === 'function') {
                            WDSearchDirect.search(encodeURIComponent(query), callback);
                        } else {
                            callback([]);
                        }
                    });
            },

            _processOpenSearchData: function (data, callback) {
                // Simplified duplicate of Direct's logic for standalone safety
                try {
                    const titles = data[1] || [];
                    const urls = data[3] || [];
                    const descriptions = data[2] || [];
                    const results = titles.map((title, i) => ({
                        title: title,
                        url: urls[i],
                        description: descriptions[i],
                        source: 'wikipedia'
                    }));
                    callback(results);
                } catch (e) {
                    callback([]);
                }
            }
        };
    }
})();
