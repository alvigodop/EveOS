window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;

    function readWorkspaces() {
        return window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config?.workspaces : null)
            || [];
    }

    function findWorkspaceById(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = readWorkspaces();
        if (helpers?.findById) return helpers.findById(workspaces, workspaceId);
        return Array.isArray(workspaces)
            ? workspaces.find(function (ws) { return String(ws?.id || '') === String(workspaceId || ''); }) || null
            : null;
    }

    function findParentWorkspace(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        if (!helpers?.findParent) return null;
        return helpers.findParent(readWorkspaces(), workspaceId) || null;
    }

    function buildWorkspaceTrail(workspaceId) {
        const wsId = String(workspaceId || 'main').trim() || 'main';
        const workspace = findWorkspaceById(wsId);
        if (!workspace) {
            return [{ id: wsId, name: wsId, icon: 'Tab' }];
        }

        const trail = [{
            id: workspace.id,
            name: String(workspace.name || workspace.id || wsId).trim(),
            icon: String(workspace.icon || 'Tab').trim() || 'Tab'
        }];

        let parent = findParentWorkspace(workspace.id);
        while (parent) {
            trail.unshift({
                id: parent.id,
                name: String(parent.name || parent.id || '').trim() || String(parent.id || '').trim(),
                icon: String(parent.icon || 'Tab').trim() || 'Tab'
            });
            parent = findParentWorkspace(parent.id);
        }

        return trail;
    }

    function buildWorkspaceLabel(workspaceId) {
        return buildWorkspaceTrail(workspaceId).map(function (segment) {
            return segment.name;
        }).join(' > ');
    }

    function sortWorkspaceIds(workspaceIds) {
        const ids = Array.from(new Set((Array.isArray(workspaceIds) ? workspaceIds : [])
            .map(function (value) { return String(value || '').trim(); })
            .filter(Boolean)));
        const activeWorkspace = ns.CacheAggregator?.getActiveWorkspace
            ? String(ns.CacheAggregator.getActiveWorkspace() || '').trim()
            : '';
        ids.sort(function (left, right) {
            if (left === activeWorkspace && right !== activeWorkspace) return -1;
            if (right === activeWorkspace && left !== activeWorkspace) return 1;
            return buildWorkspaceLabel(left).localeCompare(buildWorkspaceLabel(right));
        });
        return ids;
    }

    // Capture the ROOT tab's sidebar-group membership at index time. Group name + membership
    // live only in config — once corruption drops them there, the indexed records are the only
    // place recovery can learn "this tab belonged to group X named Y".
    function buildGroupMeta(trail) {
        const rootId = Array.isArray(trail) && trail.length ? String(trail[0].id || '').trim() : '';
        if (!rootId) return { groupId: '', groupLabel: '' };
        const root = findWorkspaceById(rootId);
        const groupId = String(root?.groupId || '').trim();
        if (!groupId) return { groupId: '', groupLabel: '' };
        const cfg = window.eveState?.config || (typeof config !== 'undefined' ? config : null);
        const groups = Array.isArray(cfg?.sidebarGroups) ? cfg.sidebarGroups : [];
        const group = groups.find(function (item) { return String(item?.id || '') === groupId; });
        return { groupId: groupId, groupLabel: String(group?.name || '').trim() };
    }

    function buildPathMeta(input) {
        const workspaceIds = sortWorkspaceIds(input?.workspaceIds || [input?.workspaceId]);
        const workspaceId = String(input?.workspaceId || workspaceIds[0] || 'main').trim() || 'main';
        const categoryName = String(input?.categoryName || 'Unsorted').trim() || 'Unsorted';
        const folderId = String(input?.folderId || '').trim();
        const folderLabel = String(input?.folderLabel || '').trim();
        const pathLabelParts = [buildWorkspaceLabel(workspaceId), categoryName];
        if (folderLabel) pathLabelParts.push(folderLabel);
        const trail = buildWorkspaceTrail(workspaceId);
        const groupMeta = buildGroupMeta(trail);

        return {
            workspaceId: workspaceId,
            workspaceIds: workspaceIds,
            workspaceLabel: buildWorkspaceLabel(workspaceId),
            workspaceTrail: trail,
            groupId: groupMeta.groupId,
            groupLabel: groupMeta.groupLabel,
            categoryName: categoryName,
            folderId: folderId,
            folderLabel: folderLabel,
            linkId: input?.linkId || '',
            ambiguousWorkspace: workspaceIds.length > 1,
            pathLabel: pathLabelParts.filter(Boolean).join(' > ')
        };
    }

    function resolveCategoryPath(categoryName, scope) {
        const links = ns.CacheAggregator?.getScopedLinks
            ? ns.CacheAggregator.getScopedLinks(scope)
            : [];
        const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        const matchingLinks = links.filter(function (link) {
            return String(link?.category || 'Unsorted').trim() === normalizedCategory;
        });
        const workspaceIds = matchingLinks.map(function (link) {
            return String(link?.workspace || 'main').trim() || 'main';
        });

        return buildPathMeta({
            workspaceIds: workspaceIds,
            workspaceId: sortWorkspaceIds(workspaceIds)[0] || String(scope?.workspaceId || 'main').trim() || 'main',
            categoryName: normalizedCategory
        });
    }

    function buildBookmarkPath(link) {
        const workspaceId = String(link?.workspace || 'main').trim() || 'main';
        const categoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
        const folderId = String(link?.folderId || '').trim();
        const folderLabel = typeof window.EveBookmarkFolders?.buildFolderPathLabel === 'function'
            ? String(window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, folderId) || '').trim()
            : '';

        return buildPathMeta({
            workspaceId: workspaceId,
            workspaceIds: [workspaceId],
            categoryName: categoryName,
            folderId: folderId,
            folderLabel: folderLabel,
            linkId: link?.id || ''
        });
    }

    function buildKnowledgeDescription(group, providerSummary) {
        const parts = [];
        if (group?.wikipediaEntry?.title) parts.push('Wikipedia');
        if (group?.fandomEntry?.domain) parts.push('Fandom');
        const providers = Object.keys(providerSummary || {});
        if (providers.length) {
            const labels = providers.map(function (providerKey) {
                return window.EveOS?.API?.SearchInternals?.getProviderLabel
                    ? window.EveOS.API.SearchInternals.getProviderLabel(providerKey)
                    : providerKey;
            });
            parts.push('API: ' + labels.join(', '));
        }
        if (!parts.length) parts.push('Saved source graph');
        return parts.join(' | ');
    }

    function computeKnowledgeScore(query, group) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return 0;
        const values = [
            group?.title,
            group?.wikipediaEntry?.title,
            group?.fandomEntry?.domain,
            ...(group?.aliases ? Array.from(group.aliases) : []),
            ...(Array.isArray(group?.apiEntries) ? group.apiEntries.map(function (entry) { return entry?.query; }) : [])
        ].map(function (value) { return String(value || '').toLowerCase(); });

        return values.reduce(function (score, value) {
            if (!value) return score;
            if (value === q) return score + 5;
            if (value.startsWith(q)) return score + 4;
            if (value.includes(q)) return score + 2;
            return score;
        }, 0);
    }

    function buildWikipediaUrl(title) {
        const safeTitle = String(title || '').trim();
        return safeTitle
            ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(safeTitle.replace(/\s+/g, '_'))
            : '';
    }

    async function searchKnowledgeSources(query, scope) {
        const q = String(query || '').trim();
        const searchInternals = window.EveOS?.API?.SearchInternals;
        if (!q || !searchInternals?.buildSourceCacheGroups) return [];

        const categories = ns.CacheAggregator?.getVisibleCategories
            ? ns.CacheAggregator.getVisibleCategories(scope)
            : [];
        const dedupe = new Set();
        const results = [];

        for (let i = 0; i < categories.length; i += 1) {
            const categoryName = categories[i];
            const groups = await searchInternals.buildSourceCacheGroups(categoryName, {
                includeUncachedKnowledge: true
            });

            groups.forEach(function (group) {
                const isMatch = searchInternals.matchesGroupFilter
                    ? searchInternals.matchesGroupFilter(group, q)
                    : computeKnowledgeScore(q, group) > 0;
                if (!isMatch) return;

                const providerSummary = searchInternals.summarizeApiGroupProviders
                    ? searchInternals.summarizeApiGroupProviders(group?.apiEntries || [])
                    : {};
                const dedupeKey = [
                    String(categoryName || '').trim().toLowerCase(),
                    String(group?.title || '').trim().toLowerCase(),
                    String(group?.fandomEntry?.domain || '').trim().toLowerCase()
                ].join('::');
                if (dedupe.has(dedupeKey)) return;
                dedupe.add(dedupeKey);

                const wikiUrl = buildWikipediaUrl(group?.wikipediaEntry?.title || group?.title);
                const fandomUrl = group?.fandomEntry?.domain
                    ? 'https://' + String(group.fandomEntry.domain).trim().replace(/^https?:\/\//i, '')
                    : '';
                const url = wikiUrl || fandomUrl || '';
                const displayUrl = fandomUrl
                    ? String(group.fandomEntry.domain || '').trim()
                    : (group?.wikipediaEntry?.title || '');

                results.push({
                    type: 'knowledge',
                    title: group?.title || 'Untitled Source Group',
                    url: url,
                    displayUrl: displayUrl,
                    description: buildKnowledgeDescription(group, providerSummary),
                    provider: 'knowledge',
                    sourceCard: categoryName,
                    sourceQuery: group?.apiEntries?.[0]?.query || '',
                    updatedAt: Number(group?.updatedAt || 0),
                    score: computeKnowledgeScore(q, group),
                    path: resolveCategoryPath(categoryName, scope),
                    provenance: {
                        kind: 'knowledge',
                        aliases: group?.aliases ? Array.from(group.aliases) : [],
                        wikipediaTitle: group?.wikipediaEntry?.title || '',
                        fandomDomain: group?.fandomEntry?.domain || '',
                        apiQueries: Array.isArray(group?.apiEntries)
                            ? group.apiEntries.map(function (entry) { return String(entry?.query || '').trim(); }).filter(Boolean)
                            : [],
                        providers: Object.keys(providerSummary),
                        providerSummary: providerSummary
                    }
                });
            });
        }

        results.sort(function (left, right) {
            return Number(right.score || 0) - Number(left.score || 0)
                || Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
        });
        return results;
    }

    ns.Locators = {
        buildWorkspaceTrail,
        buildWorkspaceLabel,
        buildPathMeta,
        resolveCategoryPath,
        buildBookmarkPath,
        searchKnowledgeSources
    };
})();
