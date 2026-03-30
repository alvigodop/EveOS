window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getMangaUpdatesMeta = function (item) {
        const record = item?.record || {};
        const details = item?._fullDetails || {};
        
        const title = details.title || record.title || "No Title";
        
        // Use the helpers properly from internals or provide fallbacks
        const cleanText = internals.cleanText || ((t) => t || "");
        const toArray = internals.toArray || ((a) => Array.isArray(a) ? a : []);
        const uniqStrings = internals.uniqStrings || ((arr) => [...new Set(arr)]);
        const limitList = internals.limitList || ((arr, lim) => (arr || []).slice(0, lim));

        const description = cleanText(details.description || record.description || record.synopsis, 240);
        
        let coverUrl = "https://via.placeholder.com/120x180?text=No+Cover";
        if (details.image?.url?.original || record.image?.url?.original) {
            coverUrl = details.image?.url?.original || record.image.url.original;
        }

        const genres = uniqStrings(toArray(details.genres || record.genres).map(g => g?.genre));
        const tags = uniqStrings(toArray(details.categories || record.categories).map(c => c?.category));
        const synonyms = uniqStrings(toArray(details.associated).map(a => a?.title));

        const authorsList = toArray(details.authors || record.authors);
        const authors = uniqStrings(authorsList.filter(a => a?.type === "Author").map(a => a?.name));
        const artists = uniqStrings(authorsList.filter(a => a?.type === "Artist").map(a => a?.name));

        const status = details.status || record.status || "";
        const year = String(details.year || record.year || "");
        const format = details.type || record.type || "Manga";
        const score = details.bayesian_rating || record.bayesian_rating ? String(details.bayesian_rating || record.bayesian_rating) : "N/A";
        
        // Activity & List Stats
        const rankWeek = details.rank?.position?.week ? `#${details.rank.position.week}` : "";
        const listReading = details.rank?.lists?.reading ? `${details.rank.lists.reading}` : "";
        const listWish = details.rank?.lists?.wish ? `${details.rank.lists.wish}` : "";
        
        const providerUrl = details.url || record.url || (record.series_id ? `https://www.mangaupdates.com/series/${record.series_id}` : "");

        // Combine Genres and top Categories into prominent colored chips
        const combinedGenres = uniqStrings([
            ...genres,
            ...limitList(tags, 6),
            format
        ]);

        const metaTags = [...limitList(tags, 32)];
        if (details.licensed) metaTags.unshift("Licensed (EN)");
        if (listReading) metaTags.push(`Reading: ${listReading}`);
        if (listWish) metaTags.push(`Wish: ${listWish}`);

        return {
            source: "MangaUpdates",
            mediaType: format === "Novel" ? "Novel" : "Manga",
            title,
            coverUrl,
            author: authors.join(", "),
            artist: artists.join(", "),
            studios: [],
            producers: [],
            synonyms,
            description,
            status,
            score,
            rank: rankWeek,
            popularity: "",
            members: listReading ? `${listReading} active` : "",
            favorites: listWish,
            chapters: "?",
            volumes: "?",
            episodes: "",
            duration: "",
            genres: combinedGenres,
            tags: metaTags,
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