/**
 * Library State Module for Eve OS
 * Per-category library state management
 * Adapted from MegaBase library-state.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    // Libraries stored per category: { categoryName: { entries: [], dataType: 'graphicNovels' } }
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

    function getCategoryLibrary(categoryName) {
        if (!categoryLibraries[categoryName]) {
            categoryLibraries[categoryName] = {
                entries: [],
                dataType: 'graphicNovels' // default
            };
        }
        return categoryLibraries[categoryName];
    }

    function setCategoryLibrary(categoryName, data) {
        categoryLibraries[categoryName] = data;
    }

    function getAllLibraries() { return categoryLibraries; }
    function setAllLibraries(data) { categoryLibraries = data; }

    function getDataTypes() { return dataTypes; }
    function getDataType(typeName) { return dataTypes[typeName]; }

    function getCategoryDataType(categoryName) {
        const lib = getCategoryLibrary(categoryName);
        return lib.dataType || 'graphicNovels';
    }

    function setCategoryDataType(categoryName, typeName) {
        const lib = getCategoryLibrary(categoryName);
        lib.dataType = typeName;
    }

    function getPage(categoryName) {
        return paginationState[categoryName] || 1;
    }

    function setPage(categoryName, page) {
        paginationState[categoryName] = page;
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
        getEntriesPerPage
    };
})();
