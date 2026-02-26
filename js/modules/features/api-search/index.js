window.EveOS = window.EveOS || {};

(function () {

    // Core Search Logic (Exposed)
    async function runSearch(query, resultsContainer, onSelect) {
        if (!query || !resultsContainer) return;

        resultsContainer.innerHTML = '<div style="padding:10px;">Searching APIs...</div>';
        resultsContainer.style.display = 'block';

        try {
            const Core = window.EveOS.API.Core;
            const MangaDex = window.EveOS.API.MangaDex;
            const Jikan = window.EveOS.API.Jikan;
            const AniList = window.EveOS.API.AniList;
            const Display = window.EveOS.API.Display;

            if (!Core || !MangaDex || !Jikan || !AniList || !Display) {
                resultsContainer.innerHTML = 'Error: API Modules not loaded.';
                return;
            }

            const [mangadexResults, jikanResults, anilistResults] = await Promise.all([
                MangaDex.searchMangaDex(query),
                Jikan.searchJikan(query),
                AniList.searchAniList(query)
            ]);

            Display.displayResults(mangadexResults, jikanResults, anilistResults, resultsContainer, onSelect);

        } catch (error) {
            console.error('Search error:', error);
            resultsContainer.innerHTML = 'An error occurred while searching.';
        }
    }

    /**
     * Renders the Search UI into a specific container and handles interactions.
     * Use this for standalone search boxes (like in Settings).
     */
    function renderSearchUI(searchContainer, resultsContainer, categoryName) {
        if (!searchContainer || !resultsContainer) return;

        // Clear previous content
        searchContainer.innerHTML = '';

        // Create UI Elements
        searchContainer.innerHTML = `
            <div class="api-search-box" style="display: flex; gap: 5px; margin-bottom: 10px;">
                <input type="text" class="api-search-input" placeholder="Search Manga/Anime..." style="flex:1; padding: 4px;">
                <button class="api-search-btn" style="padding: 4px 8px;">🔍</button>
            </div>
        `;

        const input = searchContainer.querySelector('.api-search-input');
        const btn = searchContainer.querySelector('.api-search-btn');

        // Event Handler
        const handleSearch = () => {
            runSearch(input.value.trim(), resultsContainer);
        };

        btn.onclick = handleSearch;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') handleSearch();
        };
    }

    window.EveOS.API.Manager = {
        renderSearchUI,
        runSearch // Expose for programmatic access
    };
})();
