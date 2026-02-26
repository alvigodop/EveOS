/**
 * Fandom API Module
 * Handles API interactions with Fandom wikis, including CORS proxy management and article fetching.
 * Extracted from discovery.js for better modularity.
 */

const FandomAPI = {};

/**
 * Initialize the FandomAPI module
 */
FandomAPI.init = function () {
    console.log('Initializing FandomAPI module');
    this._initialized = true;
    return this;
};

// Array of CORS proxies to try
FandomAPI.CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-anywhere-mjml.onrender.com/',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://corsproxy.org/?',
    'https://api.allorigins.win/get?url='
];

/**
 * Gets articles from a Fandom wiki
 * @param {string} domain - The domain of the wiki
 * @returns {Promise<Array>} - A promise that resolves to an array of article objects
 */
FandomAPI.getWikiArticles = async function (domain) {
    if (!domain) {
        throw new Error('No domain provided');
    }

    console.log(`Getting articles from ${domain}`);

    try {
        // Try to use the Fandom API to get articles
        let proxyUsed = null;
        let articles = [];

        // Try each CORS proxy
        for (const proxy of FandomAPI.CORS_PROXIES) {
            try {
                // First, try to get popular pages
                // Using wikitext format is sometimes more reliable across different MediaWiki versions
                const popularUrl = `${proxy}${encodeURIComponent(`https://${domain}/api.php?action=query&list=wkpoppages&format=json&limit=50`)}`;
                const popularResponse = await fetch(popularUrl);

                if (popularResponse.ok) {
                    const popularData = await popularResponse.json();
                    proxyUsed = proxy;

                    if (popularData && popularData.query && popularData.query.wkpoppages) {
                        articles = popularData.query.wkpoppages.map(page => ({
                            id: page.id,
                            title: page.title,
                            url: `https://${domain}${page.url}`,
                            type: 'popular'
                        }));

                        console.log(`Found ${articles.length} popular articles`);

                        // If we found articles, break out of the loop
                        if (articles.length > 0) {
                            break;
                        }
                    }
                }

                // If popular pages didn't work, try recent changes
                const recentUrl = `${proxy}${encodeURIComponent(`https://${domain}/api.php?action=query&list=recentchanges&rcnamespace=0&rclimit=50&format=json`)}`;
                const recentResponse = await fetch(recentUrl);

                if (recentResponse.ok) {
                    const recentData = await recentResponse.json();
                    proxyUsed = proxy;

                    if (recentData && recentData.query && recentData.query.recentchanges) {
                        const recentArticles = recentData.query.recentchanges
                            .filter(change => change.type === 'edit' || change.type === 'new')
                            .map(change => ({
                                id: change.pageid,
                                title: change.title,
                                url: `https://${domain}/wiki/${encodeURIComponent(change.title.replace(/ /g, '_'))}`,
                                type: 'recent'
                            }));

                        // Add recent articles to our list, avoiding duplicates
                        recentArticles.forEach(article => {
                            if (!articles.some(a => a.id === article.id)) {
                                articles.push(article);
                            }
                        });

                        console.log(`Found ${recentArticles.length} recent articles`);

                        // If we found articles, break out of the loop
                        if (articles.length > 0) {
                            break;
                        }
                    }
                }

                // If API methods didn't work, try scraping the main page
                const mainPageUrl = `${proxy}${encodeURIComponent(`https://${domain}`)}`;
                const mainPageResponse = await fetch(mainPageUrl);

                if (mainPageResponse.ok) {
                    const html = await mainPageResponse.text();
                    proxyUsed = proxy;

                    // Look for article links in the HTML
                    // This is a simple regex-based scraper, primarily for fallback
                    const linkMatches = html.match(/<a[^>]*href="\/wiki\/([^"]+)"[^>]*>([^<]+)<\/a>/g);

                    if (linkMatches && linkMatches.length > 0) {
                        const scrapedArticles = [];

                        for (const linkMatch of linkMatches) {
                            const hrefMatch = linkMatch.match(/href="\/wiki\/([^"]+)"/);
                            const textMatch = linkMatch.match(/>([^<]+)</);

                            if (hrefMatch && textMatch) {
                                const path = hrefMatch[1];
                                const title = textMatch[1].trim();

                                // Skip special pages, categories, files, etc.
                                if (path.startsWith('Special:') ||
                                    path.startsWith('Category:') ||
                                    path.startsWith('File:') ||
                                    path.startsWith('Template:') ||
                                    path.startsWith('Help:') ||
                                    path.includes(':') ||
                                    path.includes('#')) {
                                    continue;
                                }

                                scrapedArticles.push({
                                    id: path,
                                    title: title,
                                    url: `https://${domain}/wiki/${path}`,
                                    type: 'scraped'
                                });
                            }
                        }

                        // Add scraped articles to our list, avoiding duplicates
                        scrapedArticles.forEach(article => {
                            if (!articles.some(a => a.id === article.id) &&
                                !articles.some(a => a.title === article.title)) {
                                articles.push(article);
                            }
                        });

                        console.log(`Found ${scrapedArticles.length} scraped articles`);

                        // If we found articles, break out of the loop
                        if (articles.length > 0) {
                            break;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error fetching articles with proxy ${proxy}:`, error);
            }
        }

        // If we didn't find any articles, throw an error
        if (articles.length === 0) {
            throw new Error('No articles found');
        }

        // Deduplicate articles by title
        const uniqueArticles = [];
        const titles = new Set();

        articles.forEach(article => {
            if (!titles.has(article.title)) {
                uniqueArticles.push(article);
                titles.add(article.title);
            }
        });

        // Sort articles by type (popular first, then recent, then scraped)
        uniqueArticles.sort((a, b) => {
            const typeOrder = { popular: 0, recent: 1, scraped: 2 };
            return typeOrder[a.type] - typeOrder[b.type];
        });

        // Limit to 50 articles
        return uniqueArticles.slice(0, 50);
    } catch (error) {
        console.error(`Error getting articles from ${domain}:`, error);
        throw error;
    }
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('FandomAPI', FandomAPI);
}

// Ensure global availability
window.FandomAPI = FandomAPI;
