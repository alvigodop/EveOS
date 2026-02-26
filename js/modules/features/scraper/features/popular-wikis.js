/**
 * Popular Wikis Module
 * 
 * This module provides a preloaded list of popular Fandom wikis
 * to accelerate discovery and improve offline functionality.
 *
 * @version 1.0.0
 */

// Create module
const PopularWikis = {};

/**
 * List of popular Fandom wikis
 * @type {Array}
 */
PopularWikis.list = [
    {
        name: 'Marvel Comics',
        domain: 'marvel.fandom.com',
        url: 'https://marvel.fandom.com',
        description: 'The Marvel Database, the definitive wiki for Marvel Comics',
        verified: true,
        popular: true
    },
    {
        name: 'Star Wars',
        domain: 'starwars.fandom.com',
        url: 'https://starwars.fandom.com',
        description: 'Wookieepedia, the Star Wars wiki',
        verified: true,
        popular: true
    },
    {
        name: 'Harry Potter',
        domain: 'harrypotter.fandom.com',
        url: 'https://harrypotter.fandom.com',
        description: 'The Harry Potter Wiki - the most comprehensive guide to the Harry Potter universe',
        verified: true,
        popular: true
    },
    {
        name: 'DC Comics',
        domain: 'dc.fandom.com',
        url: 'https://dc.fandom.com',
        description: 'The DC Database - the definitive wiki for DC Comics',
        verified: true,
        popular: true
    },
    {
        name: 'Memory Alpha',
        domain: 'memory-alpha.fandom.com',
        url: 'https://memory-alpha.fandom.com',
        description: 'Star Trek wiki covering canon television series and films',
        verified: true,
        popular: true
    },
    {
        name: 'Elder Scrolls',
        domain: 'elderscrolls.fandom.com',
        url: 'https://elderscrolls.fandom.com',
        description: 'The Elder Scrolls Wiki - a definitive source for Elder Scrolls games',
        verified: true,
        popular: true
    },
    {
        name: 'Minecraft',
        domain: 'minecraft.fandom.com',
        url: 'https://minecraft.fandom.com',
        description: 'The Minecraft Wiki - the ultimate Minecraft reference',
        verified: true,
        popular: true
    },
    {
        name: 'Game of Thrones',
        domain: 'gameofthrones.fandom.com',
        url: 'https://gameofthrones.fandom.com',
        description: 'The Game of Thrones Wiki - information about HBO\'s Game of Thrones and A Song of Ice and Fire',
        verified: true,
        popular: true
    },
    {
        name: 'Pokemon',
        domain: 'pokemon.fandom.com',
        url: 'https://pokemon.fandom.com',
        description: 'The Pokemon Wiki - everything about Pokemon, video games, anime and more',
        verified: true,
        popular: true
    },
    {
        name: 'Warhammer 40K',
        domain: 'warhammer40k.fandom.com',
        url: 'https://warhammer40k.fandom.com',
        description: 'The Warhammer 40k Wiki - a guide to the Warhammer 40k universe',
        verified: true,
        popular: true
    }
];

/**
 * Get a list of all popular wikis
 * @returns {Array} - Array of popular wiki objects
 */
PopularWikis.getAll = function () {
    return this.list;
};

/**
 * Search for wikis in the popular list
 * @param {string} searchTerm - Term to search for
 * @returns {Array} - Array of matching popular wiki objects
 */
PopularWikis.search = function (searchTerm) {
    if (!searchTerm) return [];

    const searchTermLower = searchTerm.toLowerCase();
    return this.list.filter(wiki => {
        return wiki.name.toLowerCase().includes(searchTermLower) ||
            wiki.domain.toLowerCase().includes(searchTermLower) ||
            wiki.description.toLowerCase().includes(searchTermLower);
    });
};

/**
 * Initialize the PopularWikis module
 */
PopularWikis.init = function () {
    console.log('Initializing PopularWikis stub module');

    // Register this module if ModuleRegistry is available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('PopularWikis', PopularWikis);
    }

    this._initialized = true;
    return this;
};

// Expose to global scope
window.PopularWikis = PopularWikis;

// Auto-initialize
if (PopularWikis.init) {
    PopularWikis.init();
} 