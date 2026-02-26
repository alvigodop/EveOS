/**
 * Direct Search Fandom Logic Module
 * 
 * Orchestrates various Fandom search strategies (Module, Proxy, Discovery, Fallback).
 * Part of the modularized DirectSearchFandom feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DirectSearchFandom = window.DirectSearchFandom;

    if (!DirectSearchFandom) {
        console.error('DirectSearchFandom Logic: Core module not loaded!');
        return;
    }

    /**
     * Search Fandom directly using multiple methods
     * @param {string} query - The search query
     * @returns {Promise<Array>} - A promise resolving to an array of search results
     */
    DirectSearchFandom.searchFandom = async function (query) {
        console.log('Performing direct Fandom search for:', query);
        let results = [];

        // 1. First try using FandomSearch module if available
        if (window.FandomSearch && typeof FandomSearch.search === 'function') {
            try {
                console.log('Using FandomSearch module');
                results = await FandomSearch.search(query);
                if (results && results.length > 0) {
                    console.log(`Found ${results.length} results using FandomSearch module`);
                    return results;
                }
            } catch (error) {
                console.error('Error using FandomSearch module:', error);
            }
        }

        // 2. Try using CORSProxyManager for Fandom search
        if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
            try {
                console.log('Using CORSProxyManager for Fandom search');
                const fandomSearchUrl = `https://www.fandom.com/search?q=${encodeURIComponent(query)}`;

                const response = await CORSProxyManager.fetch(fandomSearchUrl, {
                    cache: 'no-store'
                });

                const html = await response.text();

                // Simple parsing of search results from HTML
                const results = [];

                // Parse wiki cards from HTML
                const wikiCardMatches = html.match(/<a\s+class="wiki-card[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];

                wikiCardMatches.forEach(cardHtml => {
                    const urlMatch = cardHtml.match(/href="([^"]+)"/i);
                    const nameMatch = cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
                    const descMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                    const imgMatch = cardHtml.match(/src="([^"]+)"/i);

                    if (urlMatch && nameMatch) {
                        const url = urlMatch[1];
                        const domain = url.replace(/^https?:\/\//, '').split('/')[0];

                        results.push({
                            title: nameMatch[1].replace(/<[^>]+>/g, '').trim(),
                            url: url,
                            domain: domain,
                            snippet: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : `Fandom wiki related to ${query}`,
                            thumbnail: imgMatch ? imgMatch[1] : null,
                            source: 'fandom',
                            type: 'wiki'
                        });
                    }
                });

                if (results.length > 0) {
                    console.log(`Found ${results.length} Fandom wikis using CORSProxyManager`);
                    return results;
                }
            } catch (proxyError) {
                console.warn('CORSProxyManager failed for Fandom search:', proxyError);
            }
        }

        // 3. Try the Discovery module if available
        if (window.Discovery && typeof Discovery.findWikis === 'function') {
            try {
                console.log('Using Discovery module for Fandom search');
                results = await Discovery.findWikis(query);
                if (results && results.length > 0) {
                    console.log(`Found ${results.length} results using Discovery module`);
                    return results;
                }
            } catch (error) {
                console.error('Error using Discovery module:', error);
            }
        }

        // 4. Try to search in popular wikis
        if (window.PopularWikis && window.PopularWikis.getPopularWikis) {
            try {
                const popularWikis = window.PopularWikis.getPopularWikis();
                const matchingWikis = popularWikis.filter(wiki =>
                    wiki.name.toLowerCase().includes(query.toLowerCase()) ||
                    wiki.domain.toLowerCase().includes(query.toLowerCase())
                );

                if (matchingWikis.length > 0) {
                    console.log(`Found ${matchingWikis.length} matches in popular wikis`);
                    return matchingWikis.map(wiki => ({
                        title: wiki.name,
                        url: wiki.url || `https://${wiki.domain}`,
                        domain: wiki.domain,
                        snippet: wiki.description || `Fandom wiki for ${wiki.name}`,
                        source: 'fandom',
                        type: 'wiki',
                        fromPopular: true
                    }));
                }
            } catch (error) {
                console.error('Error searching popular wikis:', error);
            }
        }

        // 5. Bing search fallback - try scraping Bing for Fandom results (toggleable)
        if (this.performBingFallback) {
            const bingResults = await this.performBingFallback(query);
            if (bingResults && bingResults.length > 0) {
                return bingResults;
            }
        }

        // Last resort: Generate some likely domain names and fallback search options
        console.log('Using fallback options for Fandom search');
        const domainSuggestions = [
            `${query.toLowerCase().replace(/\s+/g, '')}.fandom.com`,
            `${query.toLowerCase().replace(/\s+/g, '-')}.fandom.com`
        ];

        return [
            ...domainSuggestions.map(domain => ({
                title: `${query} Wiki (Suggested)`,
                url: `https://${domain}`,
                domain: domain,
                snippet: `Suggested Fandom wiki for ${query}`,
                source: 'fandom',
                type: 'wiki',
                suggested: true
            })),
            {
                title: `Search for "${query}" on Fandom.com`,
                url: `https://www.fandom.com/search?q=${encodeURIComponent(query)}`,
                snippet: 'Click to search on Fandom.com',
                source: 'fandom',
                type: 'search',
                fallback: true
            }
        ];
    };

})();
