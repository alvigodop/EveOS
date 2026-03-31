window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getComicKMeta = function (item) {
        const title = item.title || "No Title";
        const description = internals.cleanText(item.desc || "", 240);
        
        // ComicK Cover logic
        let coverUrl = "https://via.placeholder.com/120x180?text=No+Cover";
        if (item.md_covers && item.md_covers.length > 0) {
            const cover = item.md_covers[0];
            if (cover.b2key) {
                coverUrl = `https://meo.comick.pictures/${cover.b2key}`;
            }
        }

        const score = item.rating ? String(item.rating) : "N/A";
        const followers = item.follow_count ? String(item.follow_count) : "";
        
        const year = item.year ? String(item.year) : "";
        const chapters = item.last_chapter ? String(item.last_chapter) : "?";
        
        // Map ComicK status codes
        const statusMap = {
            1: "Ongoing",
            2: "Completed",
            3: "Cancelled",
            4: "Hiatus"
        };
        const status = statusMap[item.status] || "";

        const providerUrl = `https://comick.io/comic/${item.slug}`;

        // Helper to extract strings from arrays of objects or strings
        const extractNames = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(i => i?.name || i?.title || i?.slug || (typeof i === 'string' ? i : '')).filter(Boolean);
        };

        const authors = extractNames(item.authors || item.author);
        const artists = extractNames(item.artists || item.artist);
        let tags = extractNames(
            item.md_comic_md_genres || 
            item.genres || 
            item.tags || 
            (item.mu_comics && item.mu_comics.mu_valid_genres) || 
            (item.mu_comics && item.mu_comics.genre)
        );
        const synonyms = extractNames(item.md_titles || item.alt_titles);
        const publishers = extractNames(item.publishers || item.publisher);

        // Map demographic to target Demographic tag if available
        if (item.demographic) {
            tags.push(`Demographic: ${item.demographic}`);
        }

        return {
            source: "ComicK",
            mediaType: item.country === 'kr' ? "Manhwa" : item.country === 'cn' ? "Manhua" : "Manga",
            title,
            coverUrl,
            author: authors.join(", "),
            artist: artists.join(", "),
            studios: publishers, // publishers mapped to studios for TVMaze/AniList parity
            producers: [],
            synonyms: synonyms,
            description,
            status,
            score,
            rank: item.rank ? String(item.rank) : "",
            popularity: followers,
            members: followers,
            favorites: "",
            chapters,
            volumes: item.last_volume ? String(item.last_volume) : "?",
            episodes: "",
            duration: "",
            genres: tags, // Combine genres/tags
            tags: [],
            year,
            season: "",
            format: item.translation_completed === false ? "Ongoing Translation" : "Translation Completed",
            sourceMaterial: "",
            countryOfOrigin: item.country ? item.country.toUpperCase() : "",
            contentRating: item.content_rating || "",
            startDate: year,
            endDate: "",
            url: providerUrl,
            providerUrl
        };
    };
})(window.EveOS.API.DisplayInternals);