/**
 * Statistics Calculator Shared - Aggregate Metrics
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const SharedUtils = window.EveLibrary.StatsCalcSharedUtils;
    if (!SharedUtils) {
        console.warn('[EveLibrary.StatsCalcSharedMetrics] Missing shared utils module.');
        return;
    }

    const {
        STATUS_BUCKETS,
        parseUniqueCsvList,
        extractOriginLabel,
        normalizeStatus,
        toNumber
    } = SharedUtils;

    function calcGenreCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            parseUniqueCsvList(entry?.genre).forEach(genre => {
                counts[genre] = (counts[genre] || 0) + 1;
            });
        });
        return counts;
    }

    function calcTagCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const sourceTags = Array.isArray(entry?.tags)
                ? entry.tags
                : parseUniqueCsvList(entry?.tags);
            sourceTags.forEach(tagValue => {
                parseUniqueCsvList(tagValue).forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            });
        });
        return counts;
    }

    function calcOriginCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const label = extractOriginLabel(entry);
            counts[label] = (counts[label] || 0) + 1;
        });
        return counts;
    }

    function calcAvgRating(entries) {
        let sum = 0;
        let count = 0;
        entries.forEach(entry => {
            const rating = toNumber(entry?.rating);
            if (!rating || rating <= 0) return;
            sum += rating;
            count += 1;
        });
        return count > 0 ? sum / count : 0;
    }

    function calcStatusCounts(entries) {
        const counts = {
            Completed: 0,
            'In Progress': 0,
            Planned: 0,
            Paused: 0,
            Dropped: 0,
            Other: 0
        };

        entries.forEach(entry => {
            const bucket = normalizeStatus(entry?.status);
            counts[bucket] = (counts[bucket] || 0) + 1;
        });
        return counts;
    }

    function calcProgress(entries) {
        const counts = calcStatusCounts(entries);
        return {
            labels: STATUS_BUCKETS,
            data: STATUS_BUCKETS.map(label => counts[label] || 0)
        };
    }

    window.EveLibrary.StatsCalcSharedMetrics = {
        calcGenreCounts,
        calcTagCounts,
        calcOriginCounts,
        calcAvgRating,
        calcStatusCounts,
        calcProgress
    };
})();
