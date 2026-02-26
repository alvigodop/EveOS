/**
 * DiscoveryLogic Module
 * Handles core logic for the Discovery module including sorting and variations
 */
const DiscoveryLogic = {};

/**
 * Gets special variations of a search term
 * @param {string} searchTerm - The search term to get variations for
 * @returns {Array} - An array of special variations
 */
DiscoveryLogic.getSpecialVariations = function (searchTerm) {
    const variations = [];

    // Special case for "apotheosis"
    if (searchTerm === 'apotheosis') {
        variations.push({
            name: 'Apotheosis Minecraft',
            domain: 'apotheosis-minecraft.fandom.com',
            url: 'https://apotheosis-minecraft.fandom.com',
            description: 'Fandom wiki for the Apotheosis Minecraft mod'
        });

        variations.push({
            name: 'Apotheosis Novel',
            domain: 'apotheosis-novel.fandom.com',
            url: 'https://apotheosis-novel.fandom.com',
            description: 'Fandom wiki for the Apotheosis novel/web novel'
        });
    }

    // Special case for "bleach"
    if (searchTerm === 'bleach') {
        variations.push({
            name: 'Bleach Brave Souls',
            domain: 'bleach-brave-souls.fandom.com',
            url: 'https://bleach-brave-souls.fandom.com',
            description: 'Fandom wiki for the Bleach Brave Souls mobile game'
        });
    }

    // Special case for "attack"
    if (searchTerm === 'attack') {
        const attackWikis = [
            {
                name: 'Attack on Titan',
                domain: 'attackontitan.fandom.com',
                url: 'https://attackontitan.fandom.com',
                description: 'Fandom wiki for the Attack on Titan anime/manga'
            },
            {
                name: 'Attack on Titan Fanon',
                domain: 'attackontitan-fanon.fandom.com',
                url: 'https://attackontitan-fanon.fandom.com',
                description: 'Fanon wiki for Attack on Titan'
            },
            {
                name: 'Attack on Dragon',
                domain: 'attackondragon.fandom.com',
                url: 'https://attackondragon.fandom.com',
                description: 'Fandom wiki for Attack on Dragon'
            },
            {
                name: 'Attack on Titan Tactics',
                domain: 'attackontitantactics.fandom.com',
                url: 'https://attackontitantactics.fandom.com',
                description: 'Fandom wiki for the Attack on Titan Tactics mobile game'
            }
        ];

        variations.push(...attackWikis);
    }

    return variations;
};

/**
 * Sorts wiki results by relevance to the search term
 * @param {Array} results - Array of wiki objects to sort
 * @param {string} searchTerm - The search term to compare against
 * @returns {Array} - Sorted array of wiki objects
 */
DiscoveryLogic.sortWikiResults = function (results, searchTerm) {
    if (!results || results.length === 0) return [];

    // Calculate a relevance score for each result
    const scoredResults = results.map(wiki => {
        let score = 0;
        const domain = wiki.domain.toLowerCase();
        const name = wiki.name.toLowerCase();

        // Exact matches get highest priority
        if (domain.split('.')[0] === searchTerm) {
            score += 100;
        } else if (name === searchTerm) {
            score += 90;
        }

        // Domain contains search term
        if (domain.includes(searchTerm)) {
            score += 50;
        }

        // Name contains search term
        if (name.includes(searchTerm)) {
            score += 40;
        }

        // Description contains search term
        if (wiki.description && wiki.description.toLowerCase().includes(searchTerm)) {
            score += 30;
        }

        // Boost verified results
        if (wiki.verified) {
            score += 20;
        }

        // Boost results from popular wikis
        if (wiki.fromPopular) {
            score += 15;
        }

        // Boost results from API
        if (wiki.fromAPI) {
            score += 10;
        }

        // Boost results from scraper
        if (wiki.fromScraper) {
            score += 5;
        }

        // Consider confidence if available
        if (wiki.confidence) {
            score += wiki.confidence * 10;
        }

        return {
            ...wiki,
            relevanceScore: score
        };
    });

    // Sort by relevance score (highest first)
    return scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

/**
 * Cleans HTML snippets by removing tags
 * @param {string} html - The HTML snippet to clean
 * @returns {string} - The cleaned snippet
 */
DiscoveryLogic.cleanHtmlSnippet = function (html) {
    if (!html) return '';
    return html.replace(/<\/?[^>]+(>|$)/g, '');
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DiscoveryLogic', DiscoveryLogic);
} else {
    window.DiscoveryLogic = DiscoveryLogic;
}
