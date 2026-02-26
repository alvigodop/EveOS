/**
 * Fandom Search API - Search Component
 * Handles search strategies for finding articles on Fandom wikis.
 */
(function () {
    'use strict';

    const FSASearch = {
        /**
         * Fetch live search results from a Fandom domain API
         * @param {string} domain - The Fandom domain (e.g., onepiece.fandom.com)
         * @param {string} query - The search term
         * @returns {Promise<Array>} Promise resolving to an array of search result objects
         */
        fetchLiveFandomDomainSearch: async function (domain, query) {
            console.log(`FSASearch: Domain: ${domain}, Query: ${query}`);

            const allResults = [];
            const seenTitles = new Set();

            const addResults = (items) => {
                for (const item of items) {
                    const normalizedTitle = item.title.toLowerCase();
                    if (!seenTitles.has(normalizedTitle)) {
                        seenTitles.add(normalizedTitle);
                        allResults.push({
                            title: item.title,
                            snippet: item.snippet ? item.snippet.replace(/<\/?(?:span|div)[^>]*>/g, '').replace(/<\/?[^>]+(?:>|$)/g, '') : 'No snippet available',
                            url: `https://${domain}/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
                        });
                    }
                }
            };

            // Strategy 1: Standard full-text search
            try {
                const searchUrl = `https://${domain}/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=50`;
                const response = await CORSProxyManager.fetch(searchUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.query?.search?.length > 0) {
                        console.log(`Standard search found ${data.query.search.length} results`);
                        addResults(data.query.search);
                    }
                }
            } catch (e) {
                console.warn(`Standard search failed for ${domain}:`, e.message);
            }

            // Strategy 2: Wildcard prefix search
            try {
                const wildcardUrl = `https://${domain}/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}*&format=json&origin=*&srlimit=50`;
                const response = await CORSProxyManager.fetch(wildcardUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.query?.search?.length > 0) {
                        console.log(`Wildcard search found ${data.query.search.length} results`);
                        addResults(data.query.search);
                    }
                }
            } catch (e) {
                console.warn(`Wildcard search failed for ${domain}:`, e.message);
            }

            // Strategy 3: Prefix search
            try {
                const prefixUrl = `https://${domain}/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(query)}&format=json&origin=*&pslimit=50`;
                const response = await CORSProxyManager.fetch(prefixUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.query?.prefixsearch?.length > 0) {
                        console.log(`Prefix search found ${data.query.prefixsearch.length} results`);
                        addResults(data.query.prefixsearch.map(item => ({ title: item.title, snippet: '' })));
                    }
                }
            } catch (e) {
                console.warn(`Prefix search failed for ${domain}:`, e.message);
            }

            // Strategy 4: Insource regex search for SUBSTRING matching
            if (query.length >= 2) {
                try {
                    const insourceUrl = `https://${domain}/api.php?action=query&list=search&srsearch=insource:/${encodeURIComponent(query)}/i&format=json&origin=*&srlimit=30`;
                    const response = await CORSProxyManager.fetch(insourceUrl);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.query?.search?.length > 0) {
                            console.log(`Insource search found ${data.query.search.length} results`);
                            addResults(data.query.search);
                        }
                    }
                } catch (e) {
                    console.warn(`Insource search failed for ${domain}:`, e.message);
                }
            }

            // Strategy 5: Title-only search with intitle:
            try {
                const intitleUrl = `https://${domain}/api.php?action=query&list=search&srsearch=intitle:${encodeURIComponent(query)}&format=json&origin=*&srlimit=50`;
                const response = await CORSProxyManager.fetch(intitleUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.query?.search?.length > 0) {
                        console.log(`Intitle search found ${data.query.search.length} results`);
                        addResults(data.query.search);
                    }
                }
            } catch (e) {
                console.warn(`Intitle search failed for ${domain}:`, e.message);
            }

            console.log(`FSASearch: Total unique results for "${query}" on ${domain}: ${allResults.length}`);
            return allResults;
        }
    };

    window.FSASearch = FSASearch;
})();
