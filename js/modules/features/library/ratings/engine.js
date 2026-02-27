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

    function normalizePersonalRatingTo10(rawRating) {
        if (rawRating === null || rawRating === undefined || String(rawRating).trim() === "") {
            // Empty personal rating is treated as baseline 0 so API ratings do not fully dominate unified score.
            return 0;
        }
        const n = toNumberOrNull(rawRating);
        if (n === null) return 0;
        // Existing personal ratings are stored as 1-5 stars.
        if (n <= 5) return round(clamp(n * 2, 0, 10), 2);
        return round(clamp(n, 0, 10), 2);
    }

    function getSettings(configRef) {
        const source = configRef || (typeof config !== "undefined" ? config : window.config) || {};
        const current = source.ratingSettings && typeof source.ratingSettings === "object"
            ? source.ratingSettings
            : {};

        const enabledProviders = {
            anilist: current.enabledProviders?.anilist !== false,
            myanimelist: current.enabledProviders?.myanimelist !== false,
            mangadex: current.enabledProviders?.mangadex !== false
        };

        const providerWeights = {
            anilist: clamp(current.providerWeights?.anilist ?? DEFAULTS.providerWeights.anilist, 0, 100),
            myanimelist: clamp(current.providerWeights?.myanimelist ?? DEFAULTS.providerWeights.myanimelist, 0, 100),
            mangadex: clamp(current.providerWeights?.mangadex ?? DEFAULTS.providerWeights.mangadex, 0, 100)
        };

        return {
            activeScale: String(current.activeScale || DEFAULTS.activeScale),
            personalWeight: clamp(current.personalWeight ?? DEFAULTS.personalWeight, 0, 1),
            missingScoreMode: String(current.missingScoreMode || DEFAULTS.missingScoreMode),
            enabledProviders,
            providerWeights
        };
    }

    function ensureConfigDefaults(configRef) {
        const target = configRef || (typeof config !== "undefined" ? config : window.config);
        if (!target || typeof target !== "object") return DEFAULTS;

        const normalized = getSettings(target);
        target.ratingSettings = {
            activeScale: normalized.activeScale,
            personalWeight: normalized.personalWeight,
            missingScoreMode: normalized.missingScoreMode,
            enabledProviders: { ...normalized.enabledProviders },
            providerWeights: { ...normalized.providerWeights }
        };
        return target.ratingSettings;
    }

    function computeApiAverage(apiRatings, settings) {
        const values = [];
        PROVIDERS.forEach(provider => {
            if (!settings.enabledProviders[provider]) return;
            const value = apiRatings[provider];
            if (value === null) return;
            values.push(value);
        });
        if (!values.length) return null;
        const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
        return round(avg, 2);
    }

    function computeApiWeighted(apiRatings, settings) {
        let weightedTotal = 0;
        let weightSum = 0;
        PROVIDERS.forEach(provider => {
            if (!settings.enabledProviders[provider]) return;
            const value = apiRatings[provider];
            if (value === null) return;
            const weight = settings.providerWeights[provider];
            if (!Number.isFinite(weight) || weight <= 0) return;
            weightedTotal += value * weight;
            weightSum += weight;
        });
        if (weightSum <= 0) return null;
        return round(weightedTotal / weightSum, 2);
    }

    function pickActiveScaleValue(scale, values) {
        switch (String(scale || "")) {
            case "personal":
                return values.personal10;
            case "api_average":
                return values.apiAverage10;
            case "api_weighted":
                return values.apiWeighted10;
            case "confidence":
                return values.confidence;
            case "hybrid":
            default:
                return values.hybrid10;
        }
    }

    function getEnabledProviders(settings) {
        return PROVIDERS.filter(provider => settings.enabledProviders[provider]);
    }

    function normalizeCountToScore(value, cap) {
        const n = toNumberOrNull(value);
        if (n === null || n <= 0) return null;
        const safeCap = Number.isFinite(cap) && cap > 1 ? cap : 1000000;
        const ratio = Math.log10(n + 1) / Math.log10(safeCap + 1);
        return clamp(ratio, 0, 1);
    }

    function normalizeRankToScore(value, cap) {
        const n = toNumberOrNull(value);
        if (n === null || n <= 0) return null;
        const safeCap = Number.isFinite(cap) && cap > 1 ? cap : SIGNAL_RANK_CAP;
        const ratio = Math.log10(n + 1) / Math.log10(safeCap + 1);
        return clamp(1 - ratio, 0, 1);
    }

    function statusQualityScore(status) {
        const normalized = normalizeSourceStatus(status);
        if (!normalized) return null;
        switch (normalized) {
            case "Completed":
                return 1;
            case "Ongoing":
                return 0.95;
            case "Hiatus":
                return 0.8;
            case "Cancelled":
                return 0.7;
            case "Upcoming":
                return 0.65;
            default:
                return 0.75;
        }
    }

    function computeApiCoverageScore(apiRatings, settings) {
        const enabled = getEnabledProviders(settings);
        if (!enabled.length) return 0;
        const present = enabled.filter(provider => apiRatings[provider] !== null).length;
        return clamp(present / enabled.length, 0, 1);
    }

    function computeApiAgreementScore(apiRatings, settings) {
        const enabled = getEnabledProviders(settings);
        const values = enabled
            .map(provider => apiRatings[provider])
            .filter(value => value !== null)
            .map(value => Number(value));

        if (!values.length) return 0;
        if (values.length === 1) return 0.6;

        const max = Math.max(...values);
        const min = Math.min(...values);
        const spread = max - min;
        // A spread around 4 points on a 10-point scale is treated as very weak agreement.
        return clamp(1 - (spread / 4), 0, 1);
    }

    function computeMetadataCompletenessScore(entryLike) {
        const entry = entryLike && typeof entryLike === "object" ? entryLike : {};
        const hasPeople = !!String(entry.author || "").trim()
            || (Array.isArray(entry.authorAltNames) && entry.authorAltNames.length > 0)
            || !!String(entry.artist || "").trim();
        const hasGenres = !!String(entry.genre || "").trim();
        const hasTags = (Array.isArray(entry.tags) ? entry.tags.length : String(entry.tags || "").trim().length > 0);
        const hasSummary = !!String(entry.summary || "").trim();
        const hasSourceUrl = !!String(entry.sourceUrl || "").trim();
        const hasImage = !!String(entry.image || entry.imageUrl || "").trim();
        const hasLanguage = !!String(entry.language || "").trim();
        const hasSourceStatus = !!normalizeSourceStatus(entry.sourceStatus);

        const checks = [
            hasPeople,
            hasGenres,
            hasTags,
            hasSummary,
            hasSourceUrl,
            hasImage,
            hasLanguage,
            hasSourceStatus
        ];
        const passed = checks.filter(Boolean).length;
        return checks.length ? clamp(passed / checks.length, 0, 1) : 0;
    }

    function computeProviderSignalScore(provider, signal) {
        if (!signal || typeof signal !== "object") return null;

        const popularityScore = provider === "myanimelist"
            ? normalizeRankToScore(signal.popularity, SIGNAL_RANK_CAP)
            : normalizeCountToScore(signal.popularity, SIGNAL_COUNT_CAPS.popularity);
        const membersScore = normalizeCountToScore(signal.members, SIGNAL_COUNT_CAPS.members);
        const favoritesScore = normalizeCountToScore(signal.favorites, SIGNAL_COUNT_CAPS.favorites);
        const rankScore = normalizeRankToScore(signal.rank, SIGNAL_RANK_CAP);
        const statusScore = statusQualityScore(signal.status);

        const weighted = [
            { value: popularityScore, weight: 0.3 },
            { value: membersScore, weight: 0.3 },
            { value: favoritesScore, weight: 0.2 },
            { value: rankScore, weight: 0.15 },
            { value: statusScore, weight: 0.05 }
        ].filter(item => item.value !== null);

        if (!weighted.length) return null;
        const sum = weighted.reduce((acc, item) => acc + (item.value * item.weight), 0);
        const weightTotal = weighted.reduce((acc, item) => acc + item.weight, 0);
        if (weightTotal <= 0) return null;
        return clamp(sum / weightTotal, 0, 1);
    }

    function computeApiSignalStrengthScore(sourceSignals, settings) {
        const enabled = getEnabledProviders(settings);
        if (!enabled.length) return 0;
        const scores = enabled
            .map(provider => computeProviderSignalScore(provider, sourceSignals[provider]))
            .filter(score => score !== null);
        if (!scores.length) return 0;
        const average = scores.reduce((acc, value) => acc + value, 0) / scores.length;
        const coverage = scores.length / enabled.length;
        return clamp((average * 0.75) + (coverage * 0.25), 0, 1);
    }

    function computeStatusConsistencyScore(sourceSignals, settings, sourceStatusFallback) {
        const enabled = getEnabledProviders(settings);
        const statuses = enabled
            .map(provider => normalizeSourceStatus(sourceSignals[provider]?.status))
            .filter(Boolean);

        if (!statuses.length) {
            return normalizeSourceStatus(sourceStatusFallback) ? 0.55 : 0.35;
        }
        if (statuses.length === 1) return 0.75;

        const counts = {};
        statuses.forEach(status => {
            counts[status] = (counts[status] || 0) + 1;
        });
        const top = Math.max(...Object.values(counts));
        return clamp(0.4 + (0.6 * (top / statuses.length)), 0, 1);
    }

    function computeConfidence(entryLike, settings, apiRatings, sourceSignals, hybrid10) {
        const coverage = computeApiCoverageScore(apiRatings, settings);
        const agreement = computeApiAgreementScore(apiRatings, settings);
        const metadata = computeMetadataCompletenessScore(entryLike);
        const apiSignals = computeApiSignalStrengthScore(sourceSignals, settings);
        const status = computeStatusConsistencyScore(sourceSignals, settings, entryLike?.sourceStatus);
        // Insight score uses the existing unified rating pipeline.
        const insight = hybrid10 === null ? 0 : clamp(Number(hybrid10) / 10, 0, 1);

        const confidenceRaw = (
            (coverage * CONFIDENCE_WEIGHTS.coverage)
            + (agreement * CONFIDENCE_WEIGHTS.agreement)
            + (metadata * CONFIDENCE_WEIGHTS.metadata)
            + (apiSignals * CONFIDENCE_WEIGHTS.apiSignals)
            + (status * CONFIDENCE_WEIGHTS.status)
            + (insight * CONFIDENCE_WEIGHTS.insight)
        );
        const confidence = round(clamp(confidenceRaw, 0, 1), 2);

        return {
            value: confidence,
            breakdown: {
                coverage: round(coverage, 3),
                agreement: round(agreement, 3),
                metadata: round(metadata, 3),
                apiSignals: round(apiSignals, 3),
                status: round(status, 3),
                insight: round(insight, 3),
                weights: { ...CONFIDENCE_WEIGHTS }
            }
        };
    }

    function computeDerivedRatings(entryLike, options) {
        const settings = options && options.settings ? options.settings : getSettings(options?.config);
        const apiRatings = sanitizeApiRatings(entryLike?.apiRatings || entryLike);
        const sourceSignals = mergeSourceSignals(
            entryLike?.sourceSignals,
            extractSourceSignalsFromSources(entryLike?.sources)
        );
        const sourceStatus = normalizeSourceStatus(entryLike?.sourceStatus);
        const personal10 = normalizePersonalRatingTo10(entryLike?.rating ?? entryLike?.personalRating ?? entryLike?.personal10);
        const apiAverage10 = computeApiAverage(apiRatings, settings);
        const apiWeighted10 = computeApiWeighted(apiRatings, settings);

        let hybrid10 = null;
        if (personal10 !== null && apiWeighted10 !== null) {
            hybrid10 = round((settings.personalWeight * personal10) + ((1 - settings.personalWeight) * apiWeighted10), 2);
        } else if (personal10 !== null) {
            hybrid10 = personal10;
        } else if (apiWeighted10 !== null) {
            hybrid10 = apiWeighted10;
        }

        const confidenceData = computeConfidence(entryLike, settings, apiRatings, sourceSignals, hybrid10);
        const confidence = confidenceData.value;
        const activeValue = pickActiveScaleValue(settings.activeScale, {
            personal10,
            apiAverage10,
            apiWeighted10,
            hybrid10,
            confidence
        });

        return {
            personal10,
            apiAverage10,
            apiWeighted10,
            hybrid10,
            activeScale: settings.activeScale,
            activeValue,
            confidence,
            confidenceBreakdown: confidenceData.breakdown,
            sourceStatus
        };
    }

    function applyDerivedRatings(entry, options) {
        if (!entry || typeof entry !== "object") return entry;
        entry.apiRatings = sanitizeApiRatings(entry.apiRatings);
        entry.sourceSignals = mergeSourceSignals(entry.sourceSignals, extractSourceSignalsFromSources(entry.sources));
        if (!entry.sourceStatus) {
            const inferred = normalizeSourceStatus(entry.status);
            // Avoid treating normal personal progress labels as source status.
            if (inferred && inferred !== "Completed") {
                entry.sourceStatus = inferred;
            }
        }
        if (entry.sourceStatus) {
            entry.sourceStatus = normalizeSourceStatus(entry.sourceStatus);
        }
        entry.derivedRatings = computeDerivedRatings(entry, options);
        return entry;
    }

    function getActiveScale(configRef) {
        return getSettings(configRef).activeScale;
    }

    function getRatingValue(entry, scale, options) {
        if (!entry || typeof entry !== "object") return null;
        const settings = options?.settings || getSettings(options?.config);
        const derived = entry.derivedRatings && typeof entry.derivedRatings === "object"
            ? entry.derivedRatings
            : computeDerivedRatings(entry, { settings });
        const value = pickActiveScaleValue(scale || settings.activeScale, {
            personal10: derived.personal10,
            apiAverage10: derived.apiAverage10,
            apiWeighted10: derived.apiWeighted10,
            hybrid10: derived.hybrid10,
            confidence: derived.confidence
        });
        return value === null ? null : round(value, 2);
    }

    window.EveLibrary.Ratings = {
        PROVIDERS,
        DEFAULTS,
        sourceNameToProvider,
        normalizeProviderScore,
        sanitizeApiRatings,
        mergeApiRatings,
        extractApiRatingsFromSources,
        createEmptySourceSignals,
        sanitizeSourceSignals,
        mergeSourceSignals,
        extractSourceSignalsFromSources,
        normalizeSourceStatus,
        normalizePersonalRatingTo10,
        ensureConfigDefaults,
        getSettings,
        getActiveScale,
        computeDerivedRatings,
        applyDerivedRatings,
        getRatingValue
    };
})();
