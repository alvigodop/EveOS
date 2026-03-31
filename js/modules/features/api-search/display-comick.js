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
            if (cover.b2c) {
                coverUrl = `https://meo.comick.pictures/${cover.b2c}`;
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

        return {
            source: "ComicK",
            mediaType: "Manga",
            title,
            coverUrl,
            author: "",
            artist: "",
            studios: [],
            producers: [],
            synonyms: [],
            description,
            status,
            score,
            rank: "",
            popularity: followers,
            members: followers,
            favorites: "",
            chapters,
            volumes: "?",
            episodes: "",
            duration: "",
            genres: [],
            tags: [],
            year,
            season: "",
            format: "Manga",
            sourceMaterial: "",
            countryOfOrigin: item.country ? item.country.toUpperCase() : "",
            contentRating: "",
            startDate: year,
            endDate: "",
            url: providerUrl,
            providerUrl
        };
    };
})(window.EveOS.API.DisplayInternals);