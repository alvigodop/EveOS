/**
 * Library State Module for Eve OS
 * Per-category library state management
 * Adapted from MegaBase library-state.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const LIB_SCOPE_SEPARATOR = '::';
    const DEFAULT_DATA_TYPE = 'graphicNovels';
    const DEFAULT_FOLDER_VIEW = Object.freeze({
        root: 'all',
        chain: [],
        expanded: false
    });
    // Libraries stored per scoped category: { "workspaceId::categoryName": { entries: [], dataType: 'graphicNovels' } }
    let categoryLibraries = {};

    // Data types and their configurations
    const dataTypes = {
        graphicNovels: {
            label: 'Graphic Novels',
            statuses: ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'],
            sortOptions: ['title', 'author', 'genre', 'rating', 'selectedRating', 'apiAverageRating', 'apiWeightedRating', 'hybridRating', 'personal10Rating', 'confidenceRating', 'status', 'dateAdded', 'lastEdited', 'chapter'],
            fields: ['chapter']
        },
        films: {
            label: 'Films',
            statuses: ['Watching', 'Completed', 'On Hold', 'Dropped', 'Plan to Watch', 'Hiatus'],
            sortOptions: ['title', 'author', 'genre', 'rating', 'selectedRating', 'apiAverageRating', 'apiWeightedRating', 'hybridRating', 'personal10Rating', 'confidenceRating', 'status', 'dateAdded', 'lastEdited', 'season', 'episode'],
            fields: ['season', 'episode']
        },
        novels: {
            label: 'Novels',
            statuses: ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'],
            sortOptions: ['title', 'author', 'genre', 'rating', 'selectedRating', 'apiAverageRating', 'apiWeightedRating', 'hybridRating', 'personal10Rating', 'confidenceRating', 'status', 'dateAdded', 'lastEdited', 'chapter'],
            fields: ['chapter']
        }
    };

    // Pagination state per category
    const paginationState = {};
    const entriesPerPage = 10;

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function getCurrentWorkspaceId() {
        const cfg = getConfig();
        return String(cfg.activeWorkspace || 'main');
    }

    function normalizeCategoryName(categoryName) {
        const value = String(categoryName || '').trim();
        return value || 'Unsorted';
    }

    function normalizeWorkspaceId(workspaceId) {
        const value = String(workspaceId || '').trim();
        return value || getCurrentWorkspaceId();
    }

    function buildScopedCategoryKey(categoryName, workspaceId) {
        return `${normalizeWorkspaceId(workspaceId)}${LIB_SCOPE_SEPARATOR}${normalizeCategoryName(categoryName)}`;
    }

    function getBookmarkFolderStore() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') {
            return bookmarkFolders;
        }
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') {
            return window.bookmarkFolders;
        }
        return {};
    }

    function normalizeFolderViewState(folderView) {
        const source = folderView && typeof folderView === 'object' ? folderView : {};
        const root = String(source.root || DEFAULT_FOLDER_VIEW.root).trim() || DEFAULT_FOLDER_VIEW.root;
        const chain = Array.isArray(source.chain)
            ? source.chain
                .map((step) => {
                    if (!step || typeof step !== 'object') return null;
                    const selection = String(step.selection || '').trim();
                    if (!selection) return null;
                    return { selection };
                })
                .filter(Boolean)
            : [];
        return {
            root,
            chain,
            expanded: !!source.expanded
        };
    }

    function normalizeLibraryBucket(data) {
        const source = data && typeof data === 'object' ? data : {};
        return {
            ...source,
            entries: Array.isArray(source.entries) ? source.entries : [],
            dataType: source.dataType || DEFAULT_DATA_TYPE,
            folderView: normalizeFolderViewState(source.folderView)
        };
    }

    function isDefaultFolderView(folderView) {
        const normalized = normalizeFolderViewState(folderView);
        return normalized.root === DEFAULT_FOLDER_VIEW.root
            && normalized.expanded === DEFAULT_FOLDER_VIEW.expanded
            && Array.isArray(normalized.chain)
            && normalized.chain.length === 0;
    }

    function isEmptyTransientLibraryBucket(data) {
        const bucket = normalizeLibraryBucket(data);
        return bucket.dataType === DEFAULT_DATA_TYPE
            && Array.isArray(bucket.entries)
            && bucket.entries.length === 0
            && isDefaultFolderView(bucket.folderView);
    }

    function parseScopedCategoryKey(key) {
        const raw = String(key || '');
        const pivot = raw.indexOf(LIB_SCOPE_SEPARATOR);
        if (pivot < 0) {
            return {
                key: raw,
                workspaceId: '',
                categoryName: normalizeCategoryName(raw),
                scoped: false
            };
        }

        const workspaceId = raw.slice(0, pivot).trim();
        const categoryName = raw.slice(pivot + LIB_SCOPE_SEPARATOR.length).trim();
        return {
            key: raw,
            workspaceId: normalizeWorkspaceId(workspaceId),
            categoryName: normalizeCategoryName(categoryName),
            scoped: true
        };
    }

    function resolveLibraryKey(categoryName, workspaceId) {
        const scopedKey = buildScopedCategoryKey(categoryName, workspaceId);
        if (categoryLibraries[scopedKey]) return scopedKey;

        // Legacy unscoped data migration: move "Category" -> "workspace::Category" on first access.
        const legacyKey = normalizeCategoryName(categoryName);
        if (categoryLibraries[legacyKey]) {
            categoryLibraries[scopedKey] = categoryLibraries[legacyKey];
            delete categoryLibraries[legacyKey];
        }
        return scopedKey;
    }

    function getExistingCategoryLibrary(categoryName, workspaceId) {
        const scopedKey = buildScopedCategoryKey(categoryName, workspaceId);
        if (categoryLibraries[scopedKey]) {
            return normalizeLibraryBucket(categoryLibraries[scopedKey]);
        }

        const legacyKey = normalizeCategoryName(categoryName);
        if (categoryLibraries[legacyKey]) {
            return normalizeLibraryBucket(categoryLibraries[legacyKey]);
        }

        return null;
    }

    function getCategoryLibrary(categoryName, workspaceId) {
        const key = resolveLibraryKey(categoryName, workspaceId);
        if (!categoryLibraries[key]) {
            categoryLibraries[key] = normalizeLibraryBucket({
                entries: [],
                dataType: 'graphicNovels'
            });
        } else {
            categoryLibraries[key] = normalizeLibraryBucket(categoryLibraries[key]);
        }
        return categoryLibraries[key];
    }

    function setCategoryLibrary(categoryName, data, workspaceId) {
        const parsed = parseScopedCategoryKey(categoryName);
        const key = parsed.scoped
            ? buildScopedCategoryKey(parsed.categoryName, parsed.workspaceId)
            : buildScopedCategoryKey(parsed.categoryName, workspaceId);
        categoryLibraries[key] = normalizeLibraryBucket(data);

        // Remove any legacy unscoped key if it exists.
        const legacyKey = parsed.categoryName;
        if (legacyKey !== key && Object.prototype.hasOwnProperty.call(categoryLibraries, legacyKey)) {
            delete categoryLibraries[legacyKey];
        }
    }

    function getAllLibraries() { return categoryLibraries; }

    function pruneEmptyTransientLibraries() {
        let removed = 0;
        Object.keys(categoryLibraries || {}).forEach((key) => {
            if (!isEmptyTransientLibraryBucket(categoryLibraries[key])) return;
            delete categoryLibraries[key];
            removed += 1;
        });
        return removed;
    }
    function setAllLibraries(data) {
        const next = {};
        Object.entries(data && typeof data === 'object' ? data : {}).forEach(([key, value]) => {
            next[key] = normalizeLibraryBucket(value);
        });
        categoryLibraries = next;
    }

    function getDataTypes() { return dataTypes; }
    function getDataType(typeName) { return dataTypes[typeName]; }

    function getCategoryDataType(categoryName, workspaceId) {
        const lib = getExistingCategoryLibrary(categoryName, workspaceId);
        return lib?.dataType || DEFAULT_DATA_TYPE;
    }

    function setCategoryDataType(categoryName, typeName, workspaceId) {
        const lib = getCategoryLibrary(categoryName, workspaceId);
        lib.dataType = typeName;
    }

    function getCategoryFolderView(categoryName, workspaceId) {
        const lib = getExistingCategoryLibrary(categoryName, workspaceId);
        return normalizeFolderViewState(lib?.folderView);
    }

    function setCategoryFolderView(categoryName, folderView, workspaceId) {
        const lib = getCategoryLibrary(categoryName, workspaceId);
        lib.folderView = normalizeFolderViewState(folderView);
        return lib.folderView;
    }

    function getBookmarkFolderTree(categoryName, workspaceId) {
        const store = getBookmarkFolderStore();
        const scopedKey = buildScopedCategoryKey(categoryName, workspaceId);
        const rawTree = store && typeof store === 'object' ? store[scopedKey] : null;
        if (rawTree && Array.isArray(rawTree.nodes)) {
            return { nodes: rawTree.nodes.map((node) => ({ ...(node || {}) })) };
        }
        if (Array.isArray(rawTree)) {
            return { nodes: rawTree.map((node) => ({ ...(node || {}) })) };
        }
        return { nodes: [] };
    }

    function getBookmarkFolderNodes(categoryName, workspaceId) {
        return getBookmarkFolderTree(categoryName, workspaceId).nodes || [];
    }

    function getPage(categoryName, workspaceId) {
        const key = buildScopedCategoryKey(categoryName, workspaceId);
        return paginationState[key] || 1;
    }

    function setPage(categoryName, page, workspaceId) {
        const key = buildScopedCategoryKey(categoryName, workspaceId);
        paginationState[key] = page;
    }

    function getEntriesPerPage() { return entriesPerPage; }

    window.EveLibrary.State = {
        getCategoryLibrary,
        setCategoryLibrary,
        getAllLibraries,
        pruneEmptyTransientLibraries,
        isEmptyTransientLibraryBucket,
        setAllLibraries,
        getDataTypes,
        getDataType,
        getCategoryDataType,
        setCategoryDataType,
        getCategoryFolderView,
        setCategoryFolderView,
        getBookmarkFolderTree,
        getBookmarkFolderNodes,
        getPage,
        setPage,
        getEntriesPerPage,
        buildScopedCategoryKey,
        parseScopedCategoryKey,
        getCurrentWorkspaceId
    };
})();
