window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.getAniListPeople = function (staffEdges) {
        const authorNames = [];
        const artistNames = [];
        const fallbackNames = [];

        staffEdges.forEach(edge => {
            const fullName = edge?.node?.name?.full;
            if (!fullName) return;

            const role = String(edge?.role || "").toLowerCase();
            const occupations = internals.toArray(edge?.node?.primaryOccupations).map(item => String(item || "").toLowerCase());
            const combined = [role, ...occupations];

            const isAuthor = combined.some(term =>
                term.includes("writer") ||
                term.includes("story") ||
                term.includes("mangaka") ||
                term.includes("creator") ||
                term.includes("author") ||
                term.includes("script") ||
                term.includes("original")
            );
            const isArtist = combined.some(term =>
                term.includes("artist") ||
                term.includes("illustrator") ||
                term.includes("character design") ||
                term.includes("art")
            );

            if (isAuthor) authorNames.push(fullName);
            if (isArtist) artistNames.push(fullName);
            if (!isAuthor && !isArtist) fallbackNames.push(fullName);
        });

        const authors = internals.uniqStrings(authorNames.length ? authorNames : fallbackNames);
        const artists = internals.uniqStrings(artistNames);
        return { authors, artists };
    };

    internals.pickAniListRank = function (rankings) {
        const ordered = internals.toArray(rankings)
            .filter(item => Number.isFinite(Number(item?.rank)))
            .sort((a, b) => Number(a.rank) - Number(b.rank));
        if (ordered.length === 0) return "";
        return ordered[0].rank;
    };

    internals.getAniListMeta = function (media) {
        const staffEdges = internals.toArray(media?.staff?.edges);
        const people = internals.getAniListPeople(staffEdges);
        const studios = internals.uniqStrings(
            internals.toArray(media?.studios?.nodes).map(studio => studio?.name)
        );
        const title = media?.title?.english || media?.title?.userPreferred || media?.title?.romaji || "No Title";
        const mediaType = internals.formatStatus(media?.type) || "Media";
        const startDate = internals.formatDateParts(media?.startDate);
        const endDate = internals.formatDateParts(media?.endDate);

        const tags = internals.limitList(
            internals.toArray(media?.tags)
                .filter(tag => !tag?.isMediaSpoiler)
                .sort((a, b) => (Number(b?.rank) || 0) - (Number(a?.rank) || 0))
                .map(tag => tag?.name),
            24
        );

        const synonyms = internals.limitList([
            media?.title?.native,
            ...internals.toArray(media?.synonyms)
        ], 16).filter(synonym => synonym.toLowerCase() !== title.toLowerCase());

        const siteUrl = media?.siteUrl
            || (mediaType.toLowerCase() === "anime"
                ? `https://anilist.co/anime/${media?.id}`
                : `https://anilist.co/manga/${media?.id}`);

        return {
            source: "AniList",
            mediaType,
            title,
            coverUrl: media?.coverImage?.large || "https://via.placeholder.com/120x180?text=No+Cover",
            author: people.authors.join(", "),
            artist: people.artists.join(", "),
            studios,
            producers: [],
            synonyms,
            description: internals.cleanText(media?.description, 240),
            status: internals.formatStatus(media?.status),
            score: media?.averageScore ?? media?.meanScore ?? "N/A",
            rank: internals.pickAniListRank(media?.rankings),
            popularity: media?.popularity ?? "",
            members: "",
            favorites: media?.favourites ?? "",
            chapters: media?.chapters ?? "",
            volumes: media?.volumes ?? "",
            episodes: media?.episodes ?? "",
            duration: media?.duration ? `${media.duration} min` : "",
            genres: internals.uniqStrings(internals.toArray(media?.genres)),
            tags,
            year: media?.startDate?.year || media?.seasonYear || "",
            season: internals.formatSeason(media?.season, media?.seasonYear),
            format: internals.formatStatus(media?.format),
            sourceMaterial: internals.formatStatus(media?.source),
            countryOfOrigin: String(media?.countryOfOrigin || "").toUpperCase(),
            contentRating: media?.isAdult ? "Adult" : "",
            startDate,
            endDate,
            url: siteUrl
        };
    };
})(window.EveOS.API.DisplayInternals);
