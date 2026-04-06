window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

    /**
     * Fetch raw search results from a specific API provider.
     */
    ctx.fetchProviderResults = async function fetchProviderResults(query, providerKey) {
        switch (providerKey) {
            case 'mangadex':
                return api.MangaDex.searchMangaDex(query);
            case 'jikanManga':
                return api.Jikan.searchJikanManga(query);
            case 'jikanAnime':
                return api.Jikan.searchJikanAnime(query);
            case 'anilistManga':
                return api.AniList.searchAniListManga(query);
            case 'anilistAnime':
                return api.AniList.searchAniListAnime(query);
            case 'mangaupdates':
                return api.MangaUpdates.searchMangaUpdates(query);
            case 'kitsuAnime':
                return api.Kitsu.searchKitsuAnime(query);
            case 'kitsuManga':
                return api.Kitsu.searchKitsuManga(query);
            case 'tvmaze':
                return api.TVmaze.searchTVmaze(query);
            case 'itunes':
                return api.iTunes.searchiTunes(query);
            case 'wlnupdates':
                return api.WlnUpdates.searchWlnUpdates(query);
            case 'openlibrary':
                return api.OpenLibrary.searchOpenLibrary(query);
            case 'comick':
                return api.ComicK.searchComicK(query);
            default:
                throw new Error(`Unsupported API provider source: ${providerKey}`);
        }
    };

    /**
     * Collect live results from one or all providers.
     */
    ctx.collectLiveResults = async function collectLiveResults(query, providerKey = null, skipSources = null) {
        const Core = api.Core;
        const MangaDex = api.MangaDex;
        const Jikan = api.Jikan;
        const AniList = api.AniList;
        const MangaUpdates = api.MangaUpdates;
        const Kitsu = api.Kitsu;
        const TVmaze = api.TVmaze;
        const iTunes = api.iTunes;
        const WlnUpdates = api.WlnUpdates;
        const OpenLibrary = api.OpenLibrary;
        const ComicK = api.ComicK;

        if (!Core || !MangaDex || !Jikan || !AniList || !MangaUpdates || !Kitsu || !TVmaze || !iTunes || !WlnUpdates || !OpenLibrary || !ComicK) {
            throw new Error('API modules are not fully loaded.');
        }

        if (providerKey && ctx.isProviderSource(providerKey)) {
            return {
                [providerKey]: await ctx.fetchProviderResults(query, providerKey)
            };
        }

        const pairs = await Promise.all(ctx.PROVIDER_KEYS.map(async function (key) {
            // Optimization: skip live fetch if we already have a valid cache hit for this specific provider in hybrid mode
            if (skipSources && skipSources[key]) {
                const list = ctx.getProviderList(skipSources, key);
                if (list.length > 0) {
                    console.log(`API Search: Skipping live fetch for [${key}] - using valid cache hit`);
                    return [key, skipSources[key]];
                }
            }

            try {
                const result = await ctx.fetchProviderResults(query, key);
                return [key, result];
            } catch (error) {
                console.error(`API Search: [${key}] fetch failed`, error);
                // Return empty placeholder instead of throwing, allowing other providers to succeed
                return [key, null];
            }
        }));

        return pairs.reduce(function (acc, pair) {
            if (pair[1] !== null) {
                acc[pair[0]] = pair[1];
            }
            return acc;
        }, {});
    };

})(window.EveOS.API);
