/**
 * Google Search Mock Data Module
 * 
 * Provides mock data and potential wiki checks for Google Search Scraper.
 * Extracted from GoogleSearchScraper.js.
 */
window.GoogleSearchMockData = window.GoogleSearchMockData || {};
const GoogleSearchMockData = window.GoogleSearchMockData;

/**
 * Common search terms with predefined results
 */
GoogleSearchMockData.commonTerms = {
    'bleach': [
        {
            name: 'Bleach Wiki',
            domain: 'bleach.fandom.com',
            url: 'https://bleach.fandom.com',
            description: 'The #1 community database about the Bleach series by Tite Kubo including the manga, anime, video games, movies, characters, and more!',
            verified: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://static.wikia.nocookie.net/bleach/images/4/4d/Wiki-wordmark.png'
        },
        {
            name: 'Bleach Brave Souls Wiki',
            domain: 'bleachbravesouls.fandom.com',
            url: 'https://bleachbravesouls.fandom.com',
            description: 'The ultimate resource for Bleach Brave Souls, the mobile action game featuring characters from the Bleach anime and manga.',
            verified: true,
            source: 'Fandom',
            type: 'fandom'
        }
    ],
    'star wars': [
        {
            name: 'Star Wars Wiki - Wookieepedia',
            domain: 'starwars.fandom.com',
            url: 'https://starwars.fandom.com',
            description: 'The #1 source for Star Wars news, with comprehensive coverage of movies, TV shows, games, books, and more.',
            verified: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://static.wikia.nocookie.net/starwars/images/b/bc/Wiki-wordmark.png'
        },
        {
            name: 'Star Wars Legends Wiki',
            domain: 'starwarslegends.fandom.com',
            url: 'https://starwarslegends.fandom.com',
            description: 'The comprehensive database for Star Wars Legends content, including books, games, and comics from the Expanded Universe.',
            verified: true,
            source: 'Fandom',
            type: 'fandom'
        }
    ],
    'marvel': [
        {
            name: 'Marvel Database Wiki',
            domain: 'marvel.fandom.com',
            url: 'https://marvel.fandom.com',
            description: 'The #1 Marvel Comics encyclopedia that anyone can edit, covering characters, comics, movies, TV shows, and more.',
            verified: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://static.wikia.nocookie.net/marvel/images/b/b9/Wiki-wordmark.png'
        },
        {
            name: 'Marvel Cinematic Universe Wiki',
            domain: 'marvelcinematicuniverse.fandom.com',
            url: 'https://marvelcinematicuniverse.fandom.com',
            description: 'The definitive community source for Marvel Cinematic Universe (MCU) movies, shows, characters, and timeline.',
            verified: true,
            source: 'Fandom',
            type: 'fandom'
        }
    ],
    'dc': [
        {
            name: 'DC Database Wiki',
            domain: 'dc.fandom.com',
            url: 'https://dc.fandom.com',
            description: 'The definitive source for DC Comics, featuring comprehensive information on characters, comics, movies, and TV shows.',
            verified: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://static.wikia.nocookie.net/dc/images/8/8d/Wiki-wordmark.png'
        },
        {
            name: 'DC Extended Universe Wiki',
            domain: 'dcextendeduniverse.fandom.com',
            url: 'https://dcextendeduniverse.fandom.com',
            description: 'The community source for the DC Extended Universe (DCEU) movies, characters, and timeline.',
            verified: true,
            source: 'Fandom',
            type: 'fandom'
        }
    ],
    'harry potter': [
        {
            name: 'Harry Potter Wiki',
            domain: 'harrypotter.fandom.com',
            url: 'https://harrypotter.fandom.com',
            description: 'The most comprehensive database about the Harry Potter series, covering the books, movies, characters, locations, and more!',
            verified: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://static.wikia.nocookie.net/harrypotter/images/6/64/Wiki-wordmark.png'
        },
        {
            name: 'Wizarding World Wiki',
            domain: 'wizardingworld.fandom.com',
            url: 'https://wizardingworld.fandom.com',
            description: 'The community resource for everything in J.K. Rowling\'s Wizarding World, including Fantastic Beasts and The Cursed Child.',
            verified: true,
            source: 'Fandom',
            type: 'fandom'
        }
    ],
    'game of thrones': [
        {
            name: 'Game of Thrones Wiki',
            domain: 'gameofthrones.fandom.com',
            url: 'https://gameofthrones.fandom.com',
            description: 'The ultimate source for Game of Thrones, featuring information on characters, houses, episodes, and the world of Westeros.',
            verified: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://static.wikia.nocookie.net/gameofthrones/images/8/8a/Wiki-wordmark.png'
        },
        {
            name: 'A Wiki of Ice and Fire',
            domain: 'awoiaf.westeros.org',
            url: 'https://awoiaf.westeros.org',
            description: 'The comprehensive resource for George R.R. Martin\'s A Song of Ice and Fire book series.',
            verified: true,
            source: 'Westeros.org',
            type: 'wiki'
        }
    ]
};

/**
 * Generate potential wiki results based on search term
 * @param {string} searchTerm - The search term
 * @returns {Array} - Array of potential wiki results
 */
GoogleSearchMockData.generatePotentialWikis = function (searchTerm) {
    console.log('GoogleSearchMockData: Generating potential wikis based on search term:', searchTerm);

    // Check if we have predefined results for this search term
    const lowerSearchTerm = searchTerm.toLowerCase().trim();

    for (const term in this.commonTerms) {
        if (lowerSearchTerm.includes(term) || term.includes(lowerSearchTerm)) {
            console.log(`Found predefined results for term "${term}"`);
            return this.commonTerms[term];
        }
    }

    // If no predefined results, generate some potential domains
    const results = [];
    const normalizedTerm = lowerSearchTerm
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    // Generate some potential domains
    const potentialDomains = [
        `${normalizedTerm}.fandom.com`,
        `the-${normalizedTerm}.fandom.com`,
        `${normalizedTerm}-wiki.fandom.com`,
        `${normalizedTerm}-official.fandom.com`
    ];

    // Format display name from search term
    const displayName = searchTerm.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    // Add each potential domain as a result
    potentialDomains.forEach(domain => {
        results.push({
            name: `${displayName} Wiki`,
            domain: domain,
            url: `https://${domain}`,
            description: `Potential Fandom wiki about ${displayName}`,
            verified: false,
            suggested: true,
            source: 'Fandom',
            type: 'fandom',
            thumbnail: 'https://vignette.wikia.nocookie.net/central/images/5/5a/Fandom_app_logo.svg/revision/latest/scale-to-width-down/200'
        });
    });

    return results;
};

console.log('GoogleSearchMockData module loaded');
