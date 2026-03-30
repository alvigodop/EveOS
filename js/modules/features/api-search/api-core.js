window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function () {
    // Ported from MegaBase Constants
    const PROXY_URL = 'https://corsproxy.io/?';
    const ENDPOINTS = {
        ANILIST: 'https://graphql.anilist.co',
        JIKAN_MANGA: 'https://api.jikan.moe/v4/manga',
        JIKAN_ANIME: 'https://api.jikan.moe/v4/anime',
        MANGADEX: 'https://api.mangadex.org/manga',
        MANGAUPDATES: 'https://api.mangaupdates.com/v1/series/search',
        KITSU_ANIME: 'https://kitsu.io/api/edge/anime',
        KITSU_MANGA: 'https://kitsu.io/api/edge/manga',
        TVMAZE: 'https://api.tvmaze.com/search/shows',
        ITUNES: 'https://itunes.apple.com/search',
        WLNUPDATES: 'https://www.wlnupdates.com/api',
        OPENLIBRARY: 'https://openlibrary.org/search.json'
    };

    async function safeFetch(url, options = {}, errorMsg = 'API Request failed') {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`${errorMsg} (${response.status}): ${errorText}`);
            }
            return await response.json();
        } catch (e) {
            console.warn(errorMsg, e);
            return null;
        }
    }

    // Expose for other modules
    window.EveOS.API.Core = {
        PROXY_URL,
        ANILIST_API: ENDPOINTS.ANILIST,
        JIKAN_API: ENDPOINTS.JIKAN_MANGA,
        JIKAN_MANGA_API: ENDPOINTS.JIKAN_MANGA,
        JIKAN_ANIME_API: ENDPOINTS.JIKAN_ANIME,
        MANGADEX_API: ENDPOINTS.MANGADEX,
        MANGAUPDATES_API: ENDPOINTS.MANGAUPDATES,
        KITSU_ANIME_API: ENDPOINTS.KITSU_ANIME,
        KITSU_MANGA_API: ENDPOINTS.KITSU_MANGA,
        TVMAZE_API: ENDPOINTS.TVMAZE,
        ITUNES_API: ENDPOINTS.ITUNES,
        WLNUPDATES_API: ENDPOINTS.WLNUPDATES,
        OPENLIBRARY_API: ENDPOINTS.OPENLIBRARY,
        safeFetch
    };
})();
