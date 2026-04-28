const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

const context = {
    console,
    window: {
        eveState: {
            config: {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', subTabs: [] }]
            },
            links: [{ id: 'link-alpha', workspace: 'main', category: 'Alpha', title: 'Alpha seed' }]
        },
        EveOS: {
            API: {
                CacheRuntime: {
                    getSearchableProviderKeys() {
                        return ['mangadex', 'openlibrary'];
                    },
                    getProviderList(sources, providerKey) {
                        if (providerKey === 'mangadex') return sources?.mangadex?.data || [];
                        if (providerKey === 'openlibrary') return sources?.openlibrary?.docs || [];
                        return [];
                    }
                },
                Cache: {
                    async loadPool(categoryName) {
                        if (categoryName !== 'Alpha') return { queries: {}, order: [] };
                        return {
                            queries: {
                                kingdom: {
                                    query: 'kingdom',
                                    updatedAt: 1770000000000,
                                    lastUsedAt: 1770000000100,
                                    summary: {
                                        perSource: {
                                            mangadex: 1,
                                            openlibrary: 1
                                        }
                                    },
                                    sources: {
                                        mangadex: {
                                            data: [{
                                                id: 'md-kingdom',
                                                title: 'Kingdom',
                                                url: 'https://mangadex.org/title/kingdom',
                                                description: 'Historical war manga.'
                                            }]
                                        },
                                        openlibrary: {
                                            docs: [{
                                                key: '/works/OL1W',
                                                title: 'Kingdom Atlas',
                                                first_sentence: 'A map reference.'
                                            }]
                                        }
                                    }
                                }
                            },
                            order: ['kingdom']
                        };
                    }
                }
            },
            SearchAdvanced: {
                Locators: {
                    resolveCategoryPath(categoryName) {
                        return { workspaceId: 'main', categoryName };
                    }
                }
            }
        }
    }
};

context.window.window = context.window;
context.window.getLiveLinks = () => context.window.eveState.links;
context.globalThis = context;
const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const code = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    vm.runInContext(code, vmContext, { filename: relPath });
}

loadScript('js/modules/features/search-advanced/sa-cache-aggregator.js');

(async () => {
    const aggregator = context.window.EveOS.SearchAdvanced.CacheAggregator;
    const aggregate = await aggregator.aggregateAllCaches({ workspaceId: 'main' });
    assert(aggregate.entries.length === 1, 'Expected one cached query entry from current pool shape.');
    assert(aggregate.entries[0].query === 'kingdom', 'Expected cached query key to be read from pool.queries.');
    assert(aggregate.entries[0].results.length === 2, 'Expected provider results to be extracted from entry.sources.');
    assert(aggregate.stats.totalProviders === 2, 'Expected provider count from current cache summary.');

    const titleMatches = aggregator.searchAcrossCards('atlas', aggregate, { workspaceId: 'main' });
    assert(titleMatches.length === 1, 'Expected nested provider result title to be searchable.');
    assert(titleMatches[0].sourceCard === 'Alpha', 'Expected cached match to preserve source card.');

    const queryMatches = aggregator.searchAcrossCards('kingdom', aggregate, { workspaceId: 'main' });
    assert(queryMatches.length >= 2, 'Expected query match to expose cached provider results.');

    console.log('NEXUS_CACHE_AGGREGATOR_POOL_SMOKE_OK');
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
