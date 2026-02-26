/**
 * Wikipedia API - Enrich
 * 
 * Handles batch enrichment of results.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WAEnrich = {
        version: '1.0.0',

        init: function () {
            console.log('WAEnrich initialized');
            return this;
        },

        /**
         * Batch fetch categories for Wikipedia results
         * @param {Array} results - The list of result objects to enrich
         */
        enrichResults: async function (results) {
            const resultsToEnrich = results.filter(r => r.source === 'wikipedia' && (!r.categories || r.categories.length === 0));

            if (resultsToEnrich.length === 0) return;

            console.log(`WAEnrich: Enriching ${resultsToEnrich.length} results with categories...`);

            const titles = [...new Set(resultsToEnrich.map(r => r.title))];
            const CHUNK_SIZE = 50;

            for (let i = 0; i < titles.length; i += CHUNK_SIZE) {
                const chunk = titles.slice(i, i + CHUNK_SIZE);
                const titlesParam = chunk.map(t => encodeURIComponent(t)).join('|');
                const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${titlesParam}&prop=categories&cllimit=max&format=json&origin=*`;

                try {
                    // Dependency check for CORSProxyManager
                    if (!window.CORSProxyManager || typeof CORSProxyManager.fetch !== 'function') {
                        console.warn('WAEnrich: CORSProxyManager not available');
                        continue;
                    }

                    const response = await CORSProxyManager.fetch(apiUrl);
                    if (!response.ok) continue;

                    const data = await response.json();
                    if (!data.query || !data.query.pages) continue;

                    Object.values(data.query.pages).forEach(page => {
                        if (page.missing) return;

                        const rawCategories = page.categories ? page.categories.map(c => c.title.replace(/^Category:/, '')) : [];
                        const cleanCategories = rawCategories.filter(cat =>
                            !cat.startsWith('Articles with') &&
                            !cat.startsWith('All articles') &&
                            !cat.startsWith('Use dmy dates') &&
                            !cat.startsWith('Webarchive') &&
                            !cat.startsWith('CS1') &&
                            !cat.startsWith('Pages with')
                        );

                        resultsToEnrich.filter(r => r.title === page.title).forEach(r => {
                            r.categories = cleanCategories;
                        });
                    });

                } catch (error) {
                    console.warn(`WAEnrich: Error enriching batch ${i / CHUNK_SIZE + 1}:`, error);
                }
            }
        }
    };

    // Expose globally
    window.WAEnrich = WAEnrich;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WAEnrich', WAEnrich);
    }
})();
