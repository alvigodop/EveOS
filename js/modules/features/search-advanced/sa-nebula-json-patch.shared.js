window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (searchNs._NebulaJsonPatchShared) return;

    const SUPPORTED_OPS = new Set([
        'rename-workspace',
        'rename-card',
        'reorder-card',
        'set-card-description',
        'rename-folder',
        'rename-bookmark',
        'set-bookmark-url',
        'set-bookmark-notes',
        'set-bookmark-folder',
        'set-bookmark-identifiers',
        'set-linked-library-fields'
    ]);

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

    function normalizeFolderId(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeIdentifierList(value) {
        const source = Array.isArray(value)
            ? value
            : String(value == null ? '' : value).split(',');
        const seen = new Set();
        return source.map(function (entry) {
            return String(entry == null ? '' : entry).trim();
        }).filter(function (entry) {
            if (!entry || seen.has(entry)) return false;
            seen.add(entry);
            return true;
        });
    }

    function normalizeTextList(value) {
        const source = Array.isArray(value)
            ? value
            : String(value == null ? '' : value).split(/[|,;]/);
        const seen = new Set();
        return source.map(function (entry) {
            return String(entry == null ? '' : entry).trim();
        }).filter(function (entry) {
            const key = entry.toLowerCase();
            if (!entry || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function cloneData(value) {
        if (value == null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            if (Array.isArray(value)) return value.map(function (item) { return cloneData(item); });
            if (typeof value === 'object') return { ...value };
            return value;
        }
    }

    function getLinkApi() {
        return root.NebulaJsonLink || searchNs.NebulaJsonLink || window.NebulaJsonLink || null;
    }

    function getConfig() {
        return window.eveState?.config
            || window.config
            || (typeof config !== 'undefined' ? config : {})
            || {};
    }

    function getLiveLinks() {
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

    function setLiveLinks(nextLinks) {
        let storedLinks = nextLinks;
        if (typeof window.setLiveLinks === 'function') {
            const result = window.setLiveLinks(nextLinks);
            if (Array.isArray(result)) storedLinks = result;
        }
        if (window.eveState) window.eveState.links = storedLinks;
        window.links = storedLinks;
        if (typeof links !== 'undefined') links = storedLinks;
        return storedLinks;
    }

    function getFolderStores() {
        const stores = [];
        function add(store) {
            if (!store || typeof store !== 'object' || stores.includes(store)) return;
            stores.push(store);
        }
        add(window.eveState?.bookmarkFolders);
        add(window.bookmarkFolders);
        if (typeof bookmarkFolders !== 'undefined') add(bookmarkFolders);
        return stores;
    }

    function getLinkedLibraryForBookmark(bookmarkId) {
        const normalizedId = String(bookmarkId || '').trim();
        if (!normalizedId) return null;
        const api = window.EveLibrary?.ConnectionsAPI;
        const state = window.EveLibrary?.State;
        const conn = api?.findConnectionByLinkId?.(normalizedId);
        if (!conn || !state) return null;
        const found = window.EveLibrary?.ConnectionsCore?.findEntryByConnection?.(conn);
        if (found?.entry) {
            return { connection: conn, entry: found.entry, categoryName: found.categoryName, workspaceId: found.workspaceId };
        }
        const lib = state.getCategoryLibrary(conn.categoryName, conn.workspace);
        const entry = (lib?.entries || []).find(function (candidate) {
            return String(candidate?.id || '') === String(conn.libraryEntryId || '');
        });
        return entry ? { connection: conn, entry, categoryName: conn.categoryName, workspaceId: conn.workspace } : null;
    }

    function normalizeLibraryPatchFields(changes) {
        const source = changes && typeof changes === 'object' ? changes : {};
        const next = {};
        ['title', 'author', 'status', 'sourceStatus', 'rating', 'sourceUrl', 'imageUrl', 'language', 'summary'].forEach(function (field) {
            if (Object.prototype.hasOwnProperty.call(source, field)) {
                next[field] = String(source[field] == null ? '' : source[field]).trim();
            }
        });
        ['chapter', 'graphicChapter', 'novelChapter', 'season', 'episode'].forEach(function (field) {
            if (!Object.prototype.hasOwnProperty.call(source, field)) return;
            const value = Number(source[field] || 0);
            next[field] = Number.isFinite(value) && value > 0 ? value : 0;
        });
        if (Object.prototype.hasOwnProperty.call(source, 'mediaTypes')) next.mediaTypes = normalizeTextList(source.mediaTypes);
        if (Object.prototype.hasOwnProperty.call(source, 'titleAltNames')) next.titleAltNames = normalizeTextList(source.titleAltNames);
        if (Object.prototype.hasOwnProperty.call(source, 'authorAltNames')) next.authorAltNames = normalizeTextList(source.authorAltNames);
        if (Object.prototype.hasOwnProperty.call(source, 'artist')) next.artist = normalizeTextList(source.artist);
        if (Object.prototype.hasOwnProperty.call(source, 'genre')) next.genre = normalizeTextList(source.genre);
        if (Object.prototype.hasOwnProperty.call(source, 'tags')) next.tags = normalizeTextList(source.tags);
        return next;
    }

    function getScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getFolderById(workspaceId, categoryName, folderId) {
        const id = normalizeFolderId(folderId);
        if (!id) return null;
        if (typeof window.EveBookmarkFolders?.getFolderById === 'function') {
            const folder = window.EveBookmarkFolders.getFolderById(workspaceId, categoryName, id);
            if (folder) return folder;
        }
        for (const store of getFolderStores()) {
            const tree = store[getScopedKey(workspaceId, categoryName)];
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            const found = nodes.find(function (node) {
                return String(node?.id || '') === id;
            });
            if (found) return found;
        }
        return null;
    }

    function findWorkspaceById(workspaces, workspaceId) {
        const targetId = normalizeWorkspaceId(workspaceId);
        for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
            if (String(workspace?.id || '') === targetId) return workspace;
            const found = findWorkspaceById(workspace?.subTabs || [], targetId);
            if (found) return found;
        }
        return null;
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        if (window.EveCategoryOrder && typeof window.EveCategoryOrder.getOrder === 'function') {
            window.EveCategoryOrder.getOrder(ws).forEach(function (categoryName) {
                names.add(normalizeCategoryName(categoryName));
            });
        }
        getLiveLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === ws) {
                names.add(normalizeCategoryName(link?.category));
            }
        });
        const prefix = ws + '::';
        getFolderStores().forEach(function (store) {
            Object.keys(store || {}).forEach(function (key) {
                if (String(key).startsWith(prefix)) {
                    const tree = store[key];
                    const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
                    if (nodes.length) names.add(normalizeCategoryName(String(key).slice(prefix.length)));
                }
            });
        });
        return Array.from(names);
    }

    searchNs._NebulaJsonPatchShared = {
        SUPPORTED_OPS,
        text,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeIdentifierList,
        normalizeTextList,
        cloneData,
        getLinkApi,
        getConfig,
        getLiveLinks,
        setLiveLinks,
        getFolderStores,
        getLinkedLibraryForBookmark,
        normalizeLibraryPatchFields,
        getScopedKey,
        getFolderById,
        findWorkspaceById,
        getCategoryNamesForWorkspace
    };
})();
