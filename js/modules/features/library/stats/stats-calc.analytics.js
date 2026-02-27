/**
 * Statistics Calculator - Analytics Metrics
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Shared = window.EveLibrary.StatsCalcShared;
    const RatingsMetrics = window.EveLibrary.StatsCalcRatings;
    if (!Shared || !RatingsMetrics) {
        console.warn('[EveLibrary.StatsCalcAnalytics] Missing dependencies (shared/ratings modules).');
        return;
    }

    const {
        DEMOGRAPHIC_NAMES,
        parseUniqueCsvList,
        toList,
        toNumber,
        clamp,
        round,
        normalizeStatus,
        getProgressUnits,
        isFilmLikeEntry,
        extractTotalUnits,
        extractPublicationYear,
        calcGenreCounts,
        calcTagCounts
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

    function calcDropoffStats(entries) {
        const droppedProgress = [];
        const pausedProgress = [];

        entries.forEach(entry => {
            const bucket = normalizeStatus(entry?.status);
            const progress = getProgressUnits(entry);
            if (progress <= 0) return;

            if (bucket === 'Dropped') droppedProgress.push(progress);
            if (bucket === 'Paused') pausedProgress.push(progress);
        });

        const average = (values) => {
            if (!values.length) return null;
            return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
        };

        return {
            droppedCount: droppedProgress.length,
            pausedCount: pausedProgress.length,
            droppedAvgProgress: average(droppedProgress),
            pausedAvgProgress: average(pausedProgress),
            overallAvgProgress: average([...droppedProgress, ...pausedProgress])
        };
    }

    function calcReadingVelocity(entries, months = 6) {
        const safeMonths = clamp(months, 3, 18);
        const now = new Date();
        const monthSlots = [];
        const indexByKey = {};

        for (let i = safeMonths - 1; i >= 0; i -= 1) {
            const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            indexByKey[key] = monthSlots.length;
            monthSlots.push({
                key,
                label: dt.toLocaleString(undefined, { month: 'short', year: '2-digit' }),
                activity: 0,
                progressUnits: 0
            });
        }

        entries.forEach(entry => {
            const stampRaw = entry?.lastEdited || entry?.dateAdded;
            if (!stampRaw) return;

            const stamp = new Date(stampRaw);
            if (Number.isNaN(stamp.getTime())) return;

            const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}`;
            const index = indexByKey[key];
            if (typeof index !== 'number') return;

            monthSlots[index].activity += 1;
            monthSlots[index].progressUnits += getProgressUnits(entry);
        });

        return {
            labels: monthSlots.map(slot => slot.label),
            activityCounts: monthSlots.map(slot => slot.activity),
            progressTotals: monthSlots.map(slot => round(slot.progressUnits, 2))
        };
    }

    function calcMonthlyReadingProgress(entries, months = 12) {
        const velocity = calcReadingVelocity(entries, months);
        return {
            labels: velocity.labels || [],
            chaptersRead: velocity.progressTotals || [],
            activityCounts: velocity.activityCounts || []
        };
    }

    function calcDailyReadingHabits(entries, days = 30) {
        const safeDays = clamp(days, 7, 90);
        const now = new Date();
        const daySlots = [];
        const indexByKey = {};

        for (let i = safeDays - 1; i >= 0; i -= 1) {
            const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            indexByKey[key] = daySlots.length;
            daySlots.push({
                key,
                label: dt.toLocaleString(undefined, { month: 'short', day: 'numeric' }),
                activity: 0,
                progressUnits: 0
            });
        }

        entries.forEach(entry => {
            const stampRaw = entry?.lastEdited || entry?.dateAdded;
            if (!stampRaw) return;
            const stamp = new Date(stampRaw);
            if (Number.isNaN(stamp.getTime())) return;

            const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`;
            const index = indexByKey[key];
            if (typeof index !== 'number') return;

            daySlots[index].activity += 1;
            daySlots[index].progressUnits += getProgressUnits(entry);
        });

        return {
            labels: daySlots.map(slot => slot.label),
            activityCounts: daySlots.map(slot => slot.activity),
            progressTotals: daySlots.map(slot => round(slot.progressUnits, 2))
        };
    }

    function calcEstimatedReadingTime(entries, minutesPerUnit = 5) {
        const safeMinutes = clamp(minutesPerUnit, 1, 30);
        const totalUnits = entries.reduce((sum, entry) => sum + getProgressUnits(entry), 0);
        const totalMinutes = totalUnits * safeMinutes;
        const totalHours = totalMinutes / 60;

        return {
            totalUnits,
            minutesPerUnit: safeMinutes,
            totalMinutes: round(totalMinutes, 1),
            totalHours: round(totalHours, 2)
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
        const BLOCKED_PREFIXES = ['original:', 'translations:', 'serialization:'];
        const pairs = Object.entries(calcTagCounts(entries))
            .filter(([tag]) => {
                const lowered = String(tag || '').trim().toLowerCase();
                if (!lowered) return false;
                return !BLOCKED_PREFIXES.some(prefix => lowered.startsWith(prefix));
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
        const readingTime = calcEstimatedReadingTime(entries, 5);
        const creators = calcCreatorLoyalty(entries, 1);
        const topAuthor = creators.topAuthors[0] || null;
        const totalStatuses = Shared.calcStatusCounts(entries);
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

    function calcActiveReadingEntries(entries, limit = 10) {
        const maxEntries = clamp(limit, 1, 40);
        return (Array.isArray(entries) ? entries : [])
            .filter(entry => normalizeStatus(entry?.status) === 'In Progress')
            .sort((a, b) => {
                const aStamp = Date.parse(a?.lastEdited || a?.dateAdded || 0) || 0;
                const bStamp = Date.parse(b?.lastEdited || b?.dateAdded || 0) || 0;
                return bStamp - aStamp;
            })
            .slice(0, maxEntries)
            .map(entry => {
                const currentUnits = getProgressUnits(entry);
                const totalUnits = extractTotalUnits(entry);
                const image = String(entry?.image || '').trim();
                const tagList = toList(entry?.tags).slice(0, 5);
                const genreList = parseUniqueCsvList(entry?.genre).slice(0, 3);
                const tags = tagList.length ? tagList : genreList;
                const unitLabel = isFilmLikeEntry(entry) ? 'Ep.' : 'Ch.';
                let percent;
                if (totalUnits && totalUnits > 0) {
                    percent = clamp((currentUnits / totalUnits) * 100, 0, 100);
                } else if (currentUnits > 0) {
                    percent = clamp(22 + (Math.log10(currentUnits + 1) * 26), 8, 92);
                } else {
                    percent = 6;
                }

                return {
                    id: entry?.id,
                    title: String(entry?.title || 'Untitled'),
                    image,
                    tags,
                    currentUnits,
                    totalUnits,
                    percent: round(percent, 2),
                    unitLabel
                };
            });
    }

    window.EveLibrary.StatsCalcAnalytics = {
        calcTopGenres,
        calcCreatorLoyalty,
        calcDropoffStats,
        calcReadingVelocity,
        calcMonthlyReadingProgress,
        calcDailyReadingHabits,
        calcEstimatedReadingTime,
        calcPublicationYearCounts,
        calcTagCloud,
        calcLengthVsQuality,
        calcDemographicCounts,
        calcSummaryKpis,
        calcActiveReadingEntries
    };
})();
