window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getiTunesMeta = function (item) {
        const title = item.trackName || item.collectionName || "No Title";
        
        // iTunes provides 100x100 by default, we swap the URL to get higher res
        let coverUrl = item.artworkUrl100 || "https://via.placeholder.com/120x180?text=No+Cover";
        coverUrl = coverUrl.replace("100x100bb", "600x600bb");

        const description = internals.cleanText(item.longDescription || item.shortDescription || "", 240);
        const year = item.releaseDate ? item.releaseDate.substring(0, 4) : "";
        
        const genre = item.primaryGenreName || "";

        return {
            source: "iTunes",
            mediaType: "Movie",
            title,
            coverUrl,
            author: item.artistName || "",
            artist: "",
            studios: [],
            producers: [],
            synonyms: [],
            description,
            status: "Released",
            score: "N/A",
            rank: "",
            popularity: "",
            members: "",
            favorites: "",
            chapters: "",
            volumes: "",
            episodes: "",
            duration: item.trackTimeMillis ? `${Math.round(item.trackTimeMillis / 60000)}m` : "",
            genres: genre ? [genre] : [],
            tags: item.contentAdvisoryRating ? [`Rating: ${item.contentAdvisoryRating}`] : [],
            year,
            season: "",
            format: "Movie",
            sourceMaterial: "",
            countryOfOrigin: item.country || "",
            contentRating: item.contentAdvisoryRating || "",
            startDate: item.releaseDate || "",
            endDate: "",
            url: item.trackViewUrl || item.collectionViewUrl || "",
            providerUrl: item.trackViewUrl || item.collectionViewUrl || ""
        };
    };
})(window.EveOS.API.DisplayInternals);