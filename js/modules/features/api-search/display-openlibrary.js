window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getOpenLibraryMeta = function (item) {
        const title = item.title || "No Title";
        
        let coverUrl = "https://via.placeholder.com/120x180?text=No+Cover";
        if (item.cover_i) {
            coverUrl = `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg`;
        } else if (item.isbn && item.isbn.length > 0) {
            coverUrl = `https://covers.openlibrary.org/b/isbn/${item.isbn[0]}-L.jpg`;
        }

        const authors = internals.toArray(item.author_name).join(", ");
        const year = item.first_publish_year ? String(item.first_publish_year) : "";

        return {
            source: "OpenLibrary",
            mediaType: "Book",
            title,
            coverUrl,
            author: authors,
            artist: "",
            studios: [],
            producers: [],
            synonyms: internals.limitList(internals.toArray(item.title_suggest), 5),
            description: item.first_sentence ? item.first_sentence.join(" ") : "",
            status: "",
            score: item._ratingsAverage ? String(Math.round(item._ratingsAverage * 100) / 100) : "N/A",
            rank: "",
            popularity: "",
            members: "",
            favorites: "",
            chapters: "",
            volumes: "",
            episodes: "",
            duration: "",
            genres: internals.limitList(internals.toArray(item.subject), 5),
            tags: [],
            year,
            season: "",
            format: "Book",
            sourceMaterial: "",
            countryOfOrigin: "",
            contentRating: "",
            startDate: year,
            endDate: "",
            url: item.key ? `https://openlibrary.org${item.key}` : "",
            providerUrl: item.key ? `https://openlibrary.org${item.key}` : ""
        };
    };
})(window.EveOS.API.DisplayInternals);