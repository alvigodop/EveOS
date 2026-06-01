window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns._DatapackViewShared) return;

    const MAX_MACRO_CARDS = 250;
    const MAX_MICRO_BOOKMARKS = 120;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeWorkspaceId(value) {
        return String(value || '').trim() || 'main';
    }

    function normalizeCategoryName(value) {
        return String(value || '').trim() || 'Unsorted';
    }

    function normalizeFolderId(value) {
        return String(value || '').trim();
    }

    function getConfig() {
        return window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function getLiveLinks() {
        const live = typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : null;
        const directWindowLinks = Array.isArray(window.links) ? window.links : null;
        const directGlobalLinks = typeof links !== 'undefined' && Array.isArray(links) ? links : null;
        const stateLinks = Array.isArray(window.eveState?.links) ? window.eveState.links : null;
        const richest = [directWindowLinks, directGlobalLinks, stateLinks, live]
            .filter(Array.isArray)
            .sort(function (left, right) { return right.length - left.length; })[0];
        if (richest && live && richest !== live && richest.length > live.length) return richest;
        if (live) return live;
        if (richest) return richest;
        return [];
    }

    function setLiveLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function getFolderStore() {
        const stores = [
            window.bookmarkFolders,
            typeof bookmarkFolders !== 'undefined' ? bookmarkFolders : null,
            window.eveState?.bookmarkFolders
        ].filter(function (store) {
            return store && typeof store === 'object';
        });
        if (!stores.length) return {};
        return stores.sort(function (left, right) {
            return Object.keys(right).length - Object.keys(left).length;
        })[0];
    }

    function createEntityLink(source) {
        const api = window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
        return api && typeof api.createLink === 'function' ? api.createLink(source) : '';
    }

    function buildScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getStructureSummary() {
        const indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
        const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        const hasReadableSnapshot = typeof indexApi.hasReadableStructureSnapshot === 'function'
            ? indexApi.hasReadableStructureSnapshot()
            : (typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0));
        if (!hasReadableSnapshot) return null;
        return indexApi.getStructureSummary() || null;
    }

    function getCategoryOrderHints(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const cfg = getConfig();
        const hints = [];
        function addList(list) {
            (Array.isArray(list) ? list : []).forEach(function (categoryName) {
                const normalized = normalizeCategoryName(categoryName);
                if (hints.indexOf(normalized) === -1) hints.push(normalized);
            });
        }
        addList(cfg.categoryOrderByWorkspace && Array.isArray(cfg.categoryOrderByWorkspace[ws])
            ? cfg.categoryOrderByWorkspace[ws]
            : []);
        addList(cfg.categoryOrder);
        if (window.EveCategoryOrder?.getOrder) {
            addList(window.EveCategoryOrder.getOrder(ws));
        }
        return hints;
    }

    function sortMaterialCategoryNames(workspaceId, materialNames) {
        const material = new Set(Array.from(materialNames || []).map(normalizeCategoryName));
        const ordered = [];
        getCategoryOrderHints(workspaceId).forEach(function (categoryName) {
            if (!material.has(categoryName) || ordered.indexOf(categoryName) !== -1) return;
            ordered.push(categoryName);
        });
        Array.from(material)
            .sort(function (left, right) {
                return left.localeCompare(right, undefined, { sensitivity: 'base' });
            })
            .forEach(function (categoryName) {
                if (ordered.indexOf(categoryName) === -1) ordered.push(categoryName);
            });
        return ordered;
    }

    function getWorkspaces() {
        return Array.isArray(getConfig().workspaces) ? getConfig().workspaces : [];
    }

    function getWorkspaceById(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        if (helpers?.findById) return helpers.findById(getWorkspaces(), normalizeWorkspaceId(workspaceId)) || null;
        return null;
    }

    function getWorkspaceLabel(workspaceId) {
        const helpers = window.EveWorkspaceHelpers;
        const path = helpers?.getPath ? helpers.getPath(getWorkspaces(), normalizeWorkspaceId(workspaceId)) : [];
        if (Array.isArray(path) && path.length) {
            return path.map(function (workspace) {
                return String(workspace?.name || workspace?.id || 'Tab').trim() || 'Tab';
            }).join(' > ');
        }
        const workspace = getWorkspaceById(workspaceId);
        return String(workspace?.name || workspaceId || 'main').trim() || 'main';
    }

    function getWorkspaceName(workspaceId) {
        const workspace = getWorkspaceById(workspaceId);
        return String(workspace?.name || workspaceId || 'Tab').trim() || 'Tab';
    }

    function countWorkspaceBookmarks(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        return getLiveLinks().filter(function (link) {
            return normalizeWorkspaceId(link?.workspace) === ws;
        }).length;
    }

    function buildWorkspaceRef(workspace) {
        const id = normalizeWorkspaceId(workspace?.id);
        const linkedTargetId = normalizeWorkspaceId(workspace?.linkedTo || '');
        const linkedTarget = workspace?.linkedTo ? getWorkspaceById(linkedTargetId) : null;
        const ref = {
            id,
            name: String(workspace?.name || id).trim() || id,
            entityLink: createEntityLink({ type: 'workspace', workspaceId: id }),
            path: getWorkspaceLabel(id),
            childTabs: Array.isArray(workspace?.subTabs) ? workspace.subTabs.length : 0,
            bookmarks: countWorkspaceBookmarks(id),
            cards: getCategoryNamesForWorkspace(id).length,
            open: 'openable-reference',
            isShortcut: !!linkedTarget,
            linkedTo: linkedTarget ? normalizeWorkspaceId(linkedTarget.id) : '',
            linkedTargetName: linkedTarget ? getWorkspaceName(linkedTarget.id) : '',
            linkedTargetPath: linkedTarget ? getWorkspaceLabel(linkedTarget.id) : '',
            linkedEntityLink: linkedTarget ? createEntityLink({ type: 'workspace', workspaceId: normalizeWorkspaceId(linkedTarget.id) }) : '',
            sourceCards: linkedTarget ? getCategoryNamesForWorkspace(linkedTarget.id).length : 0,
            sourceBookmarks: linkedTarget ? countWorkspaceBookmarks(linkedTarget.id) : 0
        };
        return ref;
    }

    function buildLinkedSourceRef(shortcutWorkspace) {
        if (!shortcutWorkspace?.linkedTo) return null;
        const linkedTarget = getWorkspaceById(shortcutWorkspace.linkedTo);
        if (!linkedTarget) return null;
        const sourceId = normalizeWorkspaceId(linkedTarget.id);
        const shortcutId = normalizeWorkspaceId(shortcutWorkspace.id);
        return {
            id: sourceId,
            name: getWorkspaceName(sourceId),
            entityLink: createEntityLink({ type: 'workspace', workspaceId: sourceId }),
            path: getWorkspaceLabel(sourceId),
            cards: getCategoryNamesForWorkspace(sourceId).length,
            bookmarks: countWorkspaceBookmarks(sourceId),
            childTabs: Array.isArray(linkedTarget.subTabs) ? linkedTarget.subTabs.length : 0,
            viaShortcutId: shortcutId,
            viaShortcutName: getWorkspaceName(shortcutId),
            viaShortcutPath: getWorkspaceLabel(shortcutId),
            localCards: getCategoryNamesForWorkspace(shortcutId).length,
            localBookmarks: countWorkspaceBookmarks(shortcutId),
            open: 'openable-linked-source'
        };
    }

    function getWorkspaceIdsInScope(scope) {
        const explicitIds = Array.isArray(scope?.workspaceIds)
            ? scope.workspaceIds.map(normalizeWorkspaceId).filter(Boolean)
            : [];
        if (explicitIds.length) return Array.from(new Set(explicitIds));
        const helpers = window.EveWorkspaceHelpers;
        const workspaceId = normalizeWorkspaceId(scope?.workspaceId || getConfig().activeWorkspace || 'main');
        if (!scope?.workspaceId && scope?.all) {
            return helpers?.flattenIds ? helpers.flattenIds(getWorkspaces()) : [workspaceId];
        }
        const ids = new Set([workspaceId]);
        const workspace = getWorkspaceById(workspaceId);
        if (workspace && helpers?.getDescendantIds) {
            helpers.getDescendantIds(workspace).forEach(function (id) {
                if (id) ids.add(normalizeWorkspaceId(id));
            });
        }
        return Array.from(ids);
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const materialNames = new Set();
        function addMaterialName(categoryName) {
            const normalized = normalizeCategoryName(categoryName);
            if (normalized) materialNames.add(normalized);
        }
        getLiveLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === ws) {
                addMaterialName(link?.category);
            }
        });
        const summary = getStructureSummary();
        if (summary?.cards && typeof summary.cards === 'object') {
            Object.keys(summary.cards).forEach(function (cardKey) {
                const bucket = summary.cards[cardKey];
                if (normalizeWorkspaceId(bucket?.workspaceId) !== ws) return;
                if (Number(bucket?.bookmarkCount || 0) <= 0 && Number(bucket?.folderCount || 0) <= 0) return;
                addMaterialName(bucket?.categoryName || String(cardKey).slice((ws + '::').length));
            });
        }
        const prefix = ws + '::';
        const folderOnlyNames = [];
        Object.keys(getFolderStore()).forEach(function (scopedKey) {
            if (!String(scopedKey).startsWith(prefix)) return;
            const tree = getFolderStore()[scopedKey];
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            if (!nodes.length) return;
            folderOnlyNames.push(normalizeCategoryName(String(scopedKey).slice(prefix.length)));
        });
        folderOnlyNames.forEach(addMaterialName);
        return sortMaterialCategoryNames(ws, materialNames);
    }

    function getFolderNodes(workspaceId, categoryName) {
        const tree = getFolderStore()[buildScopedKey(workspaceId, categoryName)];
        const storeNodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
        if (typeof window.EveBookmarkFolders?.getScopedNodes === 'function') {
            const apiNodes = window.EveBookmarkFolders.getScopedNodes(workspaceId, categoryName) || [];
            return storeNodes.length > apiNodes.length ? storeNodes : apiNodes;
        }
        return storeNodes;
    }

    function getFolderPathLabel(workspaceId, categoryName, folderId) {
        const id = normalizeFolderId(folderId);
        if (!id) return 'Root';
        if (typeof window.EveBookmarkFolders?.buildFolderPathLabel === 'function') {
            return window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, id) || 'Folder';
        }
        return id;
    }

    function getIdentifierLabels(link) {
        const ids = window.EveBookmarkIdentifiers?.getIdentifiersForLink
            ? window.EveBookmarkIdentifiers.getIdentifiersForLink(link)
            : (Array.isArray(link?.identifiers) ? link.identifiers : []);
        const definitions = window.EveBookmarkIdentifiers?.getDefinitions?.() || [];
        const byId = new Map(definitions.map(function (definition) {
            return [String(definition?.id || ''), String(definition?.label || definition?.id || '')];
        }));
        return ids.map(function (id) {
            return byId.get(String(id)) || String(id);
        }).filter(Boolean);
    }

    function getScopedLinks(workspaceId, categoryName) {
        const ws = normalizeWorkspaceId(workspaceId);
        const cat = normalizeCategoryName(categoryName);
        return getLiveLinks().filter(function (link) {
            return normalizeWorkspaceId(link?.workspace) === ws
                && normalizeCategoryName(link?.category) === cat;
        });
    }

    function countLinkedLibrary(links) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry) return 0;
        return links.filter(function (link) {
            return !!api.getLinkedEntry(String(link?.id || ''))?.entry;
        }).length;
    }

    function countPinned(links) {
        const api = window.EveQuickPins;
        if (!api?.isBookmarkPinned) return 0;
        return links.filter(function (link) {
            return api.isBookmarkPinned(link?.id);
        }).length;
    }

    function buildCardSummary(workspaceId, categoryName, orderIndex) {
        const scopedLinks = getScopedLinks(workspaceId, categoryName);
        const folders = getFolderNodes(workspaceId, categoryName);
        const identifiers = new Set();
        scopedLinks.forEach(function (link) {
            (Array.isArray(link?.identifiers) ? link.identifiers : []).forEach(function (id) {
                if (id) identifiers.add(String(id));
            });
        });
        return {
            workspaceId: normalizeWorkspaceId(workspaceId),
            workspaceLabel: getWorkspaceLabel(workspaceId),
            categoryName: normalizeCategoryName(categoryName),
            entityLink: createEntityLink({
                type: 'card',
                workspaceId: normalizeWorkspaceId(workspaceId),
                categoryName: normalizeCategoryName(categoryName)
            }),
            order: orderIndex + 1,
            entity: 'card',
            internals: 'openable',
            counts: {
                bookmarks: scopedLinks.length,
                rootBookmarks: scopedLinks.filter(function (link) { return !normalizeFolderId(link?.folderId); }).length,
                folderBookmarks: scopedLinks.filter(function (link) { return !!normalizeFolderId(link?.folderId); }).length,
                folders: folders.length,
                linkedLibrary: countLinkedLibrary(scopedLinks),
                pinned: countPinned(scopedLinks),
                done: scopedLinks.filter(function (link) { return !!link?.done; }).length,
                identifiers: identifiers.size
            }
        };
    }

    function resolveCurrentScope() {
        const ui = window.EveOS?.SearchAdvanced?.UI;
        const scopeMode = ui?.getCurrentScopeMode ? ui.getCurrentScopeMode() : 'current';
        const scope = ui?.getResolvedScope ? ui.getResolvedScope(scopeMode) : null;
        if (scopeMode === 'all') return { all: true };
        return scope && (scope.workspaceId || scope.categoryName || Array.isArray(scope.workspaceIds))
            ? scope
            : { workspaceId: normalizeWorkspaceId(getConfig().activeWorkspace || 'main') };
    }

    ns._DatapackViewShared = {
        MAX_MACRO_CARDS,
        MAX_MICRO_BOOKMARKS,
        escapeHtml,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        getConfig,
        getLiveLinks,
        setLiveLinks,
        getFolderStore,
        createEntityLink,
        buildScopedKey,
        getDatapackIndexApi,
        getStructureSummary,
        getCategoryOrderHints,
        sortMaterialCategoryNames,
        getWorkspaces,
        getWorkspaceById,
        getWorkspaceLabel,
        getWorkspaceName,
        countWorkspaceBookmarks,
        buildWorkspaceRef,
        buildLinkedSourceRef,
        getWorkspaceIdsInScope,
        getCategoryNamesForWorkspace,
        getFolderNodes,
        getFolderPathLabel,
        getIdentifierLabels,
        getScopedLinks,
        countLinkedLibrary,
        countPinned,
        buildCardSummary,
        resolveCurrentScope
    };
})();
