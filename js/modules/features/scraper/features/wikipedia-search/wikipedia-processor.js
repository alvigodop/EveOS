/**
 * Wikipedia Processor Module
 * 
 * Handles text processing and result generation for Wikipedia data.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WikipediaProcessor = window.WikipediaProcessor = {
        version: '1.0.0',
        _initialized: true
    };

    /**
     * Helper function to remove diacritical marks (ō→o, é→e, ñ→n, etc.)
     * @param {string} str - String to normalize
     * @returns {string} Normalized string without diacritics
     */
    WikipediaProcessor.removeDiacritics = function (str) {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    /**
     * Check if live data matches the query
     */
    WikipediaProcessor.isMatch = function (liveData, normalizedQuery) {
        if (!liveData) return false;
        return (liveData.extract && liveData.extract.toLowerCase().includes(normalizedQuery)) ||
            (liveData.title && liveData.title.toLowerCase().includes(normalizedQuery));
    };

    /**
     * Generate Main Entry Result
     */
    WikipediaProcessor.createMainEntryResult = function (entry, entryData, normalizedQuery, options) {
        const entryTitleLower = this.removeDiacritics(entry.title.toLowerCase());
        const mainUrl = entryData.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title.replace(/ /g, '_'))}`;

        if (entryTitleLower.includes(normalizedQuery)) {
            const contentType = entryData.contentType || 'Unknown';
            const categories = entryData.categories || [];

            // Note: Filter checks should be done by caller or here? 
            // The original logic checked filter *before* pushing to processedUrls for liveData, 
            // but for "3. Process Data" it checks filter inside.

            return {
                title: entry.title,
                snippet: `Article: ${entry.title}`,
                url: mainUrl,
                wiki_name: entry.name || entry.title,
                wiki_url: 'https://en.wikipedia.org',
                contentType: contentType,
                categories: categories,
                thumbnail: entryData.thumbnail,
                isMainArticle: true,
                matchScore: 100,
                source: 'wikipedia',
                fromCache: false,
                entryDataFromCache: entryData.entryDataFromCache || false, // Propagated from liveData or cache
                relatedTo: entry.title
            };
        }
        return null;
    };

    /**
     * Generate Content Matches (deep search inside extract)
     */
    WikipediaProcessor.findContentMatches = function (entry, entryData, normalizedQuery, options, processedUrls) {
        const results = [];
        const contentType = entryData.contentType || 'Unknown';
        const hideThis = (contentType === 'person' && options.hidePersons);

        if (entryData.extract && !hideThis) {
            const extractLower = this.removeDiacritics(entryData.extract.toLowerCase());
            let queryIndex = extractLower.indexOf(normalizedQuery);
            let matchCount = 0;
            const maxMatches = 10;
            const mainUrl = entryData.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title.replace(/ /g, '_'))}`;

            while (queryIndex !== -1 && matchCount < maxMatches) {
                const snippetStart = Math.max(0, queryIndex - 100);
                const snippetEnd = Math.min(entryData.extract.length, queryIndex + normalizedQuery.length + 100);
                let snippetText = entryData.extract.substring(snippetStart, snippetEnd);

                if (snippetStart > 0) {
                    const firstSpace = snippetText.indexOf(' ');
                    if (firstSpace > 0 && firstSpace < 20) {
                        snippetText = snippetText.substring(firstSpace + 1);
                    }
                    snippetText = '…' + snippetText;
                }
                if (snippetEnd < entryData.extract.length) {
                    const lastSpace = snippetText.lastIndexOf(' ');
                    if (lastSpace > snippetText.length - 20) {
                        snippetText = snippetText.substring(0, lastSpace);
                    }
                    snippetText = snippetText + '…';
                }

                const contextStart = Math.max(0, queryIndex - 30);
                const contextEnd = Math.min(entryData.extract.length, queryIndex + normalizedQuery.length + 30);
                let contextPhrase = entryData.extract.substring(contextStart, contextEnd);

                // Refine context phrase
                if (contextStart > 0) {
                    const firstSpace = contextPhrase.indexOf(' ');
                    if (firstSpace > 0 && firstSpace < 15) {
                        contextPhrase = contextPhrase.substring(firstSpace + 1);
                    }
                }
                if (contextEnd < entryData.extract.length) {
                    const lastSpace = contextPhrase.lastIndexOf(' ');
                    if (lastSpace > contextPhrase.length - 15 && lastSpace > 0) {
                        contextPhrase = contextPhrase.substring(0, lastSpace);
                    }
                }

                contextPhrase = contextPhrase.replace(/[()[\]{}]/g, '');
                const deepLinkUrl = `${mainUrl}#:~:text=${encodeURIComponent(contextPhrase)}`;

                if (!processedUrls.has(deepLinkUrl)) {
                    results.push({
                        title: entry.title,
                        snippet: snippetText,
                        url: deepLinkUrl,
                        wiki_name: entry.name || entry.title,
                        wiki_url: 'https://en.wikipedia.org',
                        contentType: contentType,
                        categories: entryData.categories || [],
                        thumbnail: entryData.thumbnail,
                        isMainArticle: false,
                        isTextMatch: true,
                        matchNumber: matchCount + 1,
                        matchScore: 90 - matchCount,
                        source: 'wikipedia',
                        fromCache: false,
                        entryDataFromCache: entryData.entryDataFromCache || false,
                        relatedTo: entry.title
                    });
                }

                matchCount++;
                queryIndex = extractLower.indexOf(normalizedQuery, queryIndex + 1);
            }

            if (matchCount > 0) {
                // Return matches for this entry
            }
        }
        return results;
    };

    /**
     * Find Linked Article Matches
     */
    WikipediaProcessor.findLinkedMatches = function (entry, entryData, normalizedQuery, options, processedUrls) {
        const results = [];
        if (entryData.links && Array.isArray(entryData.links)) {
            for (const linkTitle of entryData.links) {
                if (!linkTitle) continue;
                const linkTitleLower = this.removeDiacritics(linkTitle.toLowerCase());
                const linkUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(linkTitle.replace(/ /g, '_'))}`;

                if (processedUrls.has(linkUrl)) continue;

                if (linkTitleLower.includes(normalizedQuery)) {
                    const linkContentType = ModuleUtilities.inferContentTypeFromTitle(linkTitle, 'en.wikipedia.org');

                    if (options.hidePersons && (linkContentType === 'Real-Person' || linkContentType === 'person')) {
                        continue;
                    }

                    results.push({
                        title: linkTitle,
                        snippet: `Linked from: ${entry.title}`,
                        url: linkUrl,
                        wiki_name: 'Wikipedia',
                        wiki_url: 'https://en.wikipedia.org',
                        contentType: linkContentType,
                        categories: [],
                        isMainArticle: false,
                        matchScore: 50,
                        source: 'wikipedia',
                        fromCache: false,
                        entryDataFromCache: entryData.entryDataFromCache || false,
                        relatedTo: entry.title
                    });
                }
            }
        }
        return results;
    };

    // Register with ModuleRegistry
    if (window.ModuleRegistry) {
        ModuleRegistry.register('WikipediaProcessor', WikipediaProcessor);
    }

})();
