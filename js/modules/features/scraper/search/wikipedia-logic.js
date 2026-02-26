/**
 * Direct Search Wikipedia Logic Module
 * 
 * Handles pure logic for Wikipedia search, such as result filtering.
 * Part of the modularized DirectSearchWikipedia feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DirectSearchWikipedia = window.DirectSearchWikipedia;

    if (!DirectSearchWikipedia) {
        console.error('DirectSearchWikipedia Logic: Core module not loaded!');
        return;
    }

    /**
     * Filter Wikipedia search results to only show main articles
     * @param {Array} searchResults - Raw search results from Wikipedia API
     * @param {string} query - The original search query
     * @returns {Array} - Filtered and formatted results
     */
    DirectSearchWikipedia.filterWikipediaResults = function (searchResults, query) {
        // Format results first
        let results = searchResults.map(result => {
            return {
                title: result.title,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
                snippet: result.snippet,
                source: 'wikipedia',
                type: 'article'
            };
        });

        // Filter out non-main article content
        console.log(`Filtering ${results.length} Wikipedia results to only show main articles`);
        const filtered = results.filter(article => {
            const title = article.title.toLowerCase();
            const snippet = (article.snippet || '').toLowerCase();

            // Filter out lists
            if (title.startsWith('list of ') ||
                title.includes(' list') ||
                title.includes('(list)') ||
                /list\s+of\s+/i.test(title)) {
                console.log(`Filtering out list article: ${article.title}`);
                return false;
            }

            // Filter out episode guides, recaps, and episode-specific content
            if ((title.includes('episode') || title.includes('recap') || title.includes('review')) &&
                (title.includes('list') ||
                    title.includes('guide') ||
                    title.includes('season') ||
                    /s\d+e\d+/i.test(title) || // Season/Episode format like S01E01
                    /season\s+\d+/i.test(title) || // Season mention
                    /episode\s+\d+/i.test(title))) { // Episode mention
                console.log(`Filtering out episode content: ${article.title}`);
                return false;
            }

            // Filter out character lists and character pages
            if (title.includes('character') ||
                title.includes(' cast') ||
                title.includes('fictional ') ||
                title.match(/characters\s+(in|of|from)/i) ||
                (title.includes('character') && !title.includes('characteristics'))) {
                console.log(`Filtering out character content: ${article.title}`);
                return false;
            }

            // Filter out categories, disambiguations, and other non-article content
            if (title.includes('category:') ||
                title.includes('(disambiguation)') ||
                title.includes('portal:') ||
                title.includes('template:') ||
                title.includes('wikipedia:') ||
                title.includes('help:') ||
                title.includes('list of') ||
                title.includes('index of')) {
                console.log(`Filtering out non-article content: ${article.title}`);
                return false;
            }

            // Filter out specific prefixes that indicate non-main articles
            const nonMainPrefixes = ['timeline of', 'history of', 'development of', 'production of', 'making of'];
            if (nonMainPrefixes.some(prefix => title.startsWith(prefix))) {
                console.log(`Filtering out prefixed non-main article: ${article.title}`);
                return false;
            }

            // Filter out specific items about the article but not the main topic
            if (title.includes(' in popular culture') ||
                title.includes(' soundtrack') ||
                title.includes(' music') ||
                title.includes(' discography') ||
                title.includes(' reception') ||
                title.includes(' controversy') ||
                title.includes(' fan ') ||
                title.includes(' fandom')) {
                console.log(`Filtering out derivative article: ${article.title}`);
                return false;
            }

            // Filter out specific types of content often confused with main articles
            if (title.endsWith(' series') ||
                title.endsWith(' franchise') ||
                title.endsWith(' universe') ||
                title.includes(' episodes') ||
                title.includes(' locations') ||
                title.includes(' places') ||
                title.includes(' characters')) {
                // Only filter if these aren't the primary topic
                if (!title.startsWith(query.toLowerCase())) {
                    console.log(`Filtering out related media content: ${article.title}`);
                    return false;
                }
            }

            // More strict filtering for:
            // 1. Season-specific articles
            if (/season\s+\d+/i.test(title) ||
                /\(\s*season\s+\d+\s*\)/i.test(title) ||
                /series\s+\d+/i.test(title)) {
                console.log(`Filtering out season-specific article: ${article.title}`);
                return false;
            }

            // 2. Episode-specific articles
            if (/episode\s+\d+/i.test(title) ||
                /chapter\s+\d+/i.test(title) ||
                /part\s+\d+\s+of/i.test(title)) {
                console.log(`Filtering out episode-specific article: ${article.title}`);
                return false;
            }

            return true;
        });

        console.log(`Filtered out ${results.length - filtered.length} non-main articles, returning ${filtered.length} articles`);

        // If we filtered too much, add back the best match
        if (filtered.length === 0 && results.length > 0) {
            console.log('All results were filtered out, adding back the most relevant result');

            // Get simple titles first if possible (they're usually main topics)
            const simpleResults = results.filter(r =>
                !r.title.includes('(') &&
                !r.title.includes(':') &&
                r.title.split(' ').length <= 3);

            if (simpleResults.length > 0) {
                return [simpleResults[0]];
            }

            return [results[0]];
        }

        return filtered;
    };

})();
