window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getMangaUpdatesMeta = function (item) {
        const record = item?.record || {};
        const title = record.title || "No Title";
        const description = internals.cleanText(record.description || record.synopsis, 240);
        
        let coverUrl = "https://via.placeholder.com/120x180?text=No+Cover";
        if (record.image?.url?.original) {
            coverUrl = record.image.url.original;
        }

        const genres = internals.uniqStrings(internals.toArray(record.genres).map(g => g?.genre));
        const tags = internals.uniqStrings(internals.toArray(record.categories).map(c => c?.category));

        const authors = internals.uniqStrings(
            internals.toArray(record.authors)
                .filter(a => a?.type === "Author")
                .map(a => a?.name)
        );
        const artists = internals.uniqStrings(
            internals.toArray(record.authors)
                .filter(a => a?.type === "Artist")
                .map(a => a?.name)
        );

        const status = record.status || "";
        const year = String(record.year || "");
        const format = record.type || "Manga";
        const score = record.bayesian_rating ? String(record.bayesian_rating) : "N/A";
        
        const providerUrl = record.url || (record.series_id ? `https://www.mangaupdates.com/series/${record.series_id}` : "");

        return {
            source: "MangaUpdates",
            mediaType: "Manga",
            title,
            coverUrl,
            author: authors.join(", "),
            artist: artists.join(", "),
            studios: [],
            producers: [],
            synonyms: [],
            description,
            status,
            score,
            rank: "",
            popularity: "",
            members: "",
            favorites: "",
            chapters: "?",
            volumes: "?",
            episodes: "",
            duration: "",
            genres,
            tags: internals.limitList(tags, 24),
            year,
            season: "",
            format,
            sourceMaterial: "",
            countryOfOrigin: "",
            contentRating: "",
            startDate: year,
            endDate: "",
            url: providerUrl,
            providerUrl
        };
    };
})(window.EveOS.API.DisplayInternals);