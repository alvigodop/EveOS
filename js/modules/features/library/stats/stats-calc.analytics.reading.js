/**
 * Statistics Calculator Analytics - Reading Activity
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Shared = window.EveLibrary.StatsCalcShared;
    if (!Shared) {
        console.warn('[EveLibrary.StatsCalcAnalyticsReading] Missing shared module.');
        return;
    }

    const {
        clamp,
        round,
        normalizeStatus,
        getProgressUnits,
        isFilmLikeEntry,
        extractTotalUnits,
        parseUniqueCsvList,
        toList
    } = Shared;

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

    window.EveLibrary.StatsCalcAnalyticsReading = {
        calcDropoffStats,
        calcReadingVelocity,
        calcMonthlyReadingProgress,
        calcDailyReadingHabits,
        calcEstimatedReadingTime,
        calcActiveReadingEntries
    };
})();
