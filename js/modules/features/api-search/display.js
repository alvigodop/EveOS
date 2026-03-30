window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (api, internals) {
    function normalizeDisplayArgs(arg1, arg2, arg3, arg4, arg5) {
        if (arg1 && typeof arg1 === "object" && (arg1.mangadex || arg1.jikanManga || arg1.jikanAnime || arg1.anilistManga || arg1.anilistAnime)) {
            return {
                sources: arg1,
                resultsDiv: arg2,
                onSelect: arg3
            };
        }
        return {
            // Backward-compatible argument form: (mangadex, jikanManga, anilistManga, resultsDiv, onSelect)
            sources: {
                mangadex: arg1,
                jikanManga: arg2,
                anilistManga: arg3
            },
            resultsDiv: arg4,
            onSelect: arg5
        };
    }

    function createMangaCard(data, resultsDiv, onSelect) {
        if (api?.CardUI?.createMangaCard) {
            api.CardUI.createMangaCard(data, resultsDiv, onSelect);
        } else {
            console.error("CardUI module not loaded");
        }
    }

    function appendResults(items, transform, resultsDiv, onSelect) {
        internals.toArray(items).forEach(item => {
            createMangaCard(transform(item), resultsDiv, onSelect);
        });
    }

    function displayResults(arg1, arg2, arg3, arg4, arg5) {
        const normalized = normalizeDisplayArgs(arg1, arg2, arg3, arg4, arg5);
        const sources = normalized.sources || {};
        const resultsDiv = normalized.resultsDiv;
        const onSelect = normalized.onSelect;
        if (!resultsDiv) return;

        const requiredFns = [
            "toArray",
            "getMangaDexMeta",
            "getJikanMeta",
            "getAniListMeta",
            "getMangaUpdatesMeta",
            "getKitsuMeta"
        ];
        const missing = requiredFns.filter(name => typeof internals[name] !== "function");
        if (missing.length) {
            console.error("Display module dependencies are missing:", missing.join(", "));
            resultsDiv.innerHTML = '<div style="padding:10px; opacity:0.7;">Search display modules are still loading. Please retry.</div>';
            return;
        }

        resultsDiv.innerHTML = "";
        resultsDiv.classList.add("api-search-results-grid");

        appendResults(sources.mangadex?.data, internals.getMangaDexMeta, resultsDiv, onSelect);
        appendResults(sources.jikanManga?.data, item => internals.getJikanMeta(item, "Manga"), resultsDiv, onSelect);
        appendResults(sources.jikanAnime?.data, item => internals.getJikanMeta(item, "Anime"), resultsDiv, onSelect);
        appendResults(sources.anilistManga?.data?.Page?.media, internals.getAniListMeta, resultsDiv, onSelect);
        appendResults(sources.anilistAnime?.data?.Page?.media, internals.getAniListMeta, resultsDiv, onSelect);
        appendResults(sources.mangaupdates?.results, internals.getMangaUpdatesMeta, resultsDiv, onSelect);
        appendResults(sources.kitsuAnime?.data, internals.getKitsuMeta, resultsDiv, onSelect);
        appendResults(sources.kitsuManga?.data, internals.getKitsuMeta, resultsDiv, onSelect);

        if (resultsDiv.children.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:10px; opacity:0.7;">No results found from API providers.</div>';
        }
    }

    api.Display = {
        displayResults,
        createMangaCard
    };
})(window.EveOS.API, window.EveOS.API.DisplayInternals);
