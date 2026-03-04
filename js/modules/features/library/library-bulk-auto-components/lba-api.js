window.EveLibrary = window.EveLibrary || {};

(function () {
    const Utils = window.EveLibrary.BulkAutoUtils;
    if (!Utils) {
        console.warn('[EveLibrary.BulkAutoApi] Utils module missing.');
        return;
    }

    function getApiModules() {
        const api = window.EveOS?.API || {};
        return {
            mangaDex: api.MangaDex,
            jikan: api.Jikan,
            aniList: api.AniList,
            internals: api.DisplayInternals
        };
    }

    function ensureDependencies() {
        const modules = getApiModules();
        if (!modules.mangaDex?.searchMangaDex) throw new Error('MangaDex API module unavailable');
        if (!modules.jikan?.searchJikanManga || !modules.jikan?.searchJikanAnime) throw new Error('Jikan API module unavailable');
        if (!modules.aniList?.searchAniListManga || !modules.aniList?.searchAniListAnime) throw new Error('AniList API module unavailable');
        if (!modules.internals?.getMangaDexMeta || !modules.internals?.getJikanMeta || !modules.internals?.getAniListMeta) {
            throw new Error('API display internals unavailable');
        }
        if (!window.EveLibrary?.ConnectionsAPI) throw new Error('Library Connections API unavailable');
        return modules;
    }

    function collectProviderCandidates(rawResults, internals) {
        const candidates = {
            MangaDex: [],
            MyAnimeList: [],
            AniList: []
        };

        const mangadexData = Array.isArray(rawResults?.mangadex?.data) ? rawResults.mangadex.data : [];
        mangadexData.forEach(item => candidates.MangaDex.push(internals.getMangaDexMeta(item)));

        const jikanMangaData = Array.isArray(rawResults?.jikanManga?.data) ? rawResults.jikanManga.data : [];
        jikanMangaData.forEach(item => candidates.MyAnimeList.push(internals.getJikanMeta(item, 'Manga')));

        const jikanAnimeData = Array.isArray(rawResults?.jikanAnime?.data) ? rawResults.jikanAnime.data : [];
        jikanAnimeData.forEach(item => candidates.MyAnimeList.push(internals.getJikanMeta(item, 'Anime')));

        const aniManga = rawResults?.aniListManga?.data?.Page?.media;
        (Array.isArray(aniManga) ? aniManga : []).forEach(item => candidates.AniList.push(internals.getAniListMeta(item)));

        const aniAnime = rawResults?.aniListAnime?.data?.Page?.media;
        (Array.isArray(aniAnime) ? aniAnime : []).forEach(item => candidates.AniList.push(internals.getAniListMeta(item)));

        return candidates;
    }

    function pickExactSource(candidates, bookmarkTitle) {
        return (Array.isArray(candidates) ? candidates : []).find(source => Utils.hasExactCaseMatch(bookmarkTitle, source)) || null;
    }

    async function findExactSourcesForTitle(bookmarkTitle) {
        const modules = ensureDependencies();
        const [mangadex, jikanManga, jikanAnime, aniListManga, aniListAnime] = await Promise.all([
            modules.mangaDex.searchMangaDex(bookmarkTitle),
            modules.jikan.searchJikanManga(bookmarkTitle),
            modules.jikan.searchJikanAnime(bookmarkTitle),
            modules.aniList.searchAniListManga(bookmarkTitle),
            modules.aniList.searchAniListAnime(bookmarkTitle)
        ]);

        const providerCandidates = collectProviderCandidates({
            mangadex,
            jikanManga,
            jikanAnime,
            aniListManga,
            aniListAnime
        }, modules.internals);

        const selected = [];
        Utils.PROVIDERS.forEach(provider => {
            const matched = pickExactSource(providerCandidates[provider], bookmarkTitle);
            if (matched) selected.push(matched);
        });
        return selected;
    }

    window.EveLibrary.BulkAutoApi = {
        ensureDependencies,
        findExactSourcesForTitle
    };
})();
