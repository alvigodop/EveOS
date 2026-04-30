window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.CacheAggregatorDiagnostics) return;

    function getScopeApi() {
        return ns.CacheAggregatorScope || {};
    }

    function getLiveLinks() {
        if (typeof getScopeApi().getLiveLinks === 'function') return getScopeApi().getLiveLinks();
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        return [];
    }

    function getDatapackIndexApi() {
        if (typeof getScopeApi().getDatapackIndexApi === 'function') return getScopeApi().getDatapackIndexApi();
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getDatapackSnapshot(indexApi) {
        if (typeof getScopeApi().getDatapackSnapshot === 'function') return getScopeApi().getDatapackSnapshot(indexApi);
        return typeof indexApi?.getSnapshot === 'function' ? indexApi.getSnapshot() : null;
    }

    function getKnownWorkspaceIds() {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config.workspaces : null)
            || [];
        if (helpers?.flattenIds) {
            const helperIds = new Set(helpers.flattenIds(workspaces));
            if (helperIds.size === 0) helperIds.add('main');
            return helperIds;
        }
        const ids = new Set();
        function visit(items) {
            (Array.isArray(items) ? items : []).forEach(function (ws) {
                const id = String(ws?.id || '').trim();
                if (!id) return;
                ids.add(id);
                visit(ws.subTabs);
            });
        }
        visit(workspaces);
        if (ids.size === 0) ids.add('main');
        return ids;
    }

    function buildOrphanReport(knownIds, orphaned, orphanedByWorkspace, totalLinks, source) {
        const ghostWorkspaces = Object.keys(orphanedByWorkspace || {}).sort();
        return {
            knownIds: Array.from(knownIds || []),
            orphaned: orphaned,
            orphanedByWorkspace: orphanedByWorkspace,
            ghostWorkspaces: ghostWorkspaces,
            totalOrphaned: orphaned.length,
            totalLinks: totalLinks,
            source: source
        };
    }

    function detectOrphanedLinks() {
        const indexApi = getDatapackIndexApi();
        const knownIds = getKnownWorkspaceIds();
        const snapshot = getDatapackSnapshot(indexApi);
        const orphaned = [];
        const orphanedByWorkspace = {};

        if (Array.isArray(snapshot?.records)) {
            snapshot.records.forEach(function (record, idx) {
                if (String(record?.type || '') !== 'bookmark') return;
                const linkId = String(record?.path?.linkId || record?.provenance?.linkId || '').trim();
                const workspaceId = String(record?.workspaceId || record?.path?.workspaceId || 'main').trim() || 'main';
                const resolved = linkId && typeof indexApi?.resolveBookmarkLink === 'function'
                    ? indexApi.resolveBookmarkLink(linkId)
                    : null;
                const link = resolved || {
                    id: linkId || record.id || `indexed-${idx}`,
                    title: record.title || 'Indexed Bookmark',
                    url: record.url || '',
                    category: record.categoryName || record?.path?.categoryName || 'Unsorted',
                    workspace: workspaceId
                };

                if (knownIds.has(workspaceId)) return;
                const enriched = {
                    index: idx,
                    id: link.id,
                    title: link.title || link.url || '(Untitled)',
                    url: link.url || '',
                    category: link.category || 'Unsorted',
                    workspace: workspaceId
                };
                orphaned.push(enriched);
                if (!orphanedByWorkspace[workspaceId]) orphanedByWorkspace[workspaceId] = [];
                orphanedByWorkspace[workspaceId].push(enriched);
            });
            return buildOrphanReport(
                knownIds,
                orphaned,
                orphanedByWorkspace,
                snapshot.records.filter(function (record) { return String(record?.type || '') === 'bookmark'; }).length,
                'datapack-index'
            );
        }

        const links = getLiveLinks();
        links.forEach(function (link, idx) {
            if (!link) return;
            const wsId = String(link.workspace || 'main').trim() || 'main';
            if (!knownIds.has(wsId)) {
                const enriched = {
                    index: idx,
                    id: link.id,
                    title: link.title || link.url || '(Untitled)',
                    url: link.url || '',
                    category: link.category || 'Unsorted',
                    workspace: wsId || '(empty)'
                };
                orphaned.push(enriched);
                if (!orphanedByWorkspace[enriched.workspace]) orphanedByWorkspace[enriched.workspace] = [];
                orphanedByWorkspace[enriched.workspace].push(enriched);
            }
        });

        return buildOrphanReport(knownIds, orphaned, orphanedByWorkspace, links.length, 'live-links');
    }

    function rescueOrphanedLinks() {
        const links = getLiveLinks();
        const configObject = (typeof config !== 'undefined' ? config : null)
            || window.eveState?.config
            || null;
        const report = detectOrphanedLinks();
        const ghostIds = new Set((report.ghostWorkspaces || []).filter(Boolean));
        links.forEach(function (link) {
            if (link && ghostIds.has(String(link.workspace || 'main').trim()) && !link.category) {
                link.category = 'Recovered';
            }
        });
        const restoredTabs = [];
        ghostIds.forEach(function (ghostId) {
            restoredTabs.push({ id: ghostId, name: `Recovered ${ghostId}`, icon: 'folder', subTabs: [] });
        });
        if (restoredTabs.length && Array.isArray(configObject?.workspaces)) {
            const existing = new Set(getKnownWorkspaceIds());
            configObject.workspaces = configObject.workspaces.concat(restoredTabs.filter(function (tab) {
                return !existing.has(String(tab.id || '').trim());
            }));
        }
        if (typeof window.setLiveLinks === 'function') {
            window.setLiveLinks(links);
        }
        if (typeof saveConfig === 'function') saveConfig({
            source: 'nexus-rescue-orphaned-links',
            immediate: true,
            meta: { workspaces: Array.from(ghostIds) }
        });
        if (typeof saveData === 'function') saveData({
            forceRender: true,
            immediate: true,
            source: 'nexus-rescue-orphaned-links',
            meta: { workspaceIds: Array.from(ghostIds) }
        });
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof renderDashboard === 'function') renderDashboard();
        return {
            restoredTabs: restoredTabs,
            rescued: Number(report.totalOrphaned || 0),
            mode: restoredTabs.length ? 'restored-tabs' : 'none'
        };
    }

    function describeScopeLabel(scope) {
        const explicitWorkspaceIds = Array.isArray(scope?.workspaceIds)
            ? scope.workspaceIds.map(function (workspaceId) { return String(workspaceId || '').trim(); }).filter(Boolean)
            : [];
        if (explicitWorkspaceIds.length) {
            const groupName = String(scope.groupName || '').trim();
            return `${groupName || 'Scoped tabs'} (${explicitWorkspaceIds.length} tab${explicitWorkspaceIds.length === 1 ? '' : 's'})`;
        }
        if (scope?.categoryName) return `Card: ${scope.categoryName}`;
        if (scope?.workspaceId) {
            const helpers = window.EveWorkspaceHelpers;
            const workspaces = window.eveState?.config?.workspaces || [];
            const ws = helpers?.findById ? helpers.findById(workspaces, scope.workspaceId) : null;
            return `Tab: ${ws?.name || scope.workspaceId}`;
        }
        return 'All Tabs';
    }

    ns.CacheAggregatorDiagnostics = {
        getKnownWorkspaceIds,
        detectOrphanedLinks,
        rescueOrphanedLinks,
        describeScopeLabel
    };
})();
