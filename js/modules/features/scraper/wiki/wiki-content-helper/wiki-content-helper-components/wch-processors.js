/**
 * Wiki Content Helper - Processors
 * Logic for extracting information from wiki content
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WCHProcessors = {
        version: '1.0.0',

        init: function () {
            console.log('WCHProcessors initialized');
            return this;
        },

        /**
         * Extract character aliases from wiki content
         */
        getCharacterAliases: async function (wiki, title, preFetchedContent = null, fetchCallback = null) {
            try {
                let content = preFetchedContent;

                // If content wasn't passed, fetch it via callback or direct fetch if available
                if (!content) {
                    if (typeof fetchCallback === 'function') {
                        content = await fetchCallback(wiki, title);
                    } else if (window.WCHApi && typeof WCHApi.fetchPageContent === 'function') {
                        content = await WCHApi.fetchPageContent(wiki, title);
                    } else {
                        // Fallback to direct fetch similar to original
                        const pageUrl = `https://${wiki.domain}/api.php?action=query&prop=revisions&titles=${encodeURIComponent(title)}&rvprop=content&format=json&origin=*`;
                        let response;
                        if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                            response = await CORSProxyManager.fetch(pageUrl);
                        } else {
                            response = await fetch(pageUrl);
                        }
                        const data = await response.json();
                        const pages = data.query?.pages || {};
                        content = Object.values(pages)[0]?.revisions?.[0]?.['*'] || '';
                    }
                }

                const aliases = new Set([title.toLowerCase()]);

                // Regex patterns for finding aliases (Infobox/Text analysis)
                const patterns = [
                    /\|\s*name\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*alias(?:es)?\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*other[\s_]names?\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*nickname\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*full[\s_]name\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*japanese[\s_]name\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*english[\s_]name\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*real[\s_]name\s*=\s*([^|\n{}]+)/gi,
                    /\|\s*birth[\s_]name\s*=\s*([^|\n{}]+)/gi,
                    // Bolded names often imply aliases/emphasis
                    /'''([^']+)'''/g,
                    // Wiki links
                    /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,
                    // Nihongo template
                    /{{nihongo\|([^|}]+)[|}]/gi
                ];

                // Process each pattern
                for (const pattern of patterns) {
                    const matches = content.matchAll(pattern);
                    for (const match of matches) {
                        if (match[1]) {
                            const foundAliases = match[1]
                                .trim()
                                .replace(/\[\[|\]\]|'''|''|\{\{|\}\}/g, '') // Cleanup wiki syntax
                                .split(/[,;|]/) // Split multiple aliases
                                .map(a => a.trim())
                                .filter(a => a.length > 0 && a.length < 50); // Sanity check length

                            foundAliases.forEach(a => aliases.add(a.toLowerCase()));
                        }
                    }
                }

                return Array.from(aliases);
            } catch (error) {
                console.warn(`WCHProcessors: Error extracting aliases for ${title}:`, error);
                return [title.toLowerCase()];
            }
        }
    };

    // Expose globally
    window.WCHProcessors = WCHProcessors;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WCHProcessors', WCHProcessors);
    }
})();
