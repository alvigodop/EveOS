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
            const originalSaveScopedStorageValueAsync = typeof searchInternals.saveScopedStorageValueAsync === 'function'
                ? searchInternals.saveScopedStorageValueAsync.bind(searchInternals)
                : null;
            const callCounts = {
                cacheLoadPool: 0,
                knowledgeGroups: 0,
                cacheByCategory: {},
                knowledgeByCategory: {}
            };
            const sourceVersions = {
                Alpha: 1,
                Beta: 1
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

            function cloneCounts() {
                return {
                    cacheLoadPool: callCounts.cacheLoadPool,
                    knowledgeGroups: callCounts.knowledgeGroups,
                    cacheByCategory: Object.assign({}, callCounts.cacheByCategory),
                    knowledgeByCategory: Object.assign({}, callCounts.knowledgeByCategory)
                };
            }

            try {
                cacheApi.loadPool = async function (categoryName) {
                    callCounts.cacheLoadPool += 1;
                    callCounts.cacheByCategory[categoryName] = Number(callCounts.cacheByCategory[categoryName] || 0) + 1;
                    const version = Number(sourceVersions[categoryName] || 1);
                    return {
                        queries: {
                            alpha: {
                                query: categoryName + ' Query v' + version,
                                updatedAt: 1710000000000,
                                sources: {
                                    web: {
                                        query: categoryName + ' Query v' + version
                                    }
                                },
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
                cacheRuntime.getProviderList = function (sources, providerKey) {
                    const queryLabel = String(sources?.[providerKey]?.query || '');
                    const categoryName = queryLabel.split(' Query')[0] || 'Alpha';
                    const version = Number(sourceVersions[categoryName] || 1);
                    return [{
                        title: categoryName + ' Cached Result v' + version,
                        url: 'https://cached.example.com/' + categoryName.toLowerCase(),
                        description: 'Cached ' + categoryName + ' result v' + version
                    }];
                };
                searchInternals.buildSourceCacheGroups = async function (categoryName) {
                    callCounts.knowledgeGroups += 1;
                    callCounts.knowledgeByCategory[categoryName] = Number(callCounts.knowledgeByCategory[categoryName] || 0) + 1;
                    const version = Number(sourceVersions[categoryName] || 1);
                    return [{
                        title: categoryName + ' Knowledge v' + version,
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
                applyLinks([
                    {
                        id: 'alpha-1',
                        title: 'Alpha Bookmark',
                        url: 'https://example.com/alpha',
                        category: 'Alpha',
                        workspace: 'main',
                        done: false
                    },
                    {
                        id: 'beta-1',
                        title: 'Beta Bookmark',
                        url: 'https://example.com/beta',
                        category: 'Beta',
                        workspace: 'main',
                        done: false
                    }
                ]);

                await Promise.resolve(window.saveConfig({ immediate: true }));
                await Promise.resolve(window.saveData({ skipRender: true, skipSuggestions: true, immediate: true }));

                const firstSnapshot = await indexApi.rebuild({ reason: 'smoke-full' });
                const firstCounts = cloneCounts();
                const firstKnowledge = firstSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Alpha';
                });
                const firstCached = firstSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Alpha';
                });
                const firstBetaKnowledge = firstSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Beta';
                });
                const firstBetaCached = firstSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Beta';
                });

                applyConfig(Object.assign({}, window.config || {}, {
                    activeWorkspace: 'alt',
                    workspaces: [
                        { id: 'main', name: 'Main Tab' },
                        { id: 'alt', name: 'Alt Tab' }
                    ]
                }));
                applyLinks([
                    {
                        id: 'alpha-1',
                        title: 'Alpha Bookmark Updated',
                        url: 'https://example.com/alpha',
                        category: 'Alpha',
                        workspace: 'alt',
                        done: false
                    },
                    {
                        id: 'beta-1',
                        title: 'Beta Bookmark',
                        url: 'https://example.com/beta',
                        category: 'Beta',
                        workspace: 'main',
                        done: false
                    }
                ]);

                await Promise.resolve(window.saveConfig({ immediate: true }));
                await Promise.resolve(window.saveData({ skipRender: true, skipSuggestions: true, immediate: true }));

                const secondSnapshot = await indexApi.ensureFresh();
                const secondCounts = cloneCounts();
                const secondBookmark = secondSnapshot.records.find(function (record) {
                    return record?.type === 'bookmark' && record?.sourceIdentity?.linkId === 'alpha-1';
                });
                const secondKnowledge = secondSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Alpha';
                });
                const secondCached = secondSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Alpha';
                });
                const secondBetaKnowledge = secondSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Beta';
                });
                const secondBetaCached = secondSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Beta';
                });

                sourceVersions.Alpha = 2;
                if (typeof originalSaveScopedStorageValueAsync !== 'function') {
                    throw new Error('SearchInternals.saveScopedStorageValueAsync is not available.');
                }
                await originalSaveScopedStorageValueAsync('wikiEntries', [{ title: 'Alpha Source Refresh' }], 'Alpha');

                const thirdSnapshot = await indexApi.ensureFresh();
                const thirdCounts = cloneCounts();
                const thirdAlphaKnowledge = thirdSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Alpha';
                });
                const thirdAlphaCached = thirdSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Alpha';
                });
                const thirdBetaKnowledge = thirdSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Beta';
                });
                const thirdBetaCached = thirdSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Beta';
                });

                sourceVersions.Alpha = 3;
                window.currentCategoryCtx = 'Alpha';
                await originalSaveScopedStorageValueAsync('wikiEntries', [{ title: 'Alpha Source Refresh Again' }]);

                const fourthSnapshot = await indexApi.ensureFresh();
                const fourthCounts = cloneCounts();
                const fourthAlphaKnowledge = fourthSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Alpha';
                });
                const fourthAlphaCached = fourthSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Alpha';
                });
                const fourthBetaKnowledge = fourthSnapshot.records.find(function (record) {
                    return record?.type === 'knowledge' && record?.categoryName === 'Beta';
                });
                const fourthBetaCached = fourthSnapshot.records.find(function (record) {
                    return record?.type === 'cached' && record?.categoryName === 'Beta';
                });

                return {
                    firstCounts: firstCounts,
                    secondCounts: secondCounts,
                    thirdCounts: thirdCounts,
                    fourthCounts: fourthCounts,
                    firstKnowledge: firstKnowledge ? {
                        title: firstKnowledge.title,
                        workspaceId: firstKnowledge.workspaceId,
                        pathLabel: firstKnowledge.path?.pathLabel || ''
                    } : null,
                    firstCached: firstCached ? {
                        title: firstCached.title,
                        workspaceId: firstCached.workspaceId,
                        pathLabel: firstCached.path?.pathLabel || ''
                    } : null,
                    firstBetaKnowledge: firstBetaKnowledge ? {
                        title: firstBetaKnowledge.title,
                        workspaceId: firstBetaKnowledge.workspaceId
                    } : null,
                    firstBetaCached: firstBetaCached ? {
                        title: firstBetaCached.title,
                        workspaceId: firstBetaCached.workspaceId
                    } : null,
                    secondBookmark: secondBookmark ? {
                        title: secondBookmark.title,
                        workspaceId: secondBookmark.workspaceId,
                        pathLabel: secondBookmark.path?.pathLabel || ''
                    } : null,
                    secondKnowledge: secondKnowledge ? {
                        title: secondKnowledge.title,
                        workspaceId: secondKnowledge.workspaceId,
                        pathLabel: secondKnowledge.path?.pathLabel || ''
                    } : null,
                    secondCached: secondCached ? {
                        title: secondCached.title,
                        workspaceId: secondCached.workspaceId,
                        pathLabel: secondCached.path?.pathLabel || ''
                    } : null,
                    secondBetaKnowledge: secondBetaKnowledge ? {
                        title: secondBetaKnowledge.title,
                        workspaceId: secondBetaKnowledge.workspaceId
                    } : null,
                    secondBetaCached: secondBetaCached ? {
                        title: secondBetaCached.title,
                        workspaceId: secondBetaCached.workspaceId
                    } : null,
                    secondStats: secondSnapshot.stats || null,
                    thirdAlphaKnowledge: thirdAlphaKnowledge ? {
                        title: thirdAlphaKnowledge.title,
                        workspaceId: thirdAlphaKnowledge.workspaceId
                    } : null,
                    thirdAlphaCached: thirdAlphaCached ? {
                        title: thirdAlphaCached.title,
                        workspaceId: thirdAlphaCached.workspaceId
                    } : null,
                    thirdBetaKnowledge: thirdBetaKnowledge ? {
                        title: thirdBetaKnowledge.title,
                        workspaceId: thirdBetaKnowledge.workspaceId
                    } : null,
                    thirdBetaCached: thirdBetaCached ? {
                        title: thirdBetaCached.title,
                        workspaceId: thirdBetaCached.workspaceId
                    } : null,
                    thirdStats: thirdSnapshot.stats || null,
                    fourthAlphaKnowledge: fourthAlphaKnowledge ? {
                        title: fourthAlphaKnowledge.title,
                        workspaceId: fourthAlphaKnowledge.workspaceId
                    } : null,
                    fourthAlphaCached: fourthAlphaCached ? {
                        title: fourthAlphaCached.title,
                        workspaceId: fourthAlphaCached.workspaceId
                    } : null,
                    fourthBetaKnowledge: fourthBetaKnowledge ? {
                        title: fourthBetaKnowledge.title,
                        workspaceId: fourthBetaKnowledge.workspaceId
                    } : null,
                    fourthBetaCached: fourthBetaCached ? {
                        title: fourthBetaCached.title,
                        workspaceId: fourthBetaCached.workspaceId
                    } : null,
                    fourthStats: fourthSnapshot.stats || null
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
        if (result.firstCounts.cacheByCategory.Alpha !== 1 || result.firstCounts.cacheByCategory.Beta !== 1) {
            throw new Error(`Expected initial full build to hit cache pools once per category: ${JSON.stringify(result)}`);
        }
        if (result.firstCounts.knowledgeByCategory.Alpha !== 1 || result.firstCounts.knowledgeByCategory.Beta !== 1) {
            throw new Error(`Expected initial full build to hit source groups once per category: ${JSON.stringify(result)}`);
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
        if (!result.secondBetaKnowledge || result.secondBetaKnowledge.workspaceId !== 'main' || !result.secondBetaCached || result.secondBetaCached.workspaceId !== 'main') {
            throw new Error(`Expected unaffected Beta source records to stay intact through local incremental rebuild: ${JSON.stringify(result)}`);
        }
        if (!result.secondStats || result.secondStats.knowledgeCount !== 2 || result.secondStats.cachedCount !== 2) {
            throw new Error(`Expected incremental snapshot stats to preserve source-backed records: ${JSON.stringify(result)}`);
        }
        if (result.thirdCounts.cacheLoadPool !== result.secondCounts.cacheLoadPool) {
            throw new Error(`Expected wiki-only source incremental rebuild to skip cache pool reloads: ${JSON.stringify(result)}`);
        }
        if (result.thirdCounts.knowledgeGroups !== result.secondCounts.knowledgeGroups + 1) {
            throw new Error(`Expected source incremental rebuild to refresh only one source group lane: ${JSON.stringify(result)}`);
        }
        if (result.thirdCounts.cacheByCategory.Alpha !== result.secondCounts.cacheByCategory.Alpha || result.thirdCounts.cacheByCategory.Beta !== result.secondCounts.cacheByCategory.Beta) {
            throw new Error(`Expected wiki-only Alpha source mutation to preserve cache pools: ${JSON.stringify(result)}`);
        }
        if (result.thirdCounts.knowledgeByCategory.Alpha !== result.secondCounts.knowledgeByCategory.Alpha + 1 || result.thirdCounts.knowledgeByCategory.Beta !== result.secondCounts.knowledgeByCategory.Beta) {
            throw new Error(`Expected only Alpha knowledge records to rebuild on Alpha source mutation: ${JSON.stringify(result)}`);
        }
        if (!result.thirdAlphaKnowledge || result.thirdAlphaKnowledge.title !== 'Alpha Knowledge v2') {
            throw new Error(`Expected Alpha knowledge records to refresh to v2 after Alpha source mutation: ${JSON.stringify(result)}`);
        }
        if (!result.thirdAlphaCached || result.thirdAlphaCached.title !== 'Alpha Cached Result v1') {
            throw new Error(`Expected Alpha cached records to stay at v1 after wiki-only Alpha source mutation: ${JSON.stringify(result)}`);
        }
        if (!result.thirdBetaKnowledge || result.thirdBetaKnowledge.title !== 'Beta Knowledge v1' || !result.thirdBetaCached || result.thirdBetaCached.title !== 'Beta Cached Result v1') {
            throw new Error(`Expected Beta source records to stay at v1 after Alpha-only source mutation: ${JSON.stringify(result)}`);
        }
        if (!result.thirdStats || result.thirdStats.knowledgeCount !== 2 || result.thirdStats.cachedCount !== 2) {
            throw new Error(`Expected source incremental snapshot stats to preserve both categories: ${JSON.stringify(result)}`);
        }
        if (result.fourthCounts.cacheLoadPool !== result.thirdCounts.cacheLoadPool) {
            throw new Error(`Expected implicit-category storage save to skip cache pool reloads: ${JSON.stringify(result)}`);
        }
        if (result.fourthCounts.knowledgeGroups !== result.thirdCounts.knowledgeGroups + 1) {
            throw new Error(`Expected implicit-category storage save to rebuild only one knowledge lane: ${JSON.stringify(result)}`);
        }
        if (result.fourthCounts.cacheByCategory.Alpha !== result.thirdCounts.cacheByCategory.Alpha || result.fourthCounts.cacheByCategory.Beta !== result.thirdCounts.cacheByCategory.Beta) {
            throw new Error(`Expected implicit-category storage save to preserve cache pools: ${JSON.stringify(result)}`);
        }
        if (result.fourthCounts.knowledgeByCategory.Alpha !== result.thirdCounts.knowledgeByCategory.Alpha + 1 || result.fourthCounts.knowledgeByCategory.Beta !== result.thirdCounts.knowledgeByCategory.Beta) {
            throw new Error(`Expected implicit-category storage save to rebuild only Alpha knowledge records: ${JSON.stringify(result)}`);
        }
        if (!result.fourthAlphaKnowledge || result.fourthAlphaKnowledge.title !== 'Alpha Knowledge v3') {
            throw new Error(`Expected Alpha knowledge records to refresh to v3 after implicit-category storage save: ${JSON.stringify(result)}`);
        }
        if (!result.fourthAlphaCached || result.fourthAlphaCached.title !== 'Alpha Cached Result v1') {
            throw new Error(`Expected Alpha cached records to remain at v1 after implicit-category storage save: ${JSON.stringify(result)}`);
        }
        if (!result.fourthBetaKnowledge || result.fourthBetaKnowledge.title !== 'Beta Knowledge v1' || !result.fourthBetaCached || result.fourthBetaCached.title !== 'Beta Cached Result v1') {
            throw new Error(`Expected Beta source records to stay intact after Alpha implicit-category storage save: ${JSON.stringify(result)}`);
        }
        if (!result.fourthStats || result.fourthStats.knowledgeCount !== 2 || result.fourthStats.cachedCount !== 2) {
            throw new Error(`Expected implicit-category source incremental snapshot stats to preserve both categories: ${JSON.stringify(result)}`);
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
