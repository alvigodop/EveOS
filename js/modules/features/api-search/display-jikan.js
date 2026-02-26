window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getJikanMangaPeople = function (manga) {
        const people = internals.toArray(manga?.authors);
        const authors = internals.uniqStrings(
            people
                .filter(person => {
                    const type = String(person?.type || "").toLowerCase();
                    return !type || type.includes("story") || type.includes("author");
                })
                .map(person => person?.name)
        );
        const artists = internals.uniqStrings(
            people
                .filter(person => {
                    const type = String(person?.type || "").toLowerCase();
                    return type.includes("art") || type.includes("illustr");
                })
                .map(person => person?.name)
        );

        const fallback = internals.uniqStrings(people.map(person => person?.name));
        return {
            authors: authors.length ? authors : fallback,
            artists
        };
    };

    internals.getJikanMeta = function (item, mediaType) {
        const isAnime = mediaType === "Anime";
        const coverUrl = item?.images?.jpg?.large_image_url
            || item?.images?.webp?.large_image_url
            || item?.images?.jpg?.image_url
            || item?.images?.webp?.image_url
            || "https://via.placeholder.com/120x180?text=No+Cover";

        const title = item?.title || item?.title_english || "No Title";
        const synonyms = internals.limitList([
            item?.title_english,
            item?.title_japanese,
            ...internals.toArray(item?.title_synonyms),
            ...internals.toArray(item?.titles).map(t => t?.title)
        ], 16).filter(synonym => synonym.toLowerCase() !== title.toLowerCase());

        const genres = internals.uniqStrings(internals.toArray(item?.genres).map(genre => genre?.name));
        const themes = internals.uniqStrings(internals.toArray(item?.themes).map(theme => theme?.name));
        const demographics = internals.uniqStrings(internals.toArray(item?.demographics).map(group => group?.name));
        const explicit = internals.uniqStrings(internals.toArray(item?.explicit_genres).map(genre => genre?.name));
        const serializations = internals.uniqStrings(internals.toArray(item?.serializations).map(series => series?.name));

        const tags = internals.limitList([
            ...themes,
            ...demographics,
            ...explicit,
            ...serializations.map(name => `Serialization: ${name}`)
        ], 24);

        const studios = isAnime ? internals.uniqStrings(internals.toArray(item?.studios).map(studio => studio?.name)) : [];
        const producers = isAnime ? internals.uniqStrings([
            ...internals.toArray(item?.producers).map(producer => producer?.name),
            ...internals.toArray(item?.licensors).map(licensor => licensor?.name)
        ]) : [];

        const people = isAnime ? { authors: [], artists: [] } : internals.getJikanMangaPeople(item);
        const contentRating = isAnime
            ? internals.formatStatus(item?.rating)
            : (item?.sfw === false ? "Mature" : "");

        const startDateRaw = isAnime ? item?.aired?.from : item?.published?.from;
        const endDateRaw = isAnime ? item?.aired?.to : item?.published?.to;

        return {
            source: "MyAnimeList",
            mediaType,
            title,
            coverUrl,
            author: people.authors.join(", "),
            artist: people.artists.join(", "),
            studios,
            producers,
            synonyms,
            description: internals.cleanText(item?.synopsis, 240),
            status: internals.formatStatus(item?.status),
            score: item?.score ?? "N/A",
            rank: item?.rank ?? "",
            popularity: item?.popularity ?? "",
            members: item?.members ?? "",
            favorites: item?.favorites ?? "",
            chapters: isAnime ? "" : (item?.chapters ?? "?"),
            volumes: isAnime ? "" : (item?.volumes ?? "?"),
            episodes: isAnime ? (item?.episodes ?? "?") : "",
            duration: isAnime ? (item?.duration || "") : "",
            genres,
            tags,
            year: String(item?.year || internals.extractYear(startDateRaw) || ""),
            season: isAnime ? internals.formatSeason(item?.season, item?.year) : "",
            format: item?.type || "",
            sourceMaterial: internals.formatStatus(item?.source),
            countryOfOrigin: "",
            contentRating,
            startDate: startDateRaw || "",
            endDate: endDateRaw || "",
            url: item?.url || ""
        };
    };
})(window.EveOS.API.DisplayInternals);
