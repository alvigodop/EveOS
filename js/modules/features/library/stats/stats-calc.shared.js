/**
 * Statistics Calculator Shared Utilities
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Ratings = window.EveLibrary.Ratings;
    const STATUS_BUCKETS = ['Completed', 'In Progress', 'Planned', 'Paused', 'Dropped', 'Other'];
    const DEMOGRAPHIC_NAMES = ['Shonen', 'Seinen', 'Shojo', 'Josei'];

    function parseUniqueCsvList(value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function toList(value) {
        if (Array.isArray(value)) {
            const seen = new Set();
            return value
                .map(item => String(item || '').trim())
                .filter(Boolean)
                .filter(item => {
                    const key = item.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        }
        return parseUniqueCsvList(value);
    }

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function round(value, digits = 2) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        const p = 10 ** digits;
        return Math.round(n * p) / p;
    }

    function normalizeStatus(rawStatus) {
        const value = String(rawStatus || '').trim().toLowerCase();
        if (!value) return 'Other';

        if (/complete|finished|done/.test(value)) return 'Completed';
        if (/plan|wishlist|queue|backlog|to read|to watch/.test(value)) return 'Planned';
        if (/pause|hiatus|hold/.test(value)) return 'Paused';
        if (/drop|abandon|cancel/.test(value)) return 'Dropped';
        if (/read|watch|progress|ongoing|current/.test(value)) return 'In Progress';
        return 'Other';
    }

    function ensureDerivedRatings(entry) {
        if (Ratings?.applyDerivedRatings) {
            Ratings.applyDerivedRatings(entry);
        }
        return entry?.derivedRatings || {};
    }

    function getProgressUnits(entry) {
        const chapter = toNumber(entry?.chapter);
        if (chapter !== null && chapter > 0) return chapter;

        const graphicChapter = toNumber(entry?.graphicChapter);
        if (graphicChapter !== null && graphicChapter > 0) return graphicChapter;

        const novelChapter = toNumber(entry?.novelChapter);
        if (novelChapter !== null && novelChapter > 0) return novelChapter;

        const episode = toNumber(entry?.episode);
        if (episode !== null && episode > 0) return episode;

        return 0;
    }

    function isFilmLikeEntry(entry) {
        const mediaTypes = Array.isArray(entry?.mediaTypes)
            ? entry.mediaTypes.map(item => String(item || '').toLowerCase())
            : [];
        if (mediaTypes.includes('films')) return true;

        const explicitEpisode = toNumber(entry?.episode);
        const explicitChapter = toNumber(entry?.chapter)
            ?? toNumber(entry?.graphicChapter)
            ?? toNumber(entry?.novelChapter);
        if (explicitEpisode !== null && explicitEpisode > 0 && (explicitChapter === null || explicitChapter <= 0)) {
            return true;
        }
        return false;
    }

    function extractTotalUnits(entry) {
        const chapterCandidates = [];
        const episodeCandidates = [];
        const pushPositive = (bucket, value) => {
            const n = toNumber(value);
            if (n === null || n <= 0) return;
            bucket.push(Math.floor(n));
        };

        [
            entry?.totalChapters,
            entry?.chapterTotal,
            entry?.chapters,
            entry?.lastChapter,
            entry?.maxChapter
        ].forEach(value => pushPositive(chapterCandidates, value));

        [
            entry?.totalEpisodes,
            entry?.episodeTotal,
            entry?.episodes,
            entry?.lastEpisode,
            entry?.maxEpisode
        ].forEach(value => pushPositive(episodeCandidates, value));

        const sources = Array.isArray(entry?.sources) ? entry.sources : [];
        sources.forEach(source => {
            pushPositive(chapterCandidates, source?.chapters);
            pushPositive(chapterCandidates, source?.lastChapter);
            pushPositive(episodeCandidates, source?.episodes);
            pushPositive(episodeCandidates, source?.lastEpisode);
        });

        toList(entry?.tags).forEach(tag => {
            const chapterMatch = String(tag).match(/chapters?\s*[:/=-]?\s*(\d+)/i);
            const episodeMatch = String(tag).match(/episodes?\s*[:/=-]?\s*(\d+)/i);
            if (chapterMatch) pushPositive(chapterCandidates, chapterMatch[1]);
            if (episodeMatch) pushPositive(episodeCandidates, episodeMatch[1]);
        });

        const useEpisodes = isFilmLikeEntry(entry);
        const preferred = useEpisodes ? episodeCandidates : chapterCandidates;
        const fallback = useEpisodes ? chapterCandidates : episodeCandidates;
        const all = preferred.length ? preferred : fallback;
        if (!all.length) return null;
        return Math.max(...all);
    }

    function extractYearFromText(value) {
        const match = String(value || '').match(/(?:19|20)\d{2}/);
        if (!match) return null;
        const year = toNumber(match[0]);
        if (year === null) return null;
        return clamp(Math.floor(year), 1900, 2100);
    }

    function extractPublicationYear(entry) {
        const direct = [
            entry?.publicationYear,
            entry?.year,
            entry?.releaseYear
        ];
        for (const candidate of direct) {
            const year = toNumber(candidate);
            if (year !== null && year >= 1900 && year <= 2100) return Math.floor(year);
        }

        const startDate = String(entry?.startDate || '').trim();
        if (startDate) {
            const parsed = new Date(startDate);
            if (!Number.isNaN(parsed.getTime())) {
                const year = parsed.getUTCFullYear();
                if (year >= 1900 && year <= 2100) return year;
            }
            const fromText = extractYearFromText(startDate);
            if (fromText) return fromText;
        }

        const tags = toList(entry?.tags);
        for (const tag of tags) {
            const publicationMatch = tag.match(/publication\s*:\s*((?:19|20)\d{2})/i);
            if (publicationMatch) {
                const year = toNumber(publicationMatch[1]);
                if (year !== null) return Math.floor(year);
            }
        }

        return null;
    }

    function extractCountryCode(entry) {
        const direct = String(entry?.countryOfOrigin || entry?.originCountry || entry?.country || '').trim().toUpperCase();
        if (direct && /^[A-Z]{2,3}$/.test(direct)) return direct;

        const tags = toList(entry?.tags);
        for (const tag of tags) {
            const match = tag.match(/original\s*:\s*([A-Z]{2,3})/i);
            if (match) return String(match[1] || '').toUpperCase();
        }

        const language = String(entry?.language || '').trim().toLowerCase();
        if (/japanese|\bja\b/.test(language)) return 'JA';
        if (/korean|\bko\b/.test(language)) return 'KO';
        if (/chinese|\bzh\b/.test(language)) return 'ZH';

        return '';
    }

    function mapCountryToOriginLabel(code) {
        const normalized = String(code || '').toUpperCase();
        if (normalized === 'JA' || normalized === 'JP') return 'Manga (Japan)';
        if (normalized === 'KO' || normalized === 'KR') return 'Manhwa (Korea)';
        if (['ZH', 'CN', 'TW', 'HK'].includes(normalized)) return 'Manhua (China)';
        if (normalized) return `Other (${normalized})`;
        return 'Unknown';
    }

    function extractTypeOriginLabel(entry) {
        const typeText = [
            entry?.type,
            entry?.format,
            entry?.mediaType,
            entry?.sourceType
        ]
            .map(value => String(value || '').trim().toLowerCase())
            .filter(Boolean)
            .join(' ');

        if (!typeText) return '';
        if (typeText.includes('manhwa')) return 'Manhwa (Korea)';
        if (typeText.includes('manhua')) return 'Manhua (China)';
        if (typeText.includes('manga')) return 'Manga (Japan)';
        return '';
    }

    function extractOriginLabel(entry) {
        const typeLabel = extractTypeOriginLabel(entry);
        if (typeLabel) return typeLabel;
        return mapCountryToOriginLabel(extractCountryCode(entry));
    }

    function calcGenreCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            parseUniqueCsvList(entry?.genre).forEach(genre => {
                counts[genre] = (counts[genre] || 0) + 1;
            });
        });
        return counts;
    }

    function calcTagCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const sourceTags = Array.isArray(entry?.tags)
                ? entry.tags
                : parseUniqueCsvList(entry?.tags);
            sourceTags.forEach(tagValue => {
                parseUniqueCsvList(tagValue).forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            });
        });
        return counts;
    }

    function calcOriginCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const label = extractOriginLabel(entry);
            counts[label] = (counts[label] || 0) + 1;
        });
        return counts;
    }

    function calcAvgRating(entries) {
        let sum = 0;
        let count = 0;
        entries.forEach(entry => {
            const rating = toNumber(entry?.rating);
            if (!rating || rating <= 0) return;
            sum += rating;
            count += 1;
        });
        return count > 0 ? sum / count : 0;
    }

    function calcStatusCounts(entries) {
        const counts = {
            Completed: 0,
            'In Progress': 0,
            Planned: 0,
            Paused: 0,
            Dropped: 0,
            Other: 0
        };

        entries.forEach(entry => {
            const bucket = normalizeStatus(entry?.status);
            counts[bucket] = (counts[bucket] || 0) + 1;
        });
        return counts;
    }

    function calcProgress(entries) {
        const counts = calcStatusCounts(entries);
        return {
            labels: STATUS_BUCKETS,
            data: STATUS_BUCKETS.map(label => counts[label] || 0)
        };
    }

    window.EveLibrary.StatsCalcShared = {
        STATUS_BUCKETS,
        DEMOGRAPHIC_NAMES,
        parseUniqueCsvList,
        toList,
        toNumber,
        clamp,
        round,
        normalizeStatus,
        ensureDerivedRatings,
        getProgressUnits,
        isFilmLikeEntry,
        extractTotalUnits,
        extractYearFromText,
        extractPublicationYear,
        extractCountryCode,
        mapCountryToOriginLabel,
        extractTypeOriginLabel,
        extractOriginLabel,
        calcGenreCounts,
        calcTagCounts,
        calcOriginCounts,
        calcAvgRating,
        calcStatusCounts,
        calcProgress
    };
})();
