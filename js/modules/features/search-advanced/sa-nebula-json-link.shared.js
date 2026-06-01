window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (searchNs._NebulaJsonLinkShared) return;

    const SCHEME = 'eve://';
    const ENTITY_TYPES = new Set(['workspace', 'card', 'folder', 'bookmark']);

    function text(value, fallback) {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function normalizeWorkspaceId(value) {
        return text(value, 'main');
    }

    function normalizeCategoryName(value) {
        return text(value, 'Unsorted');
    }

    function normalizeId(value) {
        return text(value, '');
    }

    function encodeSegment(value) {
        return encodeURIComponent(text(value, ''));
    }

    function decodeSegment(value) {
        try {
            return decodeURIComponent(String(value || ''));
        } catch (error) {
            return String(value || '');
        }
    }

    function getConfig() {
        return window.eveState?.config
            || window.config
            || (typeof config !== 'undefined' ? config : {})
            || {};
    }

    function getLinks() {
        const live = typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : null;
        const candidates = [
            Array.isArray(window.links) ? window.links : null,
            typeof links !== 'undefined' && Array.isArray(links) ? links : null,
            Array.isArray(window.eveState?.links) ? window.eveState.links : null,
            Array.isArray(live) ? live : null
        ].filter(Array.isArray);
        if (!candidates.length) return [];
        return candidates.sort(function (left, right) {
            return right.length - left.length;
        })[0];
    }

    function getFolderStore() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') return window.bookmarkFolders;
        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') {
            return bookmarkFolders;
        }
        return {};
    }

    function getWorkspaces() {
        const cfg = getConfig();
        return Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
    }

    function getWorkspaceHelpers() {
        return window.EveWorkspaceHelpers || null;
    }

    function getWorkspaceById(workspaceId) {
        const helpers = getWorkspaceHelpers();
        const targetId = normalizeWorkspaceId(workspaceId);
        if (helpers && typeof helpers.findById === 'function') {
            return helpers.findById(getWorkspaces(), targetId) || null;
        }
        return getWorkspaces().find(function (workspace) {
            return String(workspace?.id || '') === targetId;
        }) || null;
    }

    function getWorkspacePath(workspaceId) {
        const helpers = getWorkspaceHelpers();
        const targetId = normalizeWorkspaceId(workspaceId);
        if (helpers && typeof helpers.getPath === 'function') {
            const path = helpers.getPath(getWorkspaces(), targetId);
            if (Array.isArray(path) && path.length) return path.filter(Boolean);
        }
        const workspace = getWorkspaceById(targetId);
        return workspace ? [workspace] : [];
    }

    function getScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getFolderNodes(workspaceId, categoryName) {
        const folderApi = window.EveBookmarkFolders || null;
        if (folderApi && typeof folderApi.getScopedNodes === 'function') {
            const nodes = folderApi.getScopedNodes(workspaceId, categoryName);
            if (Array.isArray(nodes)) return nodes;
        }
        const tree = getFolderStore()[getScopedKey(workspaceId, categoryName)];
        if (Array.isArray(tree?.nodes)) return tree.nodes;
        if (Array.isArray(tree)) return tree;
        return [];
    }

    function getFolderById(workspaceId, categoryName, folderId) {
        const targetId = normalizeId(folderId);
        if (!targetId) return null;
        const folderApi = window.EveBookmarkFolders || null;
        if (folderApi && typeof folderApi.getFolderById === 'function') {
            const folder = folderApi.getFolderById(workspaceId, categoryName, targetId);
            if (folder) return folder;
        }
        return getFolderNodes(workspaceId, categoryName).find(function (folder) {
            return String(folder?.id || '') === targetId;
        }) || null;
    }

    function getFolderPathLabel(workspaceId, categoryName, folderId) {
        const targetId = normalizeId(folderId);
        if (!targetId) return 'Root';
        const folderApi = window.EveBookmarkFolders || null;
        if (folderApi && typeof folderApi.buildFolderPathLabel === 'function') {
            const label = text(folderApi.buildFolderPathLabel(workspaceId, categoryName, targetId), '');
            if (label) return label;
        }
        const chain = getFolderChain(workspaceId, categoryName, targetId);
        return chain.nodes.length
            ? chain.nodes.map(function (folder) { return text(folder?.name, folder?.id); }).join(' / ')
            : targetId;
    }

    function getFolderChain(workspaceId, categoryName, folderId) {
        const targetId = normalizeId(folderId);
        const byId = new Map(getFolderNodes(workspaceId, categoryName).map(function (folder) {
            return [String(folder?.id || ''), folder];
        }).filter(function (entry) { return !!entry[0]; }));
        const nodes = [];
        const issues = [];
        const seen = new Set();
        let cursorId = targetId;
        while (cursorId) {
            if (seen.has(cursorId)) {
                issues.push('folder_parent_cycle');
                break;
            }
            seen.add(cursorId);
            const folder = byId.get(cursorId);
            if (!folder) {
                issues.push(nodes.length ? 'folder_parent_missing' : 'folder_missing');
                break;
            }
            nodes.unshift(folder);
            cursorId = normalizeId(folder.parentId);
        }
        return { nodes, issues };
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        if (window.EveCategoryOrder && typeof window.EveCategoryOrder.getOrder === 'function') {
            window.EveCategoryOrder.getOrder(ws).forEach(function (categoryName) {
                names.add(normalizeCategoryName(categoryName));
            });
        }
        getLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === ws) {
                names.add(normalizeCategoryName(link?.category));
            }
        });
        const prefix = ws + '::';
        Object.keys(getFolderStore()).forEach(function (key) {
            if (String(key).startsWith(prefix)) {
                const tree = getFolderStore()[key];
                const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
                if (nodes.length) names.add(normalizeCategoryName(String(key).slice(prefix.length)));
            }
        });
        return Array.from(names);
    }

    function getCardDescription(workspaceId, categoryName) {
        const descriptions = getConfig().cardDescriptions;
        if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions)) return '';
        return text(descriptions[getScopedKey(workspaceId, categoryName)], '');
    }

    function findBookmarkById(bookmarkId) {
        const targetId = normalizeId(bookmarkId);
        if (!targetId) return null;
        return getLinks().find(function (link) {
            return String(link?.id || '') === targetId;
        }) || null;
    }

    function getGroupVisibility(workspaceId) {
        const groups = window.EveSidebarGroupsRuntime || window.EveSidebarGroups || null;
        if (!groups) return { groupId: '', groupName: '', hidden: false };
        const cfg = getConfig();
        const rootWorkspace = typeof groups.getWorkspaceRoot === 'function'
            ? groups.getWorkspaceRoot(workspaceId, cfg)
            : getWorkspacePath(workspaceId)[0];
        const groupId = typeof groups.getWorkspaceGroupId === 'function'
            ? text(groups.getWorkspaceGroupId(rootWorkspace || workspaceId, cfg), '')
            : '';
        const group = groupId && typeof groups.findGroupById === 'function'
            ? groups.findGroupById(groupId, cfg)
            : null;
        return {
            groupId,
            groupName: text(group?.name, ''),
            hidden: !!group?.hidden
        };
    }

    function inferEntityType(source) {
        const explicit = text(source?.type || source?.entityType, '').toLowerCase();
        if (ENTITY_TYPES.has(explicit)) return explicit;
        if (source?.bookmarkId || source?.linkId || source?.url) return 'bookmark';
        if (source?.folderId) return 'folder';
        if (source?.categoryName || source?.category || source?.cardId) return 'card';
        return 'workspace';
    }

    searchNs._NebulaJsonLinkShared = {
        SCHEME,
        text,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeId,
        encodeSegment,
        decodeSegment,
        getConfig,
        getLinks,
        getFolderStore,
        getWorkspaces,
        getWorkspaceHelpers,
        getWorkspaceById,
        getWorkspacePath,
        getScopedKey,
        getFolderNodes,
        getFolderById,
        getFolderPathLabel,
        getFolderChain,
        getCategoryNamesForWorkspace,
        getCardDescription,
        findBookmarkById,
        getGroupVisibility,
        inferEntityType
    };
})();
