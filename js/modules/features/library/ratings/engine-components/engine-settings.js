window.EveLibrary = window.EveLibrary || {};

(function () {
    const Foundation = window.EveLibrary.RatingsEngineFoundation;
    if (!Foundation) {
        console.warn('[EveLibrary.RatingsEngineSettings] Foundation module missing.');
        return;
    }

    const { DEFAULTS, clamp, round, toNumberOrNull, PROVIDERS } = Foundation;

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

    window.EveLibrary.RatingsEngineSettings = {
        normalizePersonalRatingTo10,
        getSettings,
        ensureConfigDefaults,
        pickActiveScaleValue,
        getEnabledProviders
    };
})();
