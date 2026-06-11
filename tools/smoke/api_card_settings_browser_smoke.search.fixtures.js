async function installApiSearchFixtures() {
    const providers = [
        ['MangaDex', 'searchMangaDex', () => ({ data: [{ id: 'md-1', title: "JoJo's Kingdom" }] })],
        ['Jikan', 'searchJikanManga', () => ({ data: [] })],
        ['Jikan', 'searchJikanAnime', () => ({ data: [] })],
        ['AniList', 'searchAniListManga', () => ({ data: { Page: { media: [] } } })],
        ['AniList', 'searchAniListAnime', () => ({ data: { Page: { media: [] } } })],
        ['MangaUpdates', 'searchMangaUpdates', () => ({ results: [] })],
        ['Kitsu', 'searchKitsuAnime', () => ({ data: [] })],
        ['Kitsu', 'searchKitsuManga', () => ({ data: [] })],
        ['TVmaze', 'searchTVmaze', () => ([])],
        ['iTunes', 'searchiTunes', () => ({ results: [] })],
        ['WlnUpdates', 'searchWlnUpdates', () => ({ data: [] })],
        ['OpenLibrary', 'searchOpenLibrary', () => ({ docs: [{ key: '/works/OL1W', title: 'Kingdom Atlas' }] })],
        ['ComicK', 'searchComicK', () => ([])]
    ];
    window.__apiSmokeProviderCalls = 0;
    providers.forEach(([namespace, method, factory]) => {
        window.EveOS.API[namespace] = window.EveOS.API[namespace] || {};
        window.EveOS.API[namespace][method] = async function () {
            window.__apiSmokeProviderCalls += 1;
            return factory();
        };
    });
    window.currentCategoryCtx = 'Alpha';
    if (window.StorageManager?.setCategoryContext) {
        window.StorageManager.setCategoryContext('Alpha');
    }
    if (window.StorageManager?.saveData) {
        window.StorageManager.saveData('wikiEntries', [{ title: 'Naruto', name: 'Naruto' }]);   
        window.StorageManager.saveData('fandomDomains', [{ domain: 'naruto.fandom.com', name: 'Narutopedia' }]);
        window.StorageManager.saveData('fandomCacheIndex', {
            'naruto.fandom.com': {
                domain: 'naruto.fandom.com',
                itemCount: 1,
                updatedAt: '2026-04-04T09:05:00.000Z',
                sampleTitles: ['Naruto Wiki']
            }
        });
        window.StorageManager.saveData('wikiCacheStore', {
            // Root level key satisfies legacy CWStorage.getWikipediaEntryData
            Naruto: { title: 'Naruto', extract: 'Leaf village ninja.', lastUpdate: '2026-04-04T09:00:00.000Z' },
            entryResults: {
                Naruto: {
                    main: { title: 'Naruto', extract: 'Leaf village ninja.' },
                    searchResults: {
                        chakra: { title: 'Chakra', snippet: 'Energy system.' }
                    },
                    lastUpdate: '2026-04-04T09:00:00.000Z'
                }
            }
        });
        window.StorageManager.saveData('wikiDataStore', {
            searchResults: {}
        });
    }
    // Force CacheCore to reload seeded wikiCacheStore and wikiDataStore
    if (window.CacheCore) {
        CacheCore._initialized = false;
        CacheCore.init();
    }
    if (window.EveOS?.API?.Cache?.storeQuery) {
        await window.EveOS.API.Cache.storeQuery('naruto', {
            mangadex: {
                data: [{
                    id: 'md-naruto',
                    attributes: {
                        title: { en: 'Naruto' },
                        description: { en: 'Naruto manga overview.' },
                        year: 1999,
                        status: 'completed',
                        tags: [{
                            attributes: {
                                name: { en: 'Action' },
                                group: 'genre'
                            }
                        }]
                    },
                    relationships: [],
                    stats: {
                        follows: 250
                    }
                }]
            },
            openlibrary: {
                docs: [{
                    key: '/works/OLNARUTO',
                    title: 'Naruto Archive',
                    author_name: ['Masashi Kishimoto'],
                    subject: ['Ninja']
                }]
            }
        }, 'Alpha');
    }
    if (window.FSLCache?.updateAggregateCache) {
        await window.FSLCache.updateAggregateCache('naruto', [{
            title: 'Naruto Wiki',
            snippet: 'Naruto Uzumaki ninja profile page.',
            url: 'https://naruto.fandom.com/wiki/Naruto_Uzumaki',
            domain: 'naruto.fandom.com',
            wiki_name: 'Narutopedia',
            contentType: 'character',
            categories: ['Characters'],
            tags: ['Ninja'],
            rating: 8.8
        }]);
    }
    window.__knowledgeLiveCalls = {
        wikipediaEntry: 0,
        fandomDomainSearch: 0,
        fandomPageDetails: 0
    };
    if (window.WikipediaAPI?.fetchLiveEntry) {
        const originalFetchLiveEntry = window.WikipediaAPI.fetchLiveEntry.bind(window.WikipediaAPI);
        window.WikipediaAPI.fetchLiveEntry = async function () {
            window.__knowledgeLiveCalls.wikipediaEntry += 1;
            return originalFetchLiveEntry.apply(this, arguments);
        };
    }
    if (window.SearchFandom?.fetchLiveFandomDomainSearch) {
        const originalFetchLiveFandomDomainSearch = window.SearchFandom.fetchLiveFandomDomainSearch.bind(window.SearchFandom);
        window.SearchFandom.fetchLiveFandomDomainSearch = async function () {
            window.__knowledgeLiveCalls.fandomDomainSearch += 1;
            return originalFetchLiveFandomDomainSearch.apply(this, arguments);
        };
    }
    if (window.SearchFandom?.fetchLiveFandomPageDetails) {
        const originalFetchLiveFandomPageDetails = window.SearchFandom.fetchLiveFandomPageDetails.bind(window.SearchFandom);
        window.SearchFandom.fetchLiveFandomPageDetails = async function () {
            window.__knowledgeLiveCalls.fandomPageDetails += 1;
            return originalFetchLiveFandomPageDetails.apply(this, arguments);
        };
    }
    window.openCategorySettings('Alpha', 'search');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (window.WikiManager?.refreshCacheStores) {
        await window.WikiManager.refreshCacheStores();
    }
    if (window.WikiManager?.renderFandomDomainList) {
        await window.WikiManager.renderFandomDomainList(true);
    }
}

module.exports = {
    installApiSearchFixtures
};
