window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getMangaDexMeta = function (manga) {
        const attributes = manga?.attributes || {};
        const relationships = internals.toArray(manga?.relationships);
        const tags = internals.toArray(attributes?.tags);
        const stats = (manga?.stats && typeof manga.stats === "object") ? manga.stats : {};
        const bayesianRating = Number(stats?.rating?.bayesian);
        const averageRating = Number(stats?.rating?.average);
        const numericScore = Number.isFinite(bayesianRating)
            ? bayesianRating
            : (Number.isFinite(averageRating) ? averageRating : null);

        const coverRel = relationships.find(rel => rel.type === "cover_art");
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName
            ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}`
            : "https://via.placeholder.com/120x180?text=No+Cover";

        const authors = internals.uniqStrings(
            relationships
                .filter(rel => rel.type === "author")
                .map(rel => rel?.attributes?.name)
        );
        const artists = internals.uniqStrings(
            relationships
                .filter(rel => rel.type === "artist")
                .map(rel => rel?.attributes?.name)
        );

        const genres = [];
        const themedTags = [];
        const otherTags = [];
        tags.forEach(tag => {
            const tagName = internals.pickLocalizedText(tag?.attributes?.name);
            if (!tagName) return;
            const group = String(tag?.attributes?.group || "").toLowerCase();
            if (group === "genre") {
                genres.push(tagName);
            } else if (group === "theme" || group === "format" || group === "content") {
                themedTags.push(tagName);
            } else {
                otherTags.push(tagName);
            }
        });

        const title = internals.pickLocalizedText(attributes?.title) || "No Title";
        const synonyms = internals.limitList(
            internals.toArray(attributes?.altTitles).flatMap(item => Object.values(item || {})),
            16
        ).filter(synonym => synonym.toLowerCase() !== title.toLowerCase());

        const linkPairs = Object.entries(attributes?.links || {});
        const mappedLinks = linkPairs
            .map(([key, value]) => internals.parseMangaDexLink(key, value))
            .filter(Boolean);
        const providerUrl = `https://mangadex.org/title/${manga.id}`;

        const contentRating = internals.formatStatus(attributes?.contentRating);
        const demographic = internals.formatStatus(attributes?.publicationDemographic);
        const originalLanguage = String(attributes?.originalLanguage || "").toUpperCase();
        const translatedCount = internals.toArray(attributes?.availableTranslatedLanguages).length;
        const status = internals.formatStatus(attributes?.status);

        const enrichedTags = internals.uniqStrings([
            ...themedTags,
            ...otherTags,
            demographic ? `Demographic: ${demographic}` : "",
            originalLanguage ? `Original: ${originalLanguage}` : "",
            translatedCount ? `Translations: ${translatedCount}` : ""
        ]);

        const follows = Number.isFinite(Number(stats?.follows)) ? Number(stats.follows) : "";

        return {
            source: "MangaDex",
            mediaType: "Manga",
            title,
            coverUrl,
            author: authors.join(", "),
            artist: artists.join(", "),
            studios: [],
            producers: [],
            synonyms,
            description: internals.cleanText(internals.pickLocalizedText(attributes?.description), 240),
            status,
            score: numericScore === null ? "N/A" : Number(numericScore.toFixed(2)),
            rank: "",
            popularity: follows,
            members: follows,
            followers: follows,
            favorites: "",
            chapters: attributes?.lastChapter || "?",
            volumes: attributes?.lastVolume || "?",
            episodes: "",
            duration: "",
            genres: internals.uniqStrings(genres),
            tags: internals.limitList(enrichedTags, 24),
            year: attributes?.year || "",
            season: "",
            format: "Manga",
            sourceMaterial: "",
            countryOfOrigin: originalLanguage,
            contentRating,
            startDate: attributes?.year ? `${attributes.year}-01-01` : "",
            endDate: "",
            url: providerUrl,
            providerUrl,
            externalLinks: mappedLinks
        };
    };
})(window.EveOS.API.DisplayInternals);
