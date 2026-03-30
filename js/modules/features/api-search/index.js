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
            const MangaUpdates = window.EveOS.API.MangaUpdates;
            const Kitsu = window.EveOS.API.Kitsu;
            const TVmaze = window.EveOS.API.TVmaze;
            const iTunes = window.EveOS.API.iTunes;
            const WlnUpdates = window.EveOS.API.WlnUpdates;
            const OpenLibrary = window.EveOS.API.OpenLibrary;
            const Display = window.EveOS.API.Display;

            if (!Core || !MangaDex || !Jikan || !AniList || !MangaUpdates || !Kitsu || !TVmaze || !iTunes || !WlnUpdates || !OpenLibrary || !Display) {
                resultsContainer.innerHTML = 'Error: API Modules not loaded.';
                return;
            }

            const [
                mangadexResults, 
                jikanMangaResults, 
                jikanAnimeResults, 
                anilistMangaResults, 
                anilistAnimeResults, 
                mangaupdatesResults, 
                kitsuAnimeResults, 
                kitsuMangaResults,
                tvmazeResults,
                itunesResults,
                wlnupdatesResults,
                openlibraryResults
            ] = await Promise.all([
                MangaDex.searchMangaDex(query),
                Jikan.searchJikanManga(query),
                Jikan.searchJikanAnime(query),
                AniList.searchAniListManga(query),
                AniList.searchAniListAnime(query),
                MangaUpdates.searchMangaUpdates(query),
                Kitsu.searchKitsuAnime(query),
                Kitsu.searchKitsuManga(query),
                TVmaze.searchTVmaze(query),
                iTunes.searchiTunes(query),
                WlnUpdates.searchWlnUpdates(query),
                OpenLibrary.searchOpenLibrary(query)
            ]);

            Display.displayResults(
                {
                    mangadex: mangadexResults,
                    jikanManga: jikanMangaResults,
                    jikanAnime: jikanAnimeResults,
                    anilistManga: anilistMangaResults,
                    anilistAnime: anilistAnimeResults,
                    mangaupdates: mangaupdatesResults,
                    kitsuAnime: kitsuAnimeResults,
                    kitsuManga: kitsuMangaResults,
                    tvmaze: tvmazeResults,
                    itunes: itunesResults,
                    wlnupdates: wlnupdatesResults,
                    openlibrary: openlibraryResults
                },
                resultsContainer,
                onSelect
            );

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
