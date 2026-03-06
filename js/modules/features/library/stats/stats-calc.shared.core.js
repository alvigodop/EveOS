/**
 * Statistics Calculator Shared - Core Utilities
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsCalcSharedModules = window.EveLibrary.StatsCalcSharedModules || {};

(function () {
    window.EveLibrary.StatsCalcSharedModules.createCore = function createCore() {
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

        function round(value, digits) {
            const n = Number(value);
            const places = Number.isFinite(Number(digits)) ? Number(digits) : 2;
            if (!Number.isFinite(n)) return 0;
            const power = 10 ** places;
            return Math.round(n * power) / power;
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
            const Ratings = window.EveLibrary?.Ratings;
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
            return explicitEpisode !== null
                && explicitEpisode > 0
                && (explicitChapter === null || explicitChapter <= 0);
        }

        function extractTotalUnits(entry) {
            const chapterCandidates = [];
            const episodeCandidates = [];
            const pushPositive = function (bucket, value) {
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

        return {
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
            extractTotalUnits
        };
    };
})();
