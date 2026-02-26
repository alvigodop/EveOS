/**
 * Library State Module for Eve OS
 * Per-category library state management
 * Adapted from MegaBase library-state.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const LIB_SCOPE_SEPARATOR = '::';
    // Libraries stored per scoped category: { "workspaceId::categoryName": { entries: [], dataType: 'graphicNovels' } }
    let categoryLibraries = {};

    // Data types and their configurations
    const dataTypes = {
        graphicNovels: {
            label: 'Graphic Novels',
            statuses: ['Reading', 'Completed', 'Plan to Read'],
            sortOptions: ['title', 'author', 'genre', 'rating', 'selectedRating', 'apiAverageRating', 'apiWeightedRating', 'hybridRating', 'personal10Rating', 'status', 'dateAdded', 'lastEdited', 'chapter'],
            fields: ['chapter']
        },
        films: {
            label: 'Films',
            statuses: ['Watching', 'Completed', 'On Hold', 'Dropped', 'Plan to Watch'],
            sortOptions: ['title', 'author', 'genre', 'rating', 'selectedRating', 'apiAverageRating', 'apiWeightedRating', 'hybridRating', 'personal10Rating', 'status', 'dateAdded', 'lastEdited', 'season', 'episode'],
            fields: ['season', 'episode']
        },
        novels: {
            label: 'Novels',
            statuses: ['Reading', 'Completed', 'Plan to Read'],
            sortOptions: ['title', 'author', 'genre', 'rating', 'selectedRating', 'apiAverageRating', 'apiWeightedRating', 'hybridRating', 'personal10Rating', 'status', 'dateAdded', 'lastEdited', 'chapter'],
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

    function getCategoryLibrary(categoryName, workspaceId) {
        const key = resolveLibraryKey(categoryName, workspaceId);
        if (!categoryLibraries[key]) {
            categoryLibraries[key] = {
                entries: [],
                dataType: 'graphicNovels' // default
            };
        }
        return categoryLibraries[key];
    }

    function setCategoryLibrary(categoryName, data, workspaceId) {
        const parsed = parseScopedCategoryKey(categoryName);
        const key = parsed.scoped
            ? buildScopedCategoryKey(parsed.categoryName, parsed.workspaceId)
            : buildScopedCategoryKey(parsed.categoryName, workspaceId);
        categoryLibraries[key] = data;

        // Remove any legacy unscoped key if it exists.
        const legacyKey = parsed.categoryName;
        if (legacyKey !== key && Object.prototype.hasOwnProperty.call(categoryLibraries, legacyKey)) {
            delete categoryLibraries[legacyKey];
        }
    }

    function getAllLibraries() { return categoryLibraries; }
    function setAllLibraries(data) { categoryLibraries = data; }

    function getDataTypes() { return dataTypes; }
    function getDataType(typeName) { return dataTypes[typeName]; }

    function getCategoryDataType(categoryName, workspaceId) {
        const lib = getCategoryLibrary(categoryName, workspaceId);
        return lib.dataType || 'graphicNovels';
    }

    function setCategoryDataType(categoryName, typeName, workspaceId) {
        const lib = getCategoryLibrary(categoryName, workspaceId);
        lib.dataType = typeName;
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
        setAllLibraries,
        getDataTypes,
        getDataType,
        getCategoryDataType,
        setCategoryDataType,
        getPage,
        setPage,
        getEntriesPerPage,
        buildScopedCategoryKey,
        parseScopedCategoryKey,
        getCurrentWorkspaceId
    };
})();
