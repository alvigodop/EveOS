window.EveLibrary = window.EveLibrary || {};

(function () {
    const PROVIDERS = ["anilist", "myanimelist", "mangadex"];
    const CONFIDENCE_WEIGHTS = {
        coverage: 0.22,
        agreement: 0.18,
        metadata: 0.2,
        apiSignals: 0.15,
        status: 0.05,
        insight: 0.2
    };
    const SIGNAL_COUNT_CAPS = {
        popularity: 1000000,
        members: 500000,
        favorites: 100000
    };
    const SIGNAL_RANK_CAP = 50000;

    const DEFAULTS = {
        activeScale: "hybrid",
        personalWeight: 0.5,
        missingScoreMode: "ignore_missing",
        enabledProviders: {
            anilist: true,
            myanimelist: true,
            mangadex: true
        },
        providerWeights: {
            anilist: 1,
            myanimelist: 1,
            mangadex: 1
        }
    };

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function round(value, decimals = 2) {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        const p = 10 ** decimals;
        return Math.round(n * p) / p;
    }

    function toNumberOrNull(value) {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "string" && value.trim() === "") return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function createEmptyApiRatings() {
        return {
            anilist: null,
            myanimelist: null,
            mangadex: null
        };
    }

    function sourceNameToProvider(sourceName) {
        const raw = String(sourceName || "").trim().toLowerCase();
        if (!raw) return null;
        if (raw.includes("anilist")) return "anilist";
        if (raw.includes("myanimelist") || raw === "mal") return "myanimelist";
        if (raw.includes("mangadex")) return "mangadex";
        return null;
    }

    function normalizeProviderScore(provider, rawScore) {
        const n = toNumberOrNull(rawScore);
        if (n === null) return null;

        let value = n;
        if (provider === "anilist") {
            // AniList is usually 0-100
            if (value > 10) value = value / 10;
        }
        // Treat zero/negative as "missing" to avoid false confidence from placeholder values.
        if (value <= 0) return null;
        return round(clamp(value, 0, 10), 2);
    }

    function createEmptySignalProvider() {
        return {
            popularity: null,
            members: null,
            favorites: null,
            rank: null,
            status: ""
        };
    }

    function createEmptySourceSignals() {
        return {
            anilist: createEmptySignalProvider(),
            myanimelist: createEmptySignalProvider(),
            mangadex: createEmptySignalProvider()
        };
    }

    function normalizeCountSignal(value) {
        const n = toNumberOrNull(value);
        if (n === null || n <= 0) return null;
        return Math.round(n);
    }

    function normalizeRankSignal(value) {
        const n = toNumberOrNull(value);
        if (n === null || n <= 0) return null;
        return Math.round(n);
    }

    function normalizeSourceStatus(value) {
        const raw = String(value || "").trim().toLowerCase();
        if (!raw) return "";

        const compact = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
        if (!compact) return "";

        if (/hiatus|paused|suspend/.test(compact)) return "Hiatus";
        if (/cancel|canceled|discontinu|dropped/.test(compact)) return "Cancelled";
        if (/not yet|upcoming|tba|unreleased|to be announced/.test(compact)) return "Upcoming";
        if (/ongoing|publishing|releasing|airing|currently/.test(compact)) return "Ongoing";
        if (/complete|completed|finished|ended/.test(compact)) return "Completed";
        return "";
    }

    function sanitizeSourceSignals(input) {
        const source = input && typeof input === "object" ? input : {};
        const result = createEmptySourceSignals();
        PROVIDERS.forEach(provider => {
            const row = source[provider] && typeof source[provider] === "object"
                ? source[provider]
                : {};
            result[provider] = {
                popularity: normalizeCountSignal(row.popularity),
                members: normalizeCountSignal(row.members ?? row.followers ?? row.follows),
                favorites: normalizeCountSignal(row.favorites),
                rank: normalizeRankSignal(row.rank),
                status: normalizeSourceStatus(row.status ?? row.sourceStatus)
            };
        });
        return result;
    }

    function mergeSourceSignals(existingSignals, incomingSignals) {
        const existing = sanitizeSourceSignals(existingSignals);
        const incoming = sanitizeSourceSignals(incomingSignals);
        const merged = createEmptySourceSignals();
        PROVIDERS.forEach(provider => {
            merged[provider] = {
                popularity: incoming[provider].popularity !== null
                    ? incoming[provider].popularity
                    : existing[provider].popularity,
                members: incoming[provider].members !== null
                    ? incoming[provider].members
                    : existing[provider].members,
                favorites: incoming[provider].favorites !== null
                    ? incoming[provider].favorites
                    : existing[provider].favorites,
                rank: incoming[provider].rank !== null
                    ? incoming[provider].rank
                    : existing[provider].rank,
                status: incoming[provider].status || existing[provider].status || ""
            };
        });
        return merged;
    }

    function averageNumbers(values) {
        const nums = (Array.isArray(values) ? values : [])
            .map(value => Number(value))
            .filter(value => Number.isFinite(value));
        if (!nums.length) return null;
        const sum = nums.reduce((acc, value) => acc + value, 0);
        return sum / nums.length;
    }

    function pickDominantStatus(statuses) {
        const normalized = (Array.isArray(statuses) ? statuses : [])
            .map(normalizeSourceStatus)
            .filter(Boolean);
        if (!normalized.length) return "";
        const counts = {};
        normalized.forEach(status => {
            counts[status] = (counts[status] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || "";
    }

    function extractSourceSignalsFromSources(sources) {
        const buckets = {
            anilist: { popularity: [], members: [], favorites: [], rank: [], statuses: [] },
            myanimelist: { popularity: [], members: [], favorites: [], rank: [], statuses: [] },
            mangadex: { popularity: [], members: [], favorites: [], rank: [], statuses: [] }
        };

        (Array.isArray(sources) ? sources : []).forEach(source => {
            const provider = sourceNameToProvider(source?.source);
            if (!provider) return;
            const bucket = buckets[provider];
            if (!bucket) return;

            let rawPopularity = source?.popularity;
            if (provider === "mangadex" && toNumberOrNull(rawPopularity) === null) {
                rawPopularity = source?.members ?? source?.followers ?? source?.follows;
            }
            const popularity = normalizeCountSignal(rawPopularity);
            const members = normalizeCountSignal(source?.members ?? source?.followers ?? source?.follows);
            const favorites = normalizeCountSignal(source?.favorites);
            const rank = normalizeRankSignal(source?.rank);
            const status = normalizeSourceStatus(source?.status ?? source?.sourceStatus);

            if (popularity !== null) bucket.popularity.push(popularity);
            if (members !== null) bucket.members.push(members);
            if (favorites !== null) bucket.favorites.push(favorites);
            if (rank !== null) bucket.rank.push(rank);
            if (status) bucket.statuses.push(status);
        });

        const raw = createEmptySourceSignals();
        PROVIDERS.forEach(provider => {
            raw[provider] = {
                popularity: averageNumbers(buckets[provider].popularity),
                members: averageNumbers(buckets[provider].members),
                favorites: averageNumbers(buckets[provider].favorites),
                rank: averageNumbers(buckets[provider].rank),
                status: pickDominantStatus(buckets[provider].statuses)
            };
        });
        return sanitizeSourceSignals(raw);
    }

    function sanitizeApiRatings(input) {
        const base = createEmptyApiRatings();
        const source = input && typeof input === "object" ? input : {};
        PROVIDERS.forEach(provider => {
            base[provider] = normalizeProviderScore(provider, source[provider]);
        });
        return base;
    }

    function mergeApiRatings(existingRatings, incomingRatings) {
        const existing = sanitizeApiRatings(existingRatings);
        const incoming = sanitizeApiRatings(incomingRatings);
        const merged = createEmptyApiRatings();
        PROVIDERS.forEach(provider => {
            merged[provider] = incoming[provider] !== null ? incoming[provider] : existing[provider];
        });
        return merged;
    }

    function extractApiRatingsFromSources(sources) {
        const map = {
            anilist: [],
            myanimelist: [],
            mangadex: []
        };
        (Array.isArray(sources) ? sources : []).forEach(source => {
            const provider = sourceNameToProvider(source?.source);
            if (!provider) return;
            const normalizedScore = normalizeProviderScore(provider, source?.score);
            if (normalizedScore === null) return;
            map[provider].push(normalizedScore);
        });

        const result = createEmptyApiRatings();
        PROVIDERS.forEach(provider => {
            const scores = map[provider];
            if (!scores.length) return;
            const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
            result[provider] = round(avg, 2);
        });
        return result;
    }

    window.EveLibrary.RatingsEngineFoundation = {
        PROVIDERS,
        CONFIDENCE_WEIGHTS,
        SIGNAL_COUNT_CAPS,
        SIGNAL_RANK_CAP,
        DEFAULTS,
        clamp,
        round,
        toNumberOrNull,
        createEmptyApiRatings,
        sourceNameToProvider,
        normalizeProviderScore,
        createEmptySourceSignals,
        normalizeSourceStatus,
        sanitizeSourceSignals,
        mergeSourceSignals,
        extractSourceSignalsFromSources,
        sanitizeApiRatings,
        mergeApiRatings,
        extractApiRatingsFromSources
    };
})();
