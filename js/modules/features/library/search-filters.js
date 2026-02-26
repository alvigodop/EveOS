/**
 * Search Filters Module for Eve OS
 * Handles filtering and sorting library entries
 * Adapted from MegaBase search-filters.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;

    function isEntryVisibleForDataType(entry, dataType) {
        const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : null;
        // Legacy entries without explicit mediaTypes stay visible.
        if (!mediaTypes || mediaTypes.length === 0) return true;
        return mediaTypes.includes(dataType);
    }

    function getTypeScopedEntries(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const entries = lib.entries || [];
        return entries.filter(entry => isEntryVisibleForDataType(entry, dataType));
    }

    function getFilteredEntries(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const entries = getTypeScopedEntries(categoryName);
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

        // Get filter values
        const titleFilter = (document.getElementById(prefix + 'search-title')?.value || '').toLowerCase();
        const authorFilter = (document.getElementById(prefix + 'search-author')?.value || '').toLowerCase();
        const genreFilter = document.getElementById(prefix + 'search-genre')?.value || '';
        const ratingFilter = document.getElementById(prefix + 'search-rating')?.value || '';
        const statusFilter = document.getElementById(prefix + 'search-status')?.value || '';
        const languageFilter = (document.getElementById(prefix + 'search-language')?.value || '').toLowerCase();
        const tagsInput = (document.getElementById(prefix + 'search-tags')?.value || '').toLowerCase();
        const showFavoritesOnly = document.getElementById(prefix + 'filter-favorites')?.checked || false;

        // Numeric filters
        const minChapter = parseInt(document.getElementById(prefix + 'min-chapter')?.value) || 0;
        const maxChapter = parseInt(document.getElementById(prefix + 'max-chapter')?.value) || Infinity;
        const minSeason = parseInt(document.getElementById(prefix + 'min-season')?.value) || 0;
        const maxSeason = parseInt(document.getElementById(prefix + 'max-season')?.value) || Infinity;
        const minEpisode = parseInt(document.getElementById(prefix + 'min-episode')?.value) || 0;
        const maxEpisode = parseInt(document.getElementById(prefix + 'max-episode')?.value) || Infinity;

        const tagsArray = tagsInput.split(',').map(t => t.trim()).filter(t => t);

        const isInRange = (val, min, max) => (typeof val === 'number' && val >= min && val <= max);

        return entries.filter(entry => {
            const entryTags = (entry.tags || []).map(t => t.toLowerCase());

            // Text & Selection Filters
            if (titleFilter && !entry.title.toLowerCase().includes(titleFilter)) return false;
            if (authorFilter && !entry.author.toLowerCase().includes(authorFilter)) return false;
            if (genreFilter && entry.genre !== genreFilter) return false;
            if (ratingFilter && entry.rating?.toString() !== ratingFilter) return false;
            if (statusFilter && entry.status !== statusFilter) return false;
            if (showFavoritesOnly && !entry.favorite) return false;
            if (languageFilter && !entry.language.toLowerCase().includes(languageFilter)) return false;
            if (tagsArray.length > 0 && !tagsArray.every(t => entryTags.includes(t))) return false;

            // Numeric Range Filters
            if (dataType === 'graphicNovels' || dataType === 'novels') {
                if (!isInRange(entry.chapter || 0, minChapter, maxChapter)) return false;
            } else if (dataType === 'films') {
                if (!isInRange(entry.season || 0, minSeason, maxSeason)) return false;
                if (!isInRange(entry.episode || 0, minEpisode, maxEpisode)) return false;
            }

            return true;
        });
    }

    function sortEntries(entries, sortBy, sortOrder) {
        if (!sortBy) return entries;

        return entries.sort((a, b) => {
            let valA = a[sortBy];
            let valB = b[sortBy];

            // Handle strings
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            // Handle undefined
            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            let comparison = 0;
            if (valA < valB) comparison = -1;
            else if (valA > valB) comparison = 1;

            return sortOrder === 'desc' ? -comparison : comparison;
        });
    }

    function resetFilters(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const ids = [
            'search-title', 'search-author', 'search-genre', 'search-rating',
            'min-chapter', 'max-chapter', 'min-season', 'max-season',
            'min-episode', 'max-episode', 'search-tags', 'search-status',
            'search-language', 'sort-by'
        ];
        ids.forEach(id => {
            const el = document.getElementById(prefix + id);
            if (el) el.value = '';
        });

        const sortOrder = document.getElementById(prefix + 'sort-order');
        if (sortOrder) sortOrder.value = 'asc';

        const favorites = document.getElementById(prefix + 'filter-favorites');
        if (favorites) favorites.checked = false;
    }

    window.EveLibrary.Search = {
        isEntryVisibleForDataType,
        getTypeScopedEntries,
        getFilteredEntries,
        sortEntries,
        resetFilters
    };
})();
