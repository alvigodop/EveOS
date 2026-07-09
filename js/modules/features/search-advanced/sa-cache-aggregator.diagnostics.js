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

    function buildOrphanReport(knownIds, orphaned, orphanedByWorkspace, totalLinks, source, ghostLabels, ghostGroups, groupLabels) {
        const ghostWorkspaces = Object.keys(orphanedByWorkspace || {}).sort();
        return {
            knownIds: Array.from(knownIds || []),
            orphaned: orphaned,
            orphanedByWorkspace: orphanedByWorkspace,
            ghostWorkspaces: ghostWorkspaces,
            // ghostId -> the last human name the Nexus index saw for that workspace (before it
            // orphaned). This is how a recovered tab gets its ORIGINAL name back instead of a raw
            // id: once a workspace drops out of live config the name is gone from config, but the
            // indexed records still carry the label captured while it existed.
            ghostLabels: ghostLabels || {},
            // ghostId -> the sidebar-group id the tab belonged to, and groupId -> the group's
            // last known name. Groups live only in config, so when corruption takes them out the
            // indexed records are the only surviving source for rebuilding group membership.
            ghostGroups: ghostGroups || {},
            groupLabels: groupLabels || {},
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
        const ghostLabels = {};
        const ghostGroups = {};
        const groupLabels = {};

        if (Array.isArray(snapshot?.records)) {
            snapshot.records.forEach(function (record, idx) {
                if (String(record?.type || '') !== 'bookmark') return;
                const linkId = String(record?.path?.linkId || record?.provenance?.linkId || '').trim();
                const workspaceId = String(record?.workspaceId || record?.path?.workspaceId || 'main').trim() || 'main';
                // Remember the human name this workspace had when it was indexed. Only keep a label
                // that is a real name (not just the id echoed back), so recovery can restore it.
                const indexedLabel = String(record?.path?.workspaceLabel || record?.workspaceLabel || '').trim();
                if (indexedLabel && indexedLabel !== workspaceId && !ghostLabels[workspaceId]) {
                    ghostLabels[workspaceId] = indexedLabel;
                }
                // Remember group membership + group name the same way — any record (orphaned or
                // not) can teach us a group's name, so a corrupted group is recoverable as long
                // as one indexed record still carries it.
                const recordGroupId = String(record?.path?.groupId || '').trim();
                const recordGroupLabel = String(record?.path?.groupLabel || '').trim();
                if (recordGroupId) {
                    if (recordGroupLabel && !groupLabels[recordGroupId]) groupLabels[recordGroupId] = recordGroupLabel;
                    if (!ghostGroups[workspaceId]) ghostGroups[workspaceId] = recordGroupId;
                }
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
                'datapack-index',
                ghostLabels,
                ghostGroups,
                groupLabels
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

        return buildOrphanReport(knownIds, orphaned, orphanedByWorkspace, links.length, 'live-links', ghostLabels, ghostGroups, groupLabels);
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
        const ghostLabels = report.ghostLabels || {};
        const ghostGroups = report.ghostGroups || {};
        const groupLabels = report.groupLabels || {};
        const restoredTabs = [];
        const neededGroupIds = new Set();
        ghostIds.forEach(function (ghostId) {
            // Restore the ORIGINAL tab name when the index still knows it; only fall back to the
            // id-based placeholder when no prior name survives anywhere.
            const originalName = String(ghostLabels[ghostId] || '').trim();
            const name = (originalName && originalName !== ghostId) ? originalName : `Recovered ${ghostId}`;
            const restoredTab = { id: ghostId, name: name, icon: 'folder', subTabs: [] };
            // Restore sidebar-group membership the same way: the indexed records remember which
            // group the tab lived in even after config lost it.
            const groupId = String(ghostGroups[ghostId] || '').trim();
            if (groupId) {
                restoredTab.groupId = groupId;
                neededGroupIds.add(groupId);
            }
            restoredTabs.push(restoredTab);
        });
        if (restoredTabs.length && Array.isArray(configObject?.workspaces)) {
            const existing = new Set(getKnownWorkspaceIds());
            configObject.workspaces = configObject.workspaces.concat(restoredTabs.filter(function (tab) {
                return !existing.has(String(tab.id || '').trim());
            }));
        }
        // Recreate group tabs that recovered tabs point at, with their ORIGINAL names when the
        // index still knows them. Existing groups are left untouched.
        const restoredGroups = [];
        if (neededGroupIds.size && configObject) {
            if (!Array.isArray(configObject.sidebarGroups)) configObject.sidebarGroups = [];
            neededGroupIds.forEach(function (groupId) {
                const exists = configObject.sidebarGroups.some(function (group) {
                    return String(group?.id || '').trim() === groupId;
                });
                if (exists) return;
                const group = {
                    id: groupId,
                    name: String(groupLabels[groupId] || '').trim() || `Recovered Group ${groupId}`,
                    color: '',
                    collapsed: false,
                    hidden: false,
                    parentWorkspaceId: ''
                };
                configObject.sidebarGroups.push(group);
                restoredGroups.push(group);
            });
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
            restoredGroups: restoredGroups,
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
