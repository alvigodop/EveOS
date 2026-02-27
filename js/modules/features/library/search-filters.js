/**
 * Search Filters Module for Eve OS
 * Handles filtering and sorting library entries
 * Adapted from MegaBase search-filters.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Ratings = window.EveLibrary.Ratings;

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function parseUniqueCsvList(value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

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
        const ratingScale = document.getElementById(prefix + 'search-rating-scale')?.value
            || Ratings?.getActiveScale?.(config)
            || 'hybrid';
        const statusFilter = document.getElementById(prefix + 'search-status')?.value || '';
        const languageFilter = (document.getElementById(prefix + 'search-language')?.value || '').toLowerCase();
        const tagsInput = (document.getElementById(prefix + 'search-tags')?.value || '').toLowerCase();
        const showFavoritesOnly = document.getElementById(prefix + 'filter-favorites')?.checked || false;
        const minDerivedRatingRaw = document.getElementById(prefix + 'min-derived-rating')?.value;
        const maxDerivedRatingRaw = document.getElementById(prefix + 'max-derived-rating')?.value;
        const minDerivedRating = Number.isFinite(Number(minDerivedRatingRaw)) && minDerivedRatingRaw !== '' ? Number(minDerivedRatingRaw) : 0;
        const maxDerivedRating = Number.isFinite(Number(maxDerivedRatingRaw)) && maxDerivedRatingRaw !== '' ? Number(maxDerivedRatingRaw) : Infinity;

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
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(entry);
            }
            const entryTags = toArray(entry.tags)
                .flatMap(tag => parseUniqueCsvList(tag))
                .map(t => t.toLowerCase());
            const entryGenres = parseUniqueCsvList(entry.genre).map(genre => genre.toLowerCase());
            const searchableAuthorFields = [
                entry.author,
                ...toArray(entry.authorAltNames),
                ...parseUniqueCsvList(entry.artist)
            ].map(value => String(value || '').toLowerCase());

            // Text & Selection Filters
            if (titleFilter && !String(entry.title || '').toLowerCase().includes(titleFilter)) return false;
            if (authorFilter && !searchableAuthorFields.some(value => value.includes(authorFilter))) return false;
            if (genreFilter && !entryGenres.includes(String(genreFilter).toLowerCase())) return false;
            if (ratingFilter && entry.rating?.toString() !== ratingFilter) return false;
            if (statusFilter && entry.status !== statusFilter) return false;
            if (showFavoritesOnly && !entry.favorite) return false;
            if (languageFilter && !String(entry.language || '').toLowerCase().includes(languageFilter)) return false;
            if (tagsArray.length > 0 && !tagsArray.every(t => entryTags.includes(t))) return false;
            const selectedDerivedRating = Ratings?.getRatingValue
                ? Ratings.getRatingValue(entry, ratingScale)
                : null;
            const hasMinDerivedFilter = minDerivedRatingRaw !== '' && minDerivedRatingRaw !== undefined && minDerivedRatingRaw !== null;
            const hasMaxDerivedFilter = maxDerivedRatingRaw !== '' && maxDerivedRatingRaw !== undefined && maxDerivedRatingRaw !== null;
            if (hasMinDerivedFilter && !Number.isNaN(minDerivedRating) && (selectedDerivedRating === null || selectedDerivedRating < minDerivedRating)) return false;
            if (hasMaxDerivedFilter && !Number.isNaN(maxDerivedRating) && (selectedDerivedRating === null || selectedDerivedRating > maxDerivedRating)) return false;

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

    function sortEntries(entries, sortBy, sortOrder, categoryName) {
        if (!sortBy) return entries;
        const prefix = categoryName ? `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-` : '';
        const selectedScale = prefix
            ? (document.getElementById(prefix + 'search-rating-scale')?.value || Ratings?.getActiveScale?.(config) || 'hybrid')
            : (Ratings?.getActiveScale?.(config) || 'hybrid');

        return entries.sort((a, b) => {
            if (sortBy === 'dateAdded' || sortBy === 'lastEdited') {
                const rawA = sortBy === 'lastEdited' ? (a?.lastEdited || a?.dateAdded || '') : (a?.dateAdded || '');
                const rawB = sortBy === 'lastEdited' ? (b?.lastEdited || b?.dateAdded || '') : (b?.dateAdded || '');
                const dateA = Date.parse(rawA) || 0;
                const dateB = Date.parse(rawB) || 0;
                const comparison = dateA - dateB;
                return sortOrder === 'desc' ? -comparison : comparison;
            }
            if (sortBy === 'selectedRating') {
                if (Ratings?.applyDerivedRatings) {
                    Ratings.applyDerivedRatings(a);
                    Ratings.applyDerivedRatings(b);
                }
                const valA = Ratings?.getRatingValue ? Ratings.getRatingValue(a, selectedScale) : null;
                const valB = Ratings?.getRatingValue ? Ratings.getRatingValue(b, selectedScale) : null;
                const safeA = Number.isFinite(Number(valA)) ? Number(valA) : -1;
                const safeB = Number.isFinite(Number(valB)) ? Number(valB) : -1;
                const comparison = safeA - safeB;
                return sortOrder === 'desc' ? -comparison : comparison;
            }
            if (sortBy === 'apiAverageRating' || sortBy === 'apiWeightedRating' || sortBy === 'hybridRating' || sortBy === 'personal10Rating' || sortBy === 'confidenceRating') {
                if (Ratings?.applyDerivedRatings) {
                    Ratings.applyDerivedRatings(a);
                    Ratings.applyDerivedRatings(b);
                }
                const keyMap = {
                    apiAverageRating: 'apiAverage10',
                    apiWeightedRating: 'apiWeighted10',
                    hybridRating: 'hybrid10',
                    personal10Rating: 'personal10',
                    confidenceRating: 'confidence'
                };
                const key = keyMap[sortBy];
                const valA = a?.derivedRatings?.[key];
                const valB = b?.derivedRatings?.[key];
                const safeA = Number.isFinite(Number(valA)) ? Number(valA) : -1;
                const safeB = Number.isFinite(Number(valB)) ? Number(valB) : -1;
                const comparison = safeA - safeB;
                return sortOrder === 'desc' ? -comparison : comparison;
            }

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
            'search-language', 'sort-by', 'min-derived-rating', 'max-derived-rating'
        ];
        ids.forEach(id => {
            const el = document.getElementById(prefix + id);
            if (el) el.value = '';
        });
        const ratingScale = document.getElementById(prefix + 'search-rating-scale');
        if (ratingScale) ratingScale.value = Ratings?.getActiveScale?.(config) || 'hybrid';

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
