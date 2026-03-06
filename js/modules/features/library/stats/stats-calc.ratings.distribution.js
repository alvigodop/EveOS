/**
 * Statistics Calculator - Ratings Distribution Metrics
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsCalcRatingModules = window.EveLibrary.StatsCalcRatingModules || {};

(function (modules) {
    if (modules.distribution) return;

    const Shared = window.EveLibrary.StatsCalcShared;
    if (!Shared) {
        console.warn('[EveLibrary.StatsCalcRatings] Missing shared module (stats-calc.shared.js).');
        return;
    }

    const {
        toNumber,
        clamp,
        round,
        ensureDerivedRatings,
        calcStatusCounts
    } = Shared;

    function calcRatingDistribution(entries) {
        const buckets = {};
        for (let i = 1; i <= 10; i += 1) {
            buckets[String(i)] = 0;
        }

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);
            let personal10 = toNumber(derived?.personal10);
            if (personal10 === null) {
                const personal5 = toNumber(entry?.rating);
                if (personal5 !== null && personal5 > 0) personal10 = personal5 * 2;
            }
            if (personal10 === null || personal10 <= 0) return;

            const bucket = String(clamp(Math.round(personal10), 1, 10));
            buckets[bucket] = (buckets[bucket] || 0) + 1;
        });

        return buckets;
    }

    function calcUnifiedRatingDistribution(entries) {
        const buckets = {};
        for (let i = 1; i <= 10; i += 1) {
            buckets[String(i)] = 0;
        }

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);
            const unified10 = toNumber(derived?.hybrid10);
            if (unified10 === null || unified10 <= 0) return;
            const bucket = String(clamp(Math.round(unified10), 1, 10));
            buckets[bucket] = (buckets[bucket] || 0) + 1;
        });

        return buckets;
    }

    function calcLibraryHealth(entries) {
        if (!entries.length) {
            return {
                averageConfidence: 0,
                highConfidenceShare: 0,
                lowConfidenceEntries: []
            };
        }

        const rows = entries.map(entry => {
            const derived = ensureDerivedRatings(entry);
            const confidence = clamp(toNumber(derived?.confidence) ?? 0, 0, 1);
            return {
                id: entry?.id,
                title: String(entry?.title || 'Untitled'),
                confidence
            };
        });

        const averageConfidence = rows.reduce((sum, item) => sum + item.confidence, 0) / rows.length;
        const highConfidence = rows.filter(item => item.confidence >= 0.75).length;
        const lowConfidenceEntries = rows
            .filter(item => item.confidence < 0.65)
            .sort((a, b) => a.confidence - b.confidence)
            .slice(0, 8)
            .map(item => ({
                id: item.id,
                title: item.title,
                confidence: round(item.confidence, 2)
            }));

        return {
            averageConfidence: round(averageConfidence, 3),
            highConfidenceShare: round(highConfidence / rows.length, 3),
            lowConfidenceEntries
        };
    }

    function calcBacklogFunnel(entries) {
        const status = calcStatusCounts(entries);
        return {
            planned: status.Planned || 0,
            inProgress: status['In Progress'] || 0,
            completed: status.Completed || 0,
            paused: status.Paused || 0,
            dropped: status.Dropped || 0
        };
    }

    modules.distribution = {
        calcRatingDistribution,
        calcUnifiedRatingDistribution,
        calcLibraryHealth,
        calcBacklogFunnel
    };
})(window.EveLibrary.StatsCalcRatingModules);
