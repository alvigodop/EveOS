window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getWlnUpdatesMeta = function (item) {
        const title = item.title || "No Title";
        const description = internals.cleanText(item.description, 240);
        
        // WLN provides limited cover data in search, often missing
        const coverUrl = "https://via.placeholder.com/120x180?text=No+Cover";

        return {
            source: "WlnUpdates",
            mediaType: "Novel",
            title,
            coverUrl,
            author: internals.toArray(item.authors).map(a => a.author).join(", "),
            artist: "",
            studios: [],
            producers: [],
            synonyms: [],
            description,
            status: "",
            score: "N/A",
            rank: "",
            popularity: "",
            members: "",
            favorites: "",
            chapters: "?",
            volumes: "?",
            episodes: "",
            duration: "",
            genres: internals.toArray(item.genres).map(g => g.genre),
            tags: internals.toArray(item.tags).map(t => t.tag),
            year: "",
            season: "",
            format: "Novel",
            sourceMaterial: "",
            countryOfOrigin: "",
            contentRating: "",
            startDate: "",
            endDate: "",
            url: item.id ? `https://www.wlnupdates.com/series-id/${item.id}/` : "",
            providerUrl: item.id ? `https://www.wlnupdates.com/series-id/${item.id}/` : ""
        };
    };
})(window.EveOS.API.DisplayInternals);