/**
 * Statistics Calculator Analytics - Summary and Insight Metrics
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Shared = window.EveLibrary.StatsCalcShared;
    const RatingsMetrics = window.EveLibrary.StatsCalcRatings;
    const Reading = window.EveLibrary.StatsCalcAnalyticsReading;
    if (!Shared || !RatingsMetrics || !Reading) {
        console.warn('[EveLibrary.StatsCalcAnalyticsInsights] Missing shared, ratings, or reading module.');
        return;
    }

    const {
        DEMOGRAPHIC_NAMES,
        parseUniqueCsvList,
        toList,
        toNumber,
        clamp,
        calcGenreCounts,
        calcTagCounts,
        extractPublicationYear,
        getProgressUnits,
        calcStatusCounts
    } = Shared;

    function calcTopGenres(entries, limit = 6) {
        const pairs = Object.entries(calcGenreCounts(entries))
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, Math.max(1, limit));

        return pairs.map(([genre, count]) => ({ genre, count }));
    }

    function calcCreatorLoyalty(entries, limit = 8) {
        const authorCounts = {};
        const artistCounts = {};
        const studioCounts = {};

        entries.forEach(entry => {
            const authorList = toList(entry?.author);
            const authorAltList = toList(entry?.authorAltNames);
            const mergedAuthors = toList([...authorList, ...authorAltList]);
            const artistList = toList(entry?.artist);
            const studioList = toList(entry?.studios);

            mergedAuthors.forEach(name => {
                authorCounts[name] = (authorCounts[name] || 0) + 1;
            });
            artistList.forEach(name => {
                artistCounts[name] = (artistCounts[name] || 0) + 1;
            });
            studioList.forEach(name => {
                studioCounts[name] = (studioCounts[name] || 0) + 1;
            });
        });

        const toTop = (counts) => Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([name, count]) => ({ name, count }));

        return {
            topAuthors: toTop(authorCounts),
            topArtists: toTop(artistCounts),
            topStudios: toTop(studioCounts)
        };
    }

    function calcPublicationYearCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const year = extractPublicationYear(entry);
            if (!year) return;
            counts[String(year)] = (counts[String(year)] || 0) + 1;
        });
        return counts;
    }

    function calcTagCloud(entries, limit = 32) {
        const blockedPrefixes = ['original:', 'translations:', 'serialization:'];
        const pairs = Object.entries(calcTagCounts(entries))
            .filter(([tag]) => {
                const lowered = String(tag || '').trim().toLowerCase();
                if (!lowered) return false;
                return !blockedPrefixes.some(prefix => lowered.startsWith(prefix));
            })
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, Math.max(1, limit));

        const maxCount = pairs.length ? pairs[0][1] : 1;
        const minCount = pairs.length ? pairs[pairs.length - 1][1] : 1;
        const span = Math.max(1, maxCount - minCount);

        return pairs.map(([tag, count]) => ({
            tag,
            count,
            weight: (count - minCount) / span
        }));
    }

    function calcLengthVsQuality(entries) {
        const points = [];
        entries.forEach(entry => {
            const length = getProgressUnits(entry);
            const personal5 = toNumber(entry?.rating);
            if (length <= 0 || personal5 === null || personal5 <= 0) return;
            points.push({
                x: length,
                y: clamp(personal5, 0, 5),
                title: String(entry?.title || 'Untitled')
            });
        });
        return points;
    }

    function calcDemographicCounts(entries) {
        const counts = {};
        DEMOGRAPHIC_NAMES.forEach(name => {
            counts[name] = 0;
        });

        entries.forEach(entry => {
            const tags = toList(entry?.tags).map(tag => String(tag).toLowerCase());
            const genres = parseUniqueCsvList(entry?.genre).map(genre => String(genre).toLowerCase());
            const all = [...tags, ...genres];

            DEMOGRAPHIC_NAMES.forEach(name => {
                const key = name.toLowerCase();
                if (all.some(item => item.includes(key))) {
                    counts[name] += 1;
                }
            });
        });

        return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
    }

    function calcSummaryKpis(entries) {
        const ratingOverview = RatingsMetrics.calcRatingOverview(entries);
        const readingTime = Reading.calcEstimatedReadingTime(entries, 5);
        const creators = calcCreatorLoyalty(entries, 1);
        const topAuthor = creators.topAuthors[0] || null;
        const totalStatuses = calcStatusCounts(entries);
        const completedCount = totalStatuses.Completed || 0;
        const health = RatingsMetrics.calcLibraryHealth(entries);

        return {
            totalSeries: entries.length,
            totalProgressUnits: readingTime.totalUnits,
            estimatedHours: readingTime.totalHours,
            avgUnified10: ratingOverview.unifiedAvg10,
            avgPersonal5: ratingOverview.personalAvg5,
            topAuthorName: topAuthor ? topAuthor.name : '',
            topAuthorCount: topAuthor ? topAuthor.count : 0,
            completedCount,
            averageConfidence: health.averageConfidence,
            highConfidenceShare: health.highConfidenceShare
        };
    }

    window.EveLibrary.StatsCalcAnalyticsInsights = {
        calcTopGenres,
        calcCreatorLoyalty,
        calcPublicationYearCounts,
        calcTagCloud,
        calcLengthVsQuality,
        calcDemographicCounts,
        calcSummaryKpis
    };
})();
