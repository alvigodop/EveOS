/**
 * Options Updaters Module for Eve OS
 * Updates filter dropdowns based on data type
 * Adapted from MegaBase options-updaters.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;

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

    function updateGenreOptions(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const genreSelect = document.getElementById(prefix + 'search-genre');

        if (!genreSelect) return;

        const entries = Search?.getFolderScopedEntries
            ? Search.getFolderScopedEntries(categoryName)
            : (Search?.getTypeScopedEntries ? Search.getTypeScopedEntries(categoryName) : State.getCategoryLibrary(categoryName).entries);
        const genres = new Set();
        (entries || []).forEach(entry => {
            parseUniqueCsvList(entry?.genre).forEach(genre => genres.add(genre));
        });
        genreSelect.innerHTML = '<option value="">All Genres</option>';
        genres.forEach(g => {
            const option = document.createElement('option');
            option.value = g;
            option.textContent = g;
            genreSelect.appendChild(option);
        });
    }

    function updateStatusOptions(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const typeConfig = State.getDataType(dataType);
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

        // Status in form
        const statusSelect = document.getElementById(prefix + 'status');
        if (statusSelect) {
            statusSelect.innerHTML = '';
            (typeConfig?.statuses || []).forEach(st => {
                const option = document.createElement('option');
                option.value = st;
                option.textContent = st;
                statusSelect.appendChild(option);
            });
        }

        // Status in search
        const searchStatusSelect = document.getElementById(prefix + 'search-status');
        if (searchStatusSelect) {
            searchStatusSelect.innerHTML = '<option value="">All Statuses</option>';
            (typeConfig?.statuses || []).forEach(st => {
                const option = document.createElement('option');
                option.value = st;
                option.textContent = st;
                searchStatusSelect.appendChild(option);
            });
        }
    }

    function updateSortByOptions(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const typeConfig = State.getDataType(dataType);
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

        const sortBySelect = document.getElementById(prefix + 'sort-by');
        if (!sortBySelect) return;

        sortBySelect.innerHTML = '<option value="">Sort By</option>';
        const labelMap = {
            dateAdded: 'Date Added',
            lastEdited: 'Last Edited',
            selectedRating: 'Unified Rating',
            apiAverageRating: 'API Average',
            apiWeightedRating: 'API Weighted',
            hybridRating: 'Hybrid Rating',
            personal10Rating: 'Personal (10 Scale)',
            confidenceRating: 'Confidence'
        };
        (typeConfig?.sortOptions || []).forEach(field => {
            const option = document.createElement('option');
            option.value = field;
            option.textContent = labelMap[field] || (field.charAt(0).toUpperCase() + field.slice(1));
            sortBySelect.appendChild(option);
        });
    }

    function updateFieldsVisibility(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

        const isFilms = dataType === 'films';

        // Form fields
        const chapterLabel = document.getElementById(prefix + 'chapter-label');
        const chapterInput = document.getElementById(prefix + 'chapter');
        const seasonLabel = document.getElementById(prefix + 'season-label');
        const seasonInput = document.getElementById(prefix + 'season');
        const episodeLabel = document.getElementById(prefix + 'episode-label');
        const episodeInput = document.getElementById(prefix + 'episode');

        if (chapterLabel) chapterLabel.style.display = isFilms ? 'none' : 'block';
        if (chapterInput) chapterInput.style.display = isFilms ? 'none' : 'block';
        if (seasonLabel) seasonLabel.style.display = isFilms ? 'block' : 'none';
        if (seasonInput) seasonInput.style.display = isFilms ? 'block' : 'none';
        if (episodeLabel) episodeLabel.style.display = isFilms ? 'block' : 'none';
        if (episodeInput) episodeInput.style.display = isFilms ? 'block' : 'none';

        // Search fields
        const minChapter = document.getElementById(prefix + 'min-chapter');
        const maxChapter = document.getElementById(prefix + 'max-chapter');
        const minSeason = document.getElementById(prefix + 'min-season');
        const maxSeason = document.getElementById(prefix + 'max-season');
        const minEpisode = document.getElementById(prefix + 'min-episode');
        const maxEpisode = document.getElementById(prefix + 'max-episode');

        if (minChapter) minChapter.style.display = isFilms ? 'none' : 'inline-block';
        if (maxChapter) maxChapter.style.display = isFilms ? 'none' : 'inline-block';
        if (minSeason) minSeason.style.display = isFilms ? 'inline-block' : 'none';
        if (maxSeason) maxSeason.style.display = isFilms ? 'inline-block' : 'none';
        if (minEpisode) minEpisode.style.display = isFilms ? 'inline-block' : 'none';
        if (maxEpisode) maxEpisode.style.display = isFilms ? 'inline-block' : 'none';
    }

    window.EveLibrary.OptionsUpdaters = {
        updateGenreOptions,
        updateStatusOptions,
        updateSortByOptions,
        updateFieldsVisibility
    };
})();
