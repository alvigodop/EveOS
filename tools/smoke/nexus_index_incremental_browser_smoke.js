const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.saveData === 'function'
        && typeof window.saveConfig === 'function'
        && !!window.EveOS?.DatapackIndex?.ensureFresh
        && !!window.EveOS?.API?.Cache?.loadPool
        && !!window.EveOS?.API?.SearchInternals?.buildSourceCacheGroups
    ), undefined, { timeout: 240000 });
    await page.waitForTimeout(1500);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const indexApi = window.EveOS?.DatapackIndex;
            const shared = window.EveOS?.SearchAdvanced?.IndexShared;
            const cacheApi = window.EveOS?.API?.Cache;
            const cacheRuntime = window.EveOS?.API?.CacheRuntime || {};
            const searchInternals = window.EveOS?.API?.SearchInternals;
            if (!indexApi || !shared || !cacheApi || !searchInternals) {
                throw new Error('Datapack index APIs are not ready.');
            }

            const originalLoadPool = cacheApi.loadPool.bind(cacheApi);
            const originalGetSearchableProviderKeys = typeof cacheRuntime.getSearchableProviderKeys === 'function'
                ? cacheRuntime.getSearchableProviderKeys.bind(cacheRuntime)
                : null;
            const originalGetProviderList = typeof cacheRuntime.getProviderList === 'function'
                ? cacheRuntime.getProviderList.bind(cacheRuntime)
                : null;
            const originalBuildSourceCacheGroups = searchInternals.buildSourceCacheGroups.bind(searchInternals);
            const originalSummarizeProviders = typeof searchInternals.summarizeApiGroupProviders === 'function'
                ? searchInternals.summarizeApiGroupProviders.bind(searchInternals)
                : null;
            const callCounts = {
                cacheLoadPool: 0,
                knowledgeGroups: 0
            };

            function applyConfig(nextConfig) {
                window.config = nextConfig;
                window.eveState = window.eveState || {};
                window.eveState.config = nextConfig;
            }

            function applyLinks(nextLinks) {
                const clonedLinks = nextLinks.map(function (link) {
                    return Object.assign({}, link);
                });
                if (typeof window.setLiveLinks === 'function') {
                    window.setLiveLinks(clonedLinks);
                    return;
                }
                window.links = clonedLinks;
                window.eveState = window.eveState || {};
                window.eveState.links = clonedLinks;
            }

            try {
                cacheApi.loadPool = async function (categoryName) {
                    callCounts.cacheLoadPool += 1;
                    return {
                        queries: {
                            alpha: {
                                query: categoryName + ' Query',
                                updatedAt: 1710000000000,
                                sources: {},
                                summary: {
                                    perSource: {
                                        web: 1
                                    }
                                }
                            }
                        }
                    };
                };
                cacheRuntime.getSearchableProviderKeys = function () {
                    return ['web'];
                };
                cacheRuntime.getProviderList = function () {
                    return [{
                        title: 'Alpha Cached Result',
                        url: 'https://cached.example.com/alpha',
                        description: 'Cached Alpha result'
                    }];
                };
                searchInternals.buildSourceCacheGroups = async function (categoryName) {
                    callCounts.knowledgeGroups += 1;
                    return [{
                        title: categoryName + ' Knowledge',
                        aliases: [categoryName + ' Alias'],
                        updatedAt: 1710000000001,
                        wikipediaEntry: {
                            title: categoryName
                        },
                        apiEntries: [{
                            query: categoryName + ' Query'
                        }]
                    }];
                };
                searchInternals.summarizeApiGroupProviders = function (entries) {
                    return {
                        aniList: Array.isArray(entries) ? entries.length : 0
                    };
                };

                shared.state.snapshot = null;
                shared.state.buildPromise = null;
                shared.state.loaded = true;
                shared.state.dirty = true;
                shared.state.lastReason = 'smoke-reset';
                shared.state.revision = 0;

                applyConfig(Object.assign({}, window.config || {}, {
                    activeWorkspace: 'main',
                    workspaces: [
                        { id: 'main', name: 'Main Tab' },
                        { id: 'alt', name: 'Alt Tab' }
                    ]
                }));
                applyLinks([{
                    id: 'alpha-1',
                    title: 'Alpha Bookmark',
                    url: 'https://example.com/alpha',
                    category: 'Alpha',
                    workspace: 'main',
                    done: false
                }]);

                await Promise.resolve(window.saveConfig({ immediate: true }));
                await Promise.resolve(window.saveData({ skipRender: true, skipSuggestions: true, immediate: true }));

                const firstSnapshot = await indexApi.rebuild({ reason: 'smoke-full' });
                const firstCounts = Object.assign({}, callCounts);
                const firstKnowledge = firstSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Alpha';
                });
                const firstCached = firstSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Alpha';
                });

                applyConfig(Object.assign({}, window.config || {}, {
                    activeWorkspace: 'alt',
                    workspaces: [
                        { id: 'main', name: 'Main Tab' },
                        { id: 'alt', name: 'Alt Tab' }
                    ]
                }));
                applyLinks([{
                    id: 'alpha-1',
                    title: 'Alpha Bookmark Updated',
                    url: 'https://example.com/alpha',
                    category: 'Alpha',
                    workspace: 'alt',
                    done: false
                }]);

                await Promise.resolve(window.saveConfig({ immediate: true }));
                await Promise.resolve(window.saveData({ skipRender: true, skipSuggestions: true, immediate: true }));

                const secondSnapshot = await indexApi.ensureFresh();
                const secondCounts = Object.assign({}, callCounts);
                const secondBookmark = secondSnapshot.records.find(function (record) {
                    return record?.type === 'bookmark' && record?.sourceIdentity?.linkId === 'alpha-1';
                });
                const secondKnowledge = secondSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Alpha';
                });
                const secondCached = secondSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Alpha';
                });

                return {
                    firstCounts: firstCounts,
                    secondCounts: secondCounts,
                    firstKnowledge: firstKnowledge ? {
                        workspaceId: firstKnowledge.workspaceId,
                        pathLabel: firstKnowledge.path?.pathLabel || ''
                    } : null,
                    firstCached: firstCached ? {
                        workspaceId: firstCached.workspaceId,
                        pathLabel: firstCached.path?.pathLabel || ''
                    } : null,
                    secondBookmark: secondBookmark ? {
                        title: secondBookmark.title,
                        workspaceId: secondBookmark.workspaceId,
                        pathLabel: secondBookmark.path?.pathLabel || ''
                    } : null,
                    secondKnowledge: secondKnowledge ? {
                        workspaceId: secondKnowledge.workspaceId,
                        pathLabel: secondKnowledge.path?.pathLabel || ''
                    } : null,
                    secondCached: secondCached ? {
                        workspaceId: secondCached.workspaceId,
                        pathLabel: secondCached.path?.pathLabel || ''
                    } : null,
                    secondStats: secondSnapshot.stats || null
                };
            } finally {
                cacheApi.loadPool = originalLoadPool;
                if (originalGetSearchableProviderKeys) {
                    cacheRuntime.getSearchableProviderKeys = originalGetSearchableProviderKeys;
                }
                if (originalGetProviderList) {
                    cacheRuntime.getProviderList = originalGetProviderList;
                }
                searchInternals.buildSourceCacheGroups = originalBuildSourceCacheGroups;
                if (originalSummarizeProviders) {
                    searchInternals.summarizeApiGroupProviders = originalSummarizeProviders;
                }
            }
        });

        if (result.firstCounts.cacheLoadPool < 1 || result.firstCounts.knowledgeGroups < 1) {
            throw new Error(`Expected initial full build to hit heavy source builders: ${JSON.stringify(result)}`);
        }
        if (result.secondCounts.cacheLoadPool !== result.firstCounts.cacheLoadPool) {
            throw new Error(`Expected local incremental rebuild to skip cache pool reloads: ${JSON.stringify(result)}`);
        }
        if (result.secondCounts.knowledgeGroups !== result.firstCounts.knowledgeGroups) {
            throw new Error(`Expected local incremental rebuild to skip source graph rebuilds: ${JSON.stringify(result)}`);
        }
        if (!result.secondBookmark || result.secondBookmark.title !== 'Alpha Bookmark Updated' || result.secondBookmark.workspaceId !== 'alt') {
            throw new Error(`Expected local bookmark record to refresh on incremental rebuild: ${JSON.stringify(result)}`);
        }
        if (!result.secondKnowledge || result.secondKnowledge.workspaceId !== 'alt') {
            throw new Error(`Expected preserved knowledge record to rehydrate onto the new workspace scope: ${JSON.stringify(result)}`);
        }
        if (!result.secondCached || result.secondCached.workspaceId !== 'alt') {
            throw new Error(`Expected preserved cached record to rehydrate onto the new workspace scope: ${JSON.stringify(result)}`);
        }
        if (!result.secondStats || result.secondStats.knowledgeCount !== 1 || result.secondStats.cachedCount !== 1) {
            throw new Error(`Expected incremental snapshot stats to preserve source-backed records: ${JSON.stringify(result)}`);
        }

        console.log(`NEXUS_INDEX_INCREMENTAL_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await context.close();
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
