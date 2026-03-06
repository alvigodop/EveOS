/**
 * Statistics Calculator - Ratings Overview Metrics
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsCalcRatingModules = window.EveLibrary.StatsCalcRatingModules || {};

(function (modules) {
    if (modules.overview) return;

    const Shared = window.EveLibrary.StatsCalcShared;
    if (!Shared) {
        console.warn('[EveLibrary.StatsCalcRatings] Missing shared module (stats-calc.shared.js).');
        return;
    }

    const {
        toNumber,
        round,
        parseUniqueCsvList,
        ensureDerivedRatings
    } = Shared;

    function calcRatingOverview(entries) {
        let personalSum = 0;
        let personalCount = 0;
        let unifiedSum = 0;
        let unifiedCount = 0;
        let apiSum = 0;
        let apiCount = 0;

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);

            const personal = toNumber(entry?.rating);
            if (personal && personal > 0) {
                personalSum += personal;
                personalCount += 1;
            }

            const unified = toNumber(derived?.hybrid10);
            if (unified && unified > 0) {
                unifiedSum += unified;
                unifiedCount += 1;
            }

            const api = toNumber(derived?.apiAverage10);
            if (api && api > 0) {
                apiSum += api;
                apiCount += 1;
            }
        });

        return {
            totalEntries: entries.length,
            personalRatedCount: personalCount,
            personalAvg5: personalCount ? personalSum / personalCount : null,
            unifiedRatedCount: unifiedCount,
            unifiedAvg10: unifiedCount ? unifiedSum / unifiedCount : null,
            apiRatedCount: apiCount,
            apiAvg10: apiCount ? apiSum / apiCount : null
        };
    }

    function calcRatingDiscrepancies(entries, limit = 5) {
        const rows = [];

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);
            const personal10 = toNumber(derived?.personal10);
            const apiAverage10 = toNumber(derived?.apiAverage10);
            if (personal10 === null || apiAverage10 === null) return;

            const delta = personal10 - apiAverage10;
            rows.push({
                id: entry?.id,
                title: String(entry?.title || 'Untitled'),
                personal10: round(personal10, 2),
                apiAverage10: round(apiAverage10, 2),
                delta: round(delta, 2)
            });
        });

        const lovedByMe = rows
            .filter(item => item.delta > 0)
            .sort((a, b) => b.delta - a.delta)
            .slice(0, limit);

        const overhypedForMe = rows
            .filter(item => item.delta < 0)
            .sort((a, b) => a.delta - b.delta)
            .slice(0, limit);

        return {
            totalCompared: rows.length,
            lovedByMe,
            overhypedForMe
        };
    }

    function calcGenreRatingStats(entries, minEntries = 2) {
        const genreMap = {};

        entries.forEach(entry => {
            const genres = parseUniqueCsvList(entry?.genre);
            if (!genres.length) return;

            const derived = ensureDerivedRatings(entry);
            const unified = toNumber(derived?.hybrid10);
            const personal = toNumber(entry?.rating);

            genres.forEach(genre => {
                if (!genreMap[genre]) {
                    genreMap[genre] = {
                        count: 0,
                        unifiedSum: 0,
                        unifiedCount: 0,
                        personalSum: 0,
                        personalCount: 0
                    };
                }

                const bucket = genreMap[genre];
                bucket.count += 1;

                if (unified !== null && unified > 0) {
                    bucket.unifiedSum += unified;
                    bucket.unifiedCount += 1;
                }

                if (personal !== null && personal > 0) {
                    bucket.personalSum += personal;
                    bucket.personalCount += 1;
                }
            });
        });

        return Object.entries(genreMap)
            .map(([genre, bucket]) => ({
                genre,
                count: bucket.count,
                avgUnified10: bucket.unifiedCount ? round(bucket.unifiedSum / bucket.unifiedCount, 2) : null,
                avgPersonal5: bucket.personalCount ? round(bucket.personalSum / bucket.personalCount, 2) : null
            }))
            .filter(item => item.count >= minEntries)
            .sort((a, b) => {
                const aScore = toNumber(a.avgUnified10) ?? -1;
                const bScore = toNumber(b.avgUnified10) ?? -1;
                if (bScore !== aScore) return bScore - aScore;
                return b.count - a.count;
            });
    }

    modules.overview = {
        calcRatingOverview,
        calcRatingDiscrepancies,
        calcGenreRatingStats
    };
})(window.EveLibrary.StatsCalcRatingModules);
