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

    function cleanText(raw, maxLength = 220) {
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
        if (!source) return "Unknown";
        return source
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    function getMangaDexSynonyms(attributes) {
        return uniqStrings(
            toArray(attributes?.altTitles).flatMap(item => Object.values(item || {}))
        );
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

        const genreTags = [];
        const extraTags = [];
        tags.forEach(tag => {
            const tagName = pickLocalizedText(tag?.attributes?.name);
            if (!tagName) return;
            const group = String(tag?.attributes?.group || "").toLowerCase();
            if (group === "genre") {
                genreTags.push(tagName);
            } else {
                extraTags.push(tagName);
            }
        });

        const title = pickLocalizedText(attributes?.title) || "No Title";
        const synonyms = getMangaDexSynonyms(attributes).filter(
            synonym => synonym.toLowerCase() !== title.toLowerCase()
        );

        return {
            source: "MangaDex",
            title,
            coverUrl,
            author: authors.join(", ") || artists.join(", ") || "Unknown Author",
            artist: artists.join(", "),
            synonyms,
            description: cleanText(pickLocalizedText(attributes?.description), 220),
            status: formatStatus(attributes?.status),
            score: "N/A",
            chapters: attributes?.lastChapter || "?",
            volumes: attributes?.lastVolume || "?",
            genres: uniqStrings(genreTags),
            tags: uniqStrings(extraTags),
            year: attributes?.year || "",
            format: attributes?.publicationDemographic || "",
            url: `https://mangadex.org/title/${manga.id}`
        };
    }

    function getJikanMeta(manga) {
        const genres = uniqStrings(toArray(manga?.genres).map(genre => genre?.name));
        const tags = uniqStrings([
            ...toArray(manga?.themes).map(theme => theme?.name),
            ...toArray(manga?.demographics).map(group => group?.name),
            ...toArray(manga?.explicit_genres).map(genre => genre?.name)
        ]);

        const authorPeople = toArray(manga?.authors);
        const authors = uniqStrings(
            authorPeople
                .filter(person => {
                    const type = String(person?.type || "").toLowerCase();
                    return !type || type.includes("story");
                })
                .map(person => person?.name)
        );
        const artists = uniqStrings(
            authorPeople
                .filter(person => String(person?.type || "").toLowerCase().includes("art"))
                .map(person => person?.name)
        );

        const title = manga?.title || "No Title";
        const synonyms = uniqStrings([
            manga?.title_english,
            manga?.title_japanese,
            ...toArray(manga?.title_synonyms)
        ]).filter(synonym => synonym.toLowerCase() !== title.toLowerCase());

        return {
            source: "MyAnimeList",
            title,
            coverUrl: manga?.images?.jpg?.image_url || "https://via.placeholder.com/120x180?text=No+Cover",
            author: authors.join(", ") || uniqStrings(authorPeople.map(person => person?.name)).join(", ") || "Unknown Author",
            artist: artists.join(", "),
            synonyms,
            description: cleanText(manga?.synopsis, 220),
            status: formatStatus(manga?.status),
            score: manga?.score ?? "N/A",
            chapters: manga?.chapters ?? "?",
            volumes: manga?.volumes ?? "?",
            genres,
            tags,
            year: manga?.published?.from ? new Date(manga.published.from).getFullYear() : "",
            format: manga?.type || "",
            url: manga?.url || ""
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
                term.includes("author")
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

    function getAniListMeta(manga) {
        const staffEdges = toArray(manga?.staff?.edges);
        const people = getAniListPeople(staffEdges);
        const title = manga?.title?.english || manga?.title?.romaji || "No Title";
        const synonyms = uniqStrings(toArray(manga?.synonyms)).filter(
            synonym => synonym.toLowerCase() !== title.toLowerCase()
        );

        return {
            source: "AniList",
            title,
            coverUrl: manga?.coverImage?.large || "https://via.placeholder.com/120x180?text=No+Cover",
            author: people.authors.join(", ") || people.artists.join(", ") || "Unknown Author",
            artist: people.artists.join(", "),
            synonyms,
            description: cleanText(manga?.description, 220),
            status: formatStatus(manga?.status),
            score: manga?.averageScore ?? "N/A",
            chapters: manga?.chapters ?? "?",
            volumes: manga?.volumes ?? "?",
            genres: uniqStrings(toArray(manga?.genres)),
            tags: uniqStrings(toArray(manga?.tags).map(tag => tag?.name)),
            year: manga?.startDate?.year || "",
            format: manga?.format || "",
            url: `https://anilist.co/manga/${manga.id}`
        };
    }

    function displayResults(mangadexData, jikanData, anilistData, resultsDiv, onSelect) {
        resultsDiv.innerHTML = "";
        resultsDiv.classList.add("api-search-results-grid");

        toArray(mangadexData?.data).forEach(item => {
            createMangaCard(getMangaDexMeta(item), resultsDiv, onSelect);
        });

        toArray(jikanData?.data).forEach(item => {
            createMangaCard(getJikanMeta(item), resultsDiv, onSelect);
        });

        toArray(anilistData?.data?.Page?.media).forEach(item => {
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
