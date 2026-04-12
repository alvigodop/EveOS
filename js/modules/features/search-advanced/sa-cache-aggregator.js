window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const Cache = window.EveOS.API?.Cache;

    // --- Scope helpers ---
    // scope = { workspaceId?, categoryName? }
    // no scope / empty = all tabs, all cards
    // workspaceId only = all cards in that tab + its sub-tabs
    // workspaceId + categoryName = single card

    function getWorkspaceIdsInScope(scope) {
        if (!scope?.workspaceId) return null; // null means "all"
        const wsId = String(scope.workspaceId).trim();
        const ids = new Set([wsId]);
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config.workspaces : null)
            || [];
        if (helpers?.findById && helpers?.getDescendantIds) {
            const ws = helpers.findById(workspaces, wsId);
            if (ws) {
                helpers.getDescendantIds(ws).forEach(function (id) { ids.add(id); });
            }
        }
        return ids;
    }

    function getScopedLinks(scope) {
        const links = Array.isArray(window.eveState?.links) ? window.eveState.links : (typeof window.links !== 'undefined' ? window.links : []);
        const wsIds = getWorkspaceIdsInScope(scope);
        const catFilter = scope?.categoryName ? String(scope.categoryName).trim() : null;

        return links.filter(function (link) {
            if (!link) return false;
            if (wsIds && !wsIds.has(String(link.workspace || 'main').trim())) return false;
            if (catFilter && String(link.category || 'Unsorted').trim() !== catFilter) return false;
            return true;
        });
    }

    function getVisibleCategories(scope) {
        const scopedLinks = getScopedLinks(scope);
        const categories = new Set();
        scopedLinks.forEach(function (link) {
            const cat = String(link?.category || 'Unsorted').trim();
            if (cat) categories.add(cat);
        });
        return Array.from(categories);
    }

    function getActiveWorkspace() {
        return String(
            window.eveState?.config?.activeWorkspace
            || window.config?.activeWorkspace
            || 'main'
        ).trim() || 'main';
    }

    async function aggregateAllCaches(scope) {
        if (!Cache || typeof Cache.loadPool !== 'function') {
            return { entries: [], stats: { totalEntries: 0, totalProviders: 0, cardCount: 0 } };
        }

        const categories = getVisibleCategories(scope);
        const allEntries = [];
        const providerSet = new Set();

        for (let i = 0; i < categories.length; i++) {
            const categoryName = categories[i];
            try {
                const pool = await Cache.loadPool(categoryName);
                if (!pool || typeof pool !== 'object') continue;

                const queries = Object.keys(pool);
                queries.forEach(function (queryKey) {
                    const entry = pool[queryKey];
                    if (!entry || typeof entry !== 'object') return;
                    const sources = entry.summary?.perSource || {};
                    Object.keys(sources).forEach(function (provider) {
                        if (Number(sources[provider] || 0) > 0) providerSet.add(provider);
                    });
                    allEntries.push({
                        query: String(entry.query || queryKey || '').trim(),
                        categoryName: categoryName,
                        updatedAt: Number(entry.updatedAt || entry.createdAt || 0),
                        results: Array.isArray(entry.results) ? entry.results : [],
                        summary: entry.summary || {},
                        perSource: sources
                    });
                });
            } catch (err) {
                console.warn('[NexusSearch] Failed to load cache for:', categoryName, err);
            }
        }

        return {
            entries: allEntries,
            stats: {
                totalEntries: allEntries.length,
                totalProviders: providerSet.size,
                cardCount: categories.length,
                providers: Array.from(providerSet)
            }
        };
    }

    function searchAcrossCards(query, aggregatedData) {
        if (!query || !aggregatedData?.entries?.length) return [];

        const q = String(query).trim().toLowerCase();
        if (!q) return [];

        const matches = [];

        aggregatedData.entries.forEach(function (entry) {
            // Check if the cached query matches
            const entryQuery = String(entry.query || '').toLowerCase();
            const queryMatch = entryQuery.includes(q) || q.includes(entryQuery);

            // Check individual results
            const results = Array.isArray(entry.results) ? entry.results : [];
            results.forEach(function (result) {
                if (!result) return;
                const title = String(result.title || '').toLowerCase();
                const url = String(result.url || result.link || '').toLowerCase();
                const description = String(result.description || result.snippet || '').toLowerCase();

                const isMatch = queryMatch
                    || title.includes(q)
                    || url.includes(q)
                    || description.includes(q);

                if (isMatch) {
                    matches.push({
                        type: 'cached',
                        title: result.title || result.name || 'Untitled',
                        url: result.url || result.link || '',
                        description: result.description || result.snippet || '',
                        provider: result.source || result.provider || 'unknown',
                        sourceCard: entry.categoryName,
                        sourceQuery: entry.query,
                        updatedAt: entry.updatedAt,
                        score: (title.includes(q) ? 3 : 0)
                            + (queryMatch ? 2 : 0)
                            + (url.includes(q) ? 1 : 0)
                    });
                }
            });
        });

        // Deduplicate by URL
        const seen = new Set();
        const deduped = [];
        matches.sort(function (a, b) { return b.score - a.score; });
        matches.forEach(function (m) {
            const key = String(m.url || m.title || '').toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(m);
            }
        });

        return deduped;
    }

    function searchBookmarks(query, scope) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return [];

        const scopedLinks = getScopedLinks(scope);
        const matches = [];

        scopedLinks.forEach(function (link) {
            if (!link) return;
            const title = String(link.title || link.name || '').toLowerCase();
            const url = String(link.url || '').toLowerCase();
            const category = String(link.category || 'Unsorted');

            const isMatch = title.includes(q) || url.includes(q);
            if (isMatch) {
                matches.push({
                    type: 'bookmark',
                    title: link.title || link.name || link.url || 'Untitled',
                    url: link.url || '',
                    description: '',
                    provider: 'bookmark',
                    sourceCard: category,
                    sourceQuery: '',
                    updatedAt: 0,
                    score: (title.includes(q) ? 3 : 0) + (url.includes(q) ? 1 : 0)
                });
            }
        });

        matches.sort(function (a, b) { return b.score - a.score; });
        return matches;
    }

    function getKnownWorkspaceIds() {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config.workspaces : null)
            || [];
        if (helpers && typeof helpers.flattenIds === 'function') {
            return new Set(helpers.flattenIds(workspaces));
        }
        // Fallback: top-level only
        const ids = new Set();
        if (Array.isArray(workspaces)) {
            workspaces.forEach(function (ws) {
                if (ws?.id) ids.add(String(ws.id));
            });
        }
        if (ids.size === 0) ids.add('main');
        return ids;
    }

    function detectOrphanedLinks() {
        const links = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
        const knownIds = getKnownWorkspaceIds();
        const orphaned = [];
        const orphanedByWorkspace = {};

        links.forEach(function (link, idx) {
            if (!link) return;
            const wsId = String(link.workspace || 'main').trim();
            if (!knownIds.has(wsId)) {
                orphaned.push({
                    index: idx,
                    link: link,
                    workspace: wsId,
                    category: String(link.category || 'Unsorted'),
                    title: link.title || link.name || link.url || 'Untitled',
                    url: link.url || ''
                });
                if (!orphanedByWorkspace[wsId]) orphanedByWorkspace[wsId] = [];
                orphanedByWorkspace[wsId].push(link);
            }
        });

        return {
            orphaned: orphaned,
            orphanedByWorkspace: orphanedByWorkspace,
            totalOrphaned: orphaned.length,
            totalLinks: links.length,
            knownWorkspaces: Array.from(knownIds),
            ghostWorkspaces: Object.keys(orphanedByWorkspace)
        };
    }

    function rescueOrphanedLinks() {
        const links = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
        const knownIds = getKnownWorkspaceIds();
        const workspaces = (typeof config !== 'undefined' ? config.workspaces : null)
            || window.eveState?.config?.workspaces
            || [];

        // Gather ghost workspace IDs
        const ghostIds = new Set();
        links.forEach(function (link) {
            if (!link) return;
            const wsId = String(link.workspace || 'main').trim();
            if (!knownIds.has(wsId)) ghostIds.add(wsId);
        });

        if (ghostIds.size === 0) return { rescued: 0, restoredTabs: [] };

        // Recreate each ghost workspace as a real tab
        const restoredTabs = [];
        ghostIds.forEach(function (ghostId) {
            // Count links in this ghost workspace
            var linkCount = 0;
            links.forEach(function (link) {
                if (link && String(link.workspace || 'main').trim() === ghostId) linkCount++;
            });

            // Generate a readable name from the ID
            var displayName = 'Recovered';
            var tsMatch = ghostId.match(/(\d{10,})/);
            if (tsMatch) {
                try {
                    var d = new Date(Number(tsMatch[1]));
                    if (!isNaN(d.getTime())) {
                        displayName = 'Recovered ' + (d.getMonth() + 1) + '/' + d.getDate();
                    }
                } catch (e) { /* ignore */ }
            }

            var newWs = {
                id: ghostId,
                name: displayName + ' (' + linkCount + ')',
                icon: '🔄',
                subTabs: []
            };

            workspaces.push(newWs);
            restoredTabs.push({ id: ghostId, name: newWs.name, linkCount: linkCount });
        });

        // Save
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof saveData === 'function') saveData();

        return {
            rescued: links.filter(function (l) { return l && ghostIds.has(String(l.workspace || 'main').trim()); }).length,
            restoredTabs: restoredTabs
        };
    }

    // Convenience: build a scope description string for UI display
    function describeScopeLabel(scope) {
        if (!scope || (!scope.workspaceId && !scope.categoryName)) return 'All Tabs';
        if (scope.categoryName && scope.workspaceId) return scope.categoryName;
        if (scope.workspaceId) {
            const helpers = window.EveWorkspaceHelpers;
            const workspaces = window.eveState?.config?.workspaces || [];
            const ws = helpers?.findById ? helpers.findById(workspaces, scope.workspaceId) : null;
            return ws?.name || scope.workspaceId;
        }
        return 'Scoped';
    }

    ns.CacheAggregator = {
        getVisibleCategories,
        getActiveWorkspace,
        getKnownWorkspaceIds,
        aggregateAllCaches,
        searchAcrossCards,
        searchBookmarks,
        detectOrphanedLinks,
        rescueOrphanedLinks,
        getScopedLinks,
        getWorkspaceIdsInScope,
        describeScopeLabel
    };
})();
