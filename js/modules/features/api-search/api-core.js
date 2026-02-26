window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function () {
    // Ported from MegaBase Constants
    const PROXY_URL = 'https://corsproxy.io/?';
    const ENDPOINTS = {
        ANILIST: 'https://graphql.anilist.co',
        JIKAN: 'https://api.jikan.moe/v4/manga',
        MANGADEX: 'https://api.mangadex.org/manga'
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
        JIKAN_API: ENDPOINTS.JIKAN,
        MANGADEX_API: ENDPOINTS.MANGADEX,
        safeFetch
    };
})();
