window.EveLibrary = window.EveLibrary || {};

(function () {
    const PROVIDERS = ["anilist", "myanimelist", "mangadex"];

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
        const n = toNumberOrNull(rawRating);
        if (n === null) return null;
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
            case "hybrid":
            default:
                return values.hybrid10;
        }
    }

    function computeDerivedRatings(entryLike, options) {
        const settings = options && options.settings ? options.settings : getSettings(options?.config);
        const apiRatings = sanitizeApiRatings(entryLike?.apiRatings || entryLike);
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

        const providerCount = PROVIDERS.filter(provider =>
            settings.enabledProviders[provider] && apiRatings[provider] !== null
        ).length;
        const enabledCount = PROVIDERS.filter(provider => settings.enabledProviders[provider]).length || 1;
        const confidence = round(clamp(providerCount / enabledCount, 0, 1), 2);
        const activeValue = pickActiveScaleValue(settings.activeScale, {
            personal10,
            apiAverage10,
            apiWeighted10,
            hybrid10
        });

        return {
            personal10,
            apiAverage10,
            apiWeighted10,
            hybrid10,
            activeScale: settings.activeScale,
            activeValue,
            confidence
        };
    }

    function applyDerivedRatings(entry, options) {
        if (!entry || typeof entry !== "object") return entry;
        entry.apiRatings = sanitizeApiRatings(entry.apiRatings);
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
            hybrid10: derived.hybrid10
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
        normalizePersonalRatingTo10,
        ensureConfigDefaults,
        getSettings,
        getActiveScale,
        computeDerivedRatings,
        applyDerivedRatings,
        getRatingValue
    };
})();
