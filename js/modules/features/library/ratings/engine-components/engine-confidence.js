window.EveLibrary = window.EveLibrary || {};

(function () {
    const Foundation = window.EveLibrary.RatingsEngineFoundation;
    const Settings = window.EveLibrary.RatingsEngineSettings;
    if (!Foundation || !Settings) {
        console.warn('[EveLibrary.RatingsEngineConfidence] Foundation/settings module missing.');
        return;
    }

    const {
        clamp,
        round,
        toNumberOrNull,
        normalizeSourceStatus,
        SIGNAL_COUNT_CAPS,
        SIGNAL_RANK_CAP,
        CONFIDENCE_WEIGHTS
    } = Foundation;
    const { getEnabledProviders } = Settings;

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

    window.EveLibrary.RatingsEngineConfidence = {
        computeConfidence
    };
})();
