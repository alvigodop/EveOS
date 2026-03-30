window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getKitsuMeta = function (item) {
        const attributes = item?.attributes || {};
        const title = attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp || "No Title";
        const description = internals.cleanText(attributes.synopsis, 240);
        const coverUrl = attributes.posterImage?.original || attributes.posterImage?.large || "https://via.placeholder.com/120x180?text=No+Cover";
        
        const synonyms = internals.uniqStrings(Object.values(attributes.titles || {})).filter(t => t !== title);
        
        const mediaType = item?.type === "anime" ? "Anime" : "Manga";
        const isAnime = mediaType === "Anime";
        
        const status = attributes.status ? attributes.status.charAt(0).toUpperCase() + attributes.status.slice(1) : "";
        const score = attributes.averageRating ? attributes.averageRating : "N/A";
        const rank = attributes.ratingRank ? String(attributes.ratingRank) : "";
        const popularity = attributes.popularityRank ? String(attributes.popularityRank) : "";
        
        const episodes = isAnime ? (attributes.episodeCount ? String(attributes.episodeCount) : "?") : "";
        const duration = isAnime ? (attributes.episodeLength ? `${attributes.episodeLength}m` : "") : "";
        
        const chapters = !isAnime ? (attributes.chapterCount ? String(attributes.chapterCount) : "?") : "";
        const volumes = !isAnime ? (attributes.volumeCount ? String(attributes.volumeCount) : "?") : "";
        
        const year = internals.extractYear(attributes.startDate) || "";
        const format = attributes.subtype || "";
        
        const providerUrl = `https://kitsu.io/${item?.type}/${attributes.slug || item?.id}`;

        const extractedTags = item?._extractedTags || [];
        const genres = internals.uniqStrings([
            ...internals.limitList(extractedTags, 8),
            format
        ]);

        return {
            source: "Kitsu",
            mediaType,
            title,
            coverUrl,
            author: "",
            artist: "",
            studios: [],
            producers: [],
            synonyms: internals.limitList(synonyms, 16),
            description,
            status,
            score,
            rank,
            popularity,
            members: String(attributes.userCount || ""),
            favorites: String(attributes.favoritesCount || ""),
            chapters,
            volumes,
            episodes,
            duration,
            genres: genres,
            tags: extractedTags,
            year,
            season: "",
            format,
            sourceMaterial: "",
            countryOfOrigin: "",
            contentRating: attributes.ageRating ? `${attributes.ageRating}${attributes.ageRatingGuide ? ' - ' + attributes.ageRatingGuide : ''}` : (attributes.nsfw ? "NSFW" : ""),
            startDate: attributes.startDate || "",
            endDate: attributes.endDate || "",
            url: providerUrl,
            providerUrl
        };
    };
})(window.EveOS.API.DisplayInternals);