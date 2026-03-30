window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getTVmazeMeta = function (item) {
        const show = item?.show || {};
        const title = show.name || "No Title";
        const description = internals.cleanText(show.summary, 240);
        const coverUrl = show.image?.original || show.image?.medium || "https://via.placeholder.com/120x180?text=No+Cover";
        
        const genres = internals.uniqStrings(internals.toArray(show.genres));
        const status = show.status || "";
        const year = internals.extractYear(show.premiered) || "";
        const format = show.type || "TV Show";
        
        const rating = show.rating?.average ? String(show.rating.average) : "N/A";
        const language = show.language || "";
        const network = show.network?.name || show.webChannel?.name || "";

        return {
            source: "TVmaze",
            mediaType: "TV Show",
            title,
            coverUrl,
            author: network,
            artist: "",
            studios: network ? [network] : [],
            producers: [],
            synonyms: [],
            description,
            status,
            score: rating,
            rank: "",
            popularity: "",
            members: "",
            favorites: "",
            chapters: "",
            volumes: "",
            episodes: "",
            duration: show.runtime ? `${show.runtime}m` : "",
            genres,
            tags: language ? [`Language: ${language}`] : [],
            year,
            season: "",
            format,
            sourceMaterial: "",
            countryOfOrigin: show.network?.country?.code || "",
            contentRating: "",
            startDate: show.premiered || "",
            endDate: show.ended || "",
            url: show.url || "",
            providerUrl: show.url || ""
        };
    };
})(window.EveOS.API.DisplayInternals);