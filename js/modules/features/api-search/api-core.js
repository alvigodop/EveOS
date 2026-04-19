window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CoreRuntime = api.CoreRuntime || {};
    if (!rt.sharedReady || !rt.fetchReady || !rt.wikimediaReady) {
        console.warn('API Core: runtime modules missing');
        return;
    }

    api.Core = {
        PROXY_URL: rt.PROXY_URL,
        CODETABS_PROXY_URL: rt.CODETABS_PROXY_URL,
        get ACTIVE_PROXY_URL() {
            return rt._activeProxyBase ? `${rt._activeProxyBase}/api/proxy?url=` : '';
        },
        ANILIST_API: rt.ENDPOINTS.ANILIST,
        JIKAN_API: rt.ENDPOINTS.JIKAN_MANGA,
        JIKAN_MANGA_API: rt.ENDPOINTS.JIKAN_MANGA,
        JIKAN_ANIME_API: rt.ENDPOINTS.JIKAN_ANIME,
        MANGADEX_API: rt.ENDPOINTS.MANGADEX,
        MANGAUPDATES_API: rt.ENDPOINTS.MANGAUPDATES,
        KITSU_ANIME_API: rt.ENDPOINTS.KITSU_ANIME,
        KITSU_MANGA_API: rt.ENDPOINTS.KITSU_MANGA,
        TVMAZE_API: rt.ENDPOINTS.TVMAZE,
        ITUNES_API: rt.ENDPOINTS.ITUNES,
        WLNUPDATES_API: rt.ENDPOINTS.WLNUPDATES,
        OPENLIBRARY_API: rt.ENDPOINTS.OPENLIBRARY,
        ensureLocalServicesProbed: rt.probeLocalServices,
        safeFetch: rt.safeFetch,
        fetchDirectThenProxy: rt.fetchDirectThenProxy,
        fetchTextWithFallback: rt.fetchTextWithFallback,
        fetchWithFallback: rt.fetchWithFallback,
        getPopupViewerUrl: rt.getPopupViewerUrl,
        getWikipediaSearchUrl: rt.getWikipediaSearchUrl,
        isWikimediaUrl: rt.isWikimediaUrl,
        fetchWikimediaResponse: rt.fetchWikimediaResponse,
        fetchWikimediaJson: rt.fetchWikimediaJson
    };
})(window.EveOS.API);
