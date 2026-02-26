window.EveOS = window.EveOS || {};

(function () {
    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function uniqStrings(values) {
        const seen = new Set();
        const result = [];
        values.forEach(value => {
            const normalized = String(value || "").trim();
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(normalized);
        });
        return result;
    }

    function limitList(values, max) {
        return uniqStrings(values).slice(0, max);
    }

    function pickLocalizedText(raw) {
        if (!raw) return "";
        if (typeof raw === "string") return raw;
        if (typeof raw !== "object") return "";

        const preferred = ["en", "en_us", "ja-ro", "ja", "ko", "es", "fr"];
        for (const key of preferred) {
            if (typeof raw[key] === "string" && raw[key].trim()) return raw[key];
        }

        const fallback = Object.values(raw).find(value => typeof value === "string" && value.trim());
        return fallback || "";
    }

    function cleanText(raw, maxLength = 240) {
        const text = String(raw || "")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!text) return "";
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 3).trim()}...`;
    }

    function formatStatus(status) {
        const source = String(status || "").trim();
        if (!source) return "";
        return source
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    function extractYear(rawDate) {
        if (!rawDate) return "";
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) return "";
        return String(parsed.getUTCFullYear());
    }

    function formatDateParts(parts) {
        if (!parts || typeof parts !== "object") return "";
        const year = Number(parts.year);
        const month = Number(parts.month);
        const day = Number(parts.day);
        if (!Number.isFinite(year)) return "";
        const mm = Number.isFinite(month) && month > 0 ? String(month).padStart(2, "0") : "01";
        const dd = Number.isFinite(day) && day > 0 ? String(day).padStart(2, "0") : "01";
        return `${year}-${mm}-${dd}`;
    }

    function formatSeason(season, year) {
        const seasonName = formatStatus(season);
        const yearText = String(year || "").trim();
        if (!seasonName && !yearText) return "";
        if (seasonName && yearText) return `${seasonName} ${yearText}`;
        return seasonName || yearText;
    }

    function parseMangaDexLink(key, value) {
        const next = String(value || "").trim();
        if (!next) return "";
        if (/^https?:\/\//i.test(next)) return next;
        switch (key) {
            case "al":
                return `https://anilist.co/manga/${next}`;
            case "mal":
                return `https://myanimelist.net/manga/${next}`;
            case "mu":
                return `https://www.mangaupdates.com/series/${next}`;
            case "nu":
                return `https://www.novelupdates.com/series/${next}`;
            default:
                return "";
        }
    }

    function getMangaDexMeta(manga) {
        const attributes = manga?.attributes || {};
        const relationships = toArray(manga?.relationships);
        const tags = toArray(attributes?.tags);

        const coverRel = relationships.find(rel => rel.type === "cover_art");
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName
            ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}`
            : "https://via.placeholder.com/120x180?text=No+Cover";

        const authors = uniqStrings(
            relationships
                .filter(rel => rel.type === "author")
                .map(rel => rel?.attributes?.name)
        );
        const artists = uniqStrings(
            relationships
                .filter(rel => rel.type === "artist")
                .map(rel => rel?.attributes?.name)
        );

        const genres = [];
        const themedTags = [];
        const otherTags = [];
        tags.forEach(tag => {
            const tagName = pickLocalizedText(tag?.attributes?.name);
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

        const title = pickLocalizedText(attributes?.title) || "No Title";
        const synonyms = limitList(
            toArray(attributes?.altTitles).flatMap(item => Object.values(item || {})),
            16
        ).filter(synonym => synonym.toLowerCase() !== title.toLowerCase());

        const linkPairs = Object.entries(attributes?.links || {});
        const mappedLinks = linkPairs
            .map(([key, value]) => parseMangaDexLink(key, value))
            .filter(Boolean);
        const url = mappedLinks[0] || `https://mangadex.org/title/${manga.id}`;

        const contentRating = formatStatus(attributes?.contentRating);
        const demographic = formatStatus(attributes?.publicationDemographic);
        const originalLanguage = String(attributes?.originalLanguage || "").toUpperCase();
        const translatedCount = toArray(attributes?.availableTranslatedLanguages).length;
        const status = formatStatus(attributes?.status);

        const enrichedTags = uniqStrings([
            ...themedTags,
            ...otherTags,
            demographic ? `Demographic: ${demographic}` : "",
            originalLanguage ? `Original: ${originalLanguage}` : "",
            translatedCount ? `Translations: ${translatedCount}` : ""
        ]);

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
            description: cleanText(pickLocalizedText(attributes?.description), 240),
            status,
            score: "N/A",
            rank: "",
            popularity: "",
            members: "",
            favorites: "",
            chapters: attributes?.lastChapter || "?",
            volumes: attributes?.lastVolume || "?",
            episodes: "",
            duration: "",
            genres: uniqStrings(genres),
            tags: limitList(enrichedTags, 24),
            year: attributes?.year || "",
            season: "",
            format: "Manga",
            sourceMaterial: "",
            countryOfOrigin: originalLanguage,
            contentRating,
            startDate: attributes?.year ? `${attributes.year}-01-01` : "",
            endDate: "",
            url
        };
    }

    function getJikanMangaPeople(manga) {
        const people = toArray(manga?.authors);
        const authors = uniqStrings(
            people
                .filter(person => {
                    const type = String(person?.type || "").toLowerCase();
                    return !type || type.includes("story") || type.includes("author");
                })
                .map(person => person?.name)
        );
        const artists = uniqStrings(
            people
                .filter(person => {
                    const type = String(person?.type || "").toLowerCase();
                    return type.includes("art") || type.includes("illustr");
                })
                .map(person => person?.name)
        );

        const fallback = uniqStrings(people.map(person => person?.name));
        return {
            authors: authors.length ? authors : fallback,
            artists
        };
    }

    function getJikanMeta(item, mediaType) {
        const isAnime = mediaType === "Anime";
        const coverUrl = item?.images?.jpg?.large_image_url
            || item?.images?.webp?.large_image_url
            || item?.images?.jpg?.image_url
            || item?.images?.webp?.image_url
            || "https://via.placeholder.com/120x180?text=No+Cover";

        const title = item?.title || item?.title_english || "No Title";
        const synonyms = limitList([
            item?.title_english,
            item?.title_japanese,
            ...toArray(item?.title_synonyms),
            ...toArray(item?.titles).map(t => t?.title)
        ], 16).filter(synonym => synonym.toLowerCase() !== title.toLowerCase());

        const genres = uniqStrings(toArray(item?.genres).map(genre => genre?.name));
        const themes = uniqStrings(toArray(item?.themes).map(theme => theme?.name));
        const demographics = uniqStrings(toArray(item?.demographics).map(group => group?.name));
        const explicit = uniqStrings(toArray(item?.explicit_genres).map(genre => genre?.name));
        const serializations = uniqStrings(toArray(item?.serializations).map(series => series?.name));

        const tags = limitList([
            ...themes,
            ...demographics,
            ...explicit,
            ...serializations.map(name => `Serialization: ${name}`)
        ], 24);

        const studios = isAnime ? uniqStrings(toArray(item?.studios).map(studio => studio?.name)) : [];
        const producers = isAnime ? uniqStrings([
            ...toArray(item?.producers).map(producer => producer?.name),
            ...toArray(item?.licensors).map(licensor => licensor?.name)
        ]) : [];

        const people = isAnime ? { authors: [], artists: [] } : getJikanMangaPeople(item);
        const contentRating = isAnime
            ? formatStatus(item?.rating)
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
            description: cleanText(item?.synopsis, 240),
            status: formatStatus(item?.status),
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
            year: String(item?.year || extractYear(startDateRaw) || ""),
            season: isAnime ? formatSeason(item?.season, item?.year) : "",
            format: item?.type || "",
            sourceMaterial: formatStatus(item?.source),
            countryOfOrigin: "",
            contentRating,
            startDate: startDateRaw || "",
            endDate: endDateRaw || "",
            url: item?.url || ""
        };
    }

    function getAniListPeople(staffEdges) {
        const authorNames = [];
        const artistNames = [];
        const fallbackNames = [];

        staffEdges.forEach(edge => {
            const fullName = edge?.node?.name?.full;
            if (!fullName) return;

            const role = String(edge?.role || "").toLowerCase();
            const occupations = toArray(edge?.node?.primaryOccupations).map(item => String(item || "").toLowerCase());
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

        const authors = uniqStrings(authorNames.length ? authorNames : fallbackNames);
        const artists = uniqStrings(artistNames);
        return { authors, artists };
    }

    function pickAniListRank(rankings) {
        const ordered = toArray(rankings)
            .filter(item => Number.isFinite(Number(item?.rank)))
            .sort((a, b) => Number(a.rank) - Number(b.rank));
        if (ordered.length === 0) return "";
        return ordered[0].rank;
    }

    function getAniListMeta(media) {
        const staffEdges = toArray(media?.staff?.edges);
        const people = getAniListPeople(staffEdges);
        const studios = uniqStrings(
            toArray(media?.studios?.nodes).map(studio => studio?.name)
        );
        const title = media?.title?.english || media?.title?.userPreferred || media?.title?.romaji || "No Title";
        const mediaType = formatStatus(media?.type) || "Media";
        const startDate = formatDateParts(media?.startDate);
        const endDate = formatDateParts(media?.endDate);

        const tags = limitList(
            toArray(media?.tags)
                .filter(tag => !tag?.isMediaSpoiler)
                .sort((a, b) => (Number(b?.rank) || 0) - (Number(a?.rank) || 0))
                .map(tag => tag?.name),
            24
        );

        const synonyms = limitList([
            media?.title?.native,
            ...toArray(media?.synonyms)
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
            description: cleanText(media?.description, 240),
            status: formatStatus(media?.status),
            score: media?.averageScore ?? media?.meanScore ?? "N/A",
            rank: pickAniListRank(media?.rankings),
            popularity: media?.popularity ?? "",
            members: "",
            favorites: media?.favourites ?? "",
            chapters: media?.chapters ?? "",
            volumes: media?.volumes ?? "",
            episodes: media?.episodes ?? "",
            duration: media?.duration ? `${media.duration} min` : "",
            genres: uniqStrings(toArray(media?.genres)),
            tags,
            year: media?.startDate?.year || media?.seasonYear || "",
            season: formatSeason(media?.season, media?.seasonYear),
            format: formatStatus(media?.format),
            sourceMaterial: formatStatus(media?.source),
            countryOfOrigin: String(media?.countryOfOrigin || "").toUpperCase(),
            contentRating: media?.isAdult ? "Adult" : "",
            startDate,
            endDate,
            url: siteUrl
        };
    }

    function normalizeDisplayArgs(arg1, arg2, arg3, arg4, arg5) {
        if (arg1 && typeof arg1 === "object" && (arg1.mangadex || arg1.jikanManga || arg1.jikanAnime || arg1.anilistManga || arg1.anilistAnime)) {
            return {
                sources: arg1,
                resultsDiv: arg2,
                onSelect: arg3
            };
        }
        return {
            // Backward-compatible argument form: (mangadex, jikanManga, anilistManga, resultsDiv, onSelect)
            sources: {
                mangadex: arg1,
                jikanManga: arg2,
                anilistManga: arg3
            },
            resultsDiv: arg4,
            onSelect: arg5
        };
    }

    function displayResults(arg1, arg2, arg3, arg4, arg5) {
        const normalized = normalizeDisplayArgs(arg1, arg2, arg3, arg4, arg5);
        const sources = normalized.sources || {};
        const resultsDiv = normalized.resultsDiv;
        const onSelect = normalized.onSelect;
        if (!resultsDiv) return;

        resultsDiv.innerHTML = "";
        resultsDiv.classList.add("api-search-results-grid");

        toArray(sources.mangadex?.data).forEach(item => {
            createMangaCard(getMangaDexMeta(item), resultsDiv, onSelect);
        });

        toArray(sources.jikanManga?.data).forEach(item => {
            createMangaCard(getJikanMeta(item, "Manga"), resultsDiv, onSelect);
        });

        toArray(sources.jikanAnime?.data).forEach(item => {
            createMangaCard(getJikanMeta(item, "Anime"), resultsDiv, onSelect);
        });

        toArray(sources.anilistManga?.data?.Page?.media).forEach(item => {
            createMangaCard(getAniListMeta(item), resultsDiv, onSelect);
        });

        toArray(sources.anilistAnime?.data?.Page?.media).forEach(item => {
            createMangaCard(getAniListMeta(item), resultsDiv, onSelect);
        });

        if (resultsDiv.children.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:10px; opacity:0.7;">No results found from API providers.</div>';
        }
    }

    function createMangaCard(data, resultsDiv, onSelect) {
        if (window.EveOS?.API?.CardUI?.createMangaCard) {
            window.EveOS.API.CardUI.createMangaCard(data, resultsDiv, onSelect);
        } else {
            console.error("CardUI module not loaded");
        }
    }

    window.EveOS.API.Display = {
        displayResults,
        createMangaCard
    };
})();
