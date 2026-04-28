window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.knowledgeCoreCacheReady || !ctx.knowledgeCoreSharedReady) return;

    ctx.loadKnowledgeCacheEntries = async function loadKnowledgeCacheEntries(categoryName, options = {}) {
        const knowledge = await ctx.loadSavedKnowledgeSources(categoryName);

        let wikiCacheStore;
        let wikiDataStore;
        let fandomCacheIndex;
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const currentContext = ctx.ensureCategoryContext(window.currentCategoryCtx || window.StorageManager?.categoryContext || '');

        if (resolvedCategory === currentContext && window.CacheCore) {
            wikiCacheStore = window.CacheCore.wikiCacheStore || {};
            wikiDataStore = window.CacheCore.wikiDataStore || { searchResults: {} };
            fandomCacheIndex = await ctx.getScopedStorageValueAsync('fandomCacheIndex', {}, categoryName) || {};
        } else {
            wikiCacheStore = await ctx.getScopedStorageValueAsync('wikiCacheStore', {}, categoryName) || {};
            wikiDataStore = await ctx.getScopedStorageValueAsync('wikiDataStore', { searchResults: {} }, categoryName) || {};
            fandomCacheIndex = await ctx.getScopedStorageValueAsync('fandomCacheIndex', {}, categoryName) || {};
        }

        const fandomResults = wikiDataStore.searchResults && typeof wikiDataStore.searchResults === 'object'
            ? wikiDataStore.searchResults
            : {};
        const includeUncached = options.includeUncached === true || options.includeUncachedKnowledge === true;

        const wikipedia = knowledge.wikiEntries.map(function (entry) {
            const title = String(entry?.title || entry?.name || '').trim();
            if (!title) return null;
            const cached = wikiCacheStore.entryResults?.[title] || wikiCacheStore[title];
            const searchResults = cached?.searchResults && typeof cached.searchResults === 'object'
                ? cached.searchResults
                : {};
            const itemCount = (cached?.main ? 1 : 0) + Object.keys(searchResults).length;

            let updatedAt = ctx.toTimestamp(cached?.lastUpdate || cached?.lastFetch || cached?.timestamp || cached?.main?.lastUpdate || cached?.main?.lastFetch || cached?.main?.timestamp);
            if (!updatedAt && itemCount > 0) updatedAt = Date.now();
            if (!includeUncached && !updatedAt) return null;

            return {
                scope: 'wikipedia',
                key: title,
                title: String(entry?.name || title).trim(),
                subtitle: title,
                updatedAt: updatedAt,
                itemCount: itemCount,
                hasCache: updatedAt > 0
            };
        }).filter(Boolean).sort(function (left, right) {
            return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
        });

        const fandom = knowledge.fandomDomains.map(function (entry) {
            const domain = String(entry?.domain || entry || '').trim();
            if (!domain) return null;
            const cached = fandomResults[domain];
            const cacheIndexEntry = fandomCacheIndex && typeof fandomCacheIndex === 'object'
                ? fandomCacheIndex[domain]
                : null;

            let updatedAt = ctx.toTimestamp(cached?.lastUpdate || cacheIndexEntry?.lastUpdate || cacheIndexEntry?.updatedAt);
            if (!updatedAt && cached && typeof cached === 'object') {
                Object.keys(cached).forEach(function (key) {
                    if (key !== 'lastUpdate' && cached[key] && typeof cached[key] === 'object') {
                        const childTs = ctx.toTimestamp(cached[key].lastUpdate || cached[key].lastFetch || cached[key].timestamp);
                        if (childTs > updatedAt) updatedAt = childTs;
                    }
                });
            }
            if (!updatedAt && cached && Object.keys(cached).filter(function (key) { return key !== 'lastUpdate'; }).length > 0) {
                updatedAt = Date.now();
            }

            let itemCount = 0;
            if (cached) {
                itemCount = Object.keys(cached).filter(function (key) { return key !== 'lastUpdate'; }).length;
            }
            if (!(itemCount > 0) && cacheIndexEntry) {
                itemCount = Number(cacheIndexEntry.itemCount || 0);
            }

            if (!includeUncached && !updatedAt && itemCount === 0) return null;

            return {
                scope: 'fandom',
                key: domain,
                title: String(entry?.name || domain).trim(),
                subtitle: domain,
                updatedAt: updatedAt,
                itemCount: itemCount,
                hasCache: updatedAt > 0 || itemCount > 0,
                domain: domain
            };
        }).filter(Boolean).sort(function (left, right) {
            return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
        });

        return { wikipedia, fandom };
    };

    ctx.clearKnowledgeCaches = async function clearKnowledgeCaches(categoryName) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const currentContext = ctx.ensureCategoryContext(window.currentCategoryCtx || window.StorageManager?.categoryContext || '');
        const knowledge = await ctx.loadSavedKnowledgeSources(resolvedCategory);

        let wikiCacheStore;
        let wikiDataStore;
        let fandomCacheIndex;
        if (resolvedCategory === currentContext && window.CacheCore) {
            wikiCacheStore = window.CacheCore.wikiCacheStore || {};
            wikiDataStore = window.CacheCore.wikiDataStore || { searchResults: {} };
            fandomCacheIndex = await ctx.getScopedStorageValueAsync('fandomCacheIndex', {}, resolvedCategory) || {};
        } else {
            wikiCacheStore = await ctx.getScopedStorageValueAsync('wikiCacheStore', {}, resolvedCategory) || {};
            wikiDataStore = await ctx.getScopedStorageValueAsync('wikiDataStore', { searchResults: {} }, resolvedCategory) || { searchResults: {} };
            fandomCacheIndex = await ctx.getScopedStorageValueAsync('fandomCacheIndex', {}, resolvedCategory) || {};
        }

        knowledge.wikiEntries.forEach(function (entry) {
            const title = String(entry?.title || entry?.name || '').trim();
            if (!title) return;
            if (wikiCacheStore.entryResults && wikiCacheStore.entryResults[title]) {
                delete wikiCacheStore.entryResults[title];
            }
            if (wikiCacheStore[title]) {
                delete wikiCacheStore[title];
            }
        });

        if (!wikiDataStore.searchResults || typeof wikiDataStore.searchResults !== 'object') {
            wikiDataStore.searchResults = {};
        }

        knowledge.fandomDomains.forEach(function (entry) {
            const domain = String(entry?.domain || entry || '').trim();
            if (!domain) return;
            delete wikiDataStore.searchResults[domain];
            if (fandomCacheIndex && typeof fandomCacheIndex === 'object') {
                delete fandomCacheIndex[domain];
            }
        });

        await ctx.saveScopedStorageValueAsync('wikiCacheStore', wikiCacheStore, resolvedCategory);
        await ctx.saveScopedStorageValueAsync('wikiDataStore', wikiDataStore, resolvedCategory);
        await ctx.saveScopedStorageValueAsync('fandomCacheIndex', fandomCacheIndex, resolvedCategory);

        if (resolvedCategory === currentContext && window.CacheCore) {
            window.CacheCore.wikiCacheStore = wikiCacheStore;
            window.CacheCore.wikiDataStore = wikiDataStore;
            if (typeof window.CacheCore.saveWikiCacheStore === 'function') window.CacheCore.saveWikiCacheStore();
            if (typeof window.CacheCore.saveWikiDataStore === 'function') window.CacheCore.saveWikiDataStore();
        }

        if (window.CacheCore && typeof window.CacheCore.clearInternalApiCache === 'function') {
            window.CacheCore.clearInternalApiCache('wiki_');
            window.CacheCore.clearInternalApiCache('wikipedia_search_');
            window.CacheCore.clearInternalApiCache('fandom_');
        }

        if (window.WikiManager && typeof window.WikiManager.refreshCacheStores === 'function') {
            window.WikiManager.refreshCacheStores();
        }
    };

    ctx.getSourceCacheCandidates = function getSourceCacheCandidates(entry) {
        if (!entry) return [];
        if (entry.scope === 'wikipedia') {
            const identities = ctx.uniqueIdentities([entry.key, entry.title, entry.subtitle]);
            const mainIdentities = identities.map(function (identity) {
                return identity.replace(/\s*\(.*?\)\s*/g, '').trim();
            }).filter(Boolean);
            return Array.from(new Set(identities.concat(mainIdentities)));
        }
        if (entry.scope === 'fandom') {
            const domain = String(entry.key || '').trim();
            const domainStem = domain.replace(/\.fandom\.com$/i, '');
            const candidates = [entry.key, entry.title, entry.subtitle, domainStem];
            const cleanStem = domainStem.replace(/(pedia|wiki|encyclopedia)$/i, '');
            if (cleanStem && cleanStem !== domainStem) candidates.push(cleanStem);
            return ctx.uniqueIdentities(candidates);
        }
        if (entry.query) {
            return ctx.uniqueIdentities([entry.query]);
        }
        return [];
    };

    ctx.buildSourceCacheGroups = async function buildSourceCacheGroups(categoryName, options = {}) {
        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const apiEntries = api.Cache ? await api.Cache.listQueries(resolvedCategory) : [];
        const knowledgeEntries = await ctx.loadKnowledgeCacheEntries(resolvedCategory, {
            includeUncached: options.includeUncachedKnowledge === true
        });

        const aliasMap = new Map();
        const groups = {};

        function getOrCreateGroup(entry, aliases) {
            let group = null;
            const entryTitle = String(entry.title || '').trim().toLowerCase();

            aliases.forEach(function (alias) {
                if (!group && aliasMap.has(alias)) {
                    group = aliasMap.get(alias);
                }
            });

            if (!group && entryTitle) {
                const existingGroups = Object.values(groups);
                group = existingGroups.find(function (candidate) {
                    return String(candidate.title || '').trim().toLowerCase() === entryTitle;
                }) || null;
                if (group) {
                    aliases.forEach(function (alias) {
                        group.aliases.add(alias);
                        aliasMap.set(alias, group);
                    });
                }
            }

            if (!group) {
                const primaryId = aliases[0] || ctx.normalizeSourceIdentity(entry.title || entry.key) || ('group_' + Date.now());
                group = {
                    id: primaryId,
                    title: entry.title || entry.key || 'Untitled',
                    aliases: new Set(aliases),
                    wikipediaEntry: null,
                    fandomEntry: null,
                    apiEntries: [],
                    updatedAt: 0
                };
                groups[primaryId] = group;
            }

            aliases.forEach(function (alias) {
                if (!alias) return;
                group.aliases.add(alias);
                aliasMap.set(alias, group);
            });

            return group;
        }

        knowledgeEntries.wikipedia.forEach(function (entry) {
            const aliases = ctx.getSourceCacheCandidates(entry);
            const group = getOrCreateGroup(entry, aliases);
            group.wikipediaEntry = entry;
            group.title = String(entry.title || group.title).trim();
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        knowledgeEntries.fandom.forEach(function (entry) {
            const aliases = ctx.getSourceCacheCandidates(entry);
            const group = getOrCreateGroup(entry, aliases);
            group.fandomEntry = entry;
            if (!group.wikipediaEntry) {
                group.title = String(entry.title || group.title).trim();
            }
            group.updatedAt = Math.max(Number(group.updatedAt || 0), Number(entry.updatedAt || 0));
        });

        apiEntries.forEach(function (entry) {
            const aliases = ctx.getSourceCacheCandidates({ scope: 'api', query: entry.query });
            const group = getOrCreateGroup({ key: entry.query, title: entry.query, scope: 'api' }, aliases);
            if (!group.apiEntries) group.apiEntries = [];
            group.apiEntries.push(entry);
            if (!group.wikipediaEntry && !group.fandomEntry) {
                group.title = String(entry.query || group.title).trim();
            }
            const entryTs = Number(entry.lastUsedAt || entry.updatedAt || entry.timestamp || entry.createdAt || 0);
            group.updatedAt = Math.max(Number(group.updatedAt || 0), entryTs);
        });

        return Object.values(groups)
            .filter(function (group) {
                return group.wikipediaEntry || group.fandomEntry || (group.apiEntries && group.apiEntries.length > 0);
            })
            .sort(function (left, right) {
                return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
            });
    };

    ctx.findSourceCacheGroup = async function findSourceCacheGroup(categoryName, candidates, options = {}) {
        const aliases = ctx.uniqueIdentities(candidates);
        if (!aliases.length) return null;
        const groups = await ctx.buildSourceCacheGroups(categoryName, options);
        return groups.find(function (group) {
            return aliases.some(function (alias) {
                return group.aliases && group.aliases.has(alias);
            });
        }) || null;
    };

    ctx.summarizeApiGroupProviders = function summarizeApiGroupProviders(apiEntries) {
        const counts = {};
        (Array.isArray(apiEntries) ? apiEntries : []).forEach(function (entry) {
            Object.entries(entry?.summary?.perSource || {}).forEach(function ([key, count]) {
                const nextCount = Number(count || 0);
                if (!nextCount) return;
                counts[key] = Number(counts[key] || 0) + nextCount;
            });
        });
        return counts;
    };

    ctx.knowledgeCoreCacheReady = true;
})(window.EveOS.API);
