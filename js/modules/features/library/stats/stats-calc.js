/**
 * Statistics Calculator for Eve OS Library
 * Calculates metrics for library entries
 * Adapted from MegaBase statistics-calc.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Ratings = window.EveLibrary.Ratings;
    const STATUS_BUCKETS = ['Completed', 'In Progress', 'Planned', 'Paused', 'Dropped', 'Other'];

    function parseUniqueCsvList(value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function normalizeStatus(rawStatus) {
        const value = String(rawStatus || '').trim().toLowerCase();
        if (!value) return 'Other';

        if (/complete|finished|done/.test(value)) return 'Completed';
        if (/plan|wishlist|queue|backlog|to read|to watch/.test(value)) return 'Planned';
        if (/pause|hiatus|hold/.test(value)) return 'Paused';
        if (/drop|abandon|cancel/.test(value)) return 'Dropped';
        if (/read|watch|progress|ongoing|current/.test(value)) return 'In Progress';
        return 'Other';
    }

    function calcGenreCounts(entries) {
        const counts = {};
        entries.forEach(e => {
            parseUniqueCsvList(e?.genre).forEach(genre => {
                counts[genre] = (counts[genre] || 0) + 1;
            });
        });
        return counts;
    }

    function calcAvgRating(entries) {
        let sum = 0, count = 0;
        entries.forEach(e => {
            const rating = toNumber(e?.rating);
            if (!rating || rating <= 0) return;
            sum += rating;
            count++;
        });
        return count > 0 ? sum / count : 0;
    }

    function calcStatusCounts(entries) {
        const counts = {
            'Completed': 0,
            'In Progress': 0,
            'Planned': 0,
            'Paused': 0,
            'Dropped': 0,
            'Other': 0
        };

        entries.forEach(e => {
            const bucket = normalizeStatus(e?.status);
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

    function calcRatingOverview(entries) {
        let personalSum = 0;
        let personalCount = 0;
        let unifiedSum = 0;
        let unifiedCount = 0;
        let apiSum = 0;
        let apiCount = 0;

        entries.forEach(entry => {
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(entry);
            }

            const personal = toNumber(entry?.rating);
            if (personal && personal > 0) {
                personalSum += personal;
                personalCount++;
            }

            const derived = entry?.derivedRatings || {};
            const unified = toNumber(derived?.hybrid10);
            if (unified && unified > 0) {
                unifiedSum += unified;
                unifiedCount++;
            }

            const api = toNumber(derived?.apiAverage10);
            if (api && api > 0) {
                apiSum += api;
                apiCount++;
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

    window.EveLibrary.StatsCalc = {
        calcGenreCounts,
        calcAvgRating,
        calcStatusCounts,
        calcProgress,
        calcRatingOverview
    };
})();
