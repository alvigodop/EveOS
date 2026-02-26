/**
 * Statistics Calculator for Eve OS Library
 * Calculates metrics for library entries
 * Adapted from MegaBase statistics-calc.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    function calcGenreCounts(entries) {
        const counts = {};
        entries.forEach(e => {
            if (e.genre) counts[e.genre] = (counts[e.genre] || 0) + 1;
        });
        return counts;
    }

    function calcAvgRating(entries) {
        let sum = 0, count = 0;
        entries.forEach(e => {
            if (e.rating && !isNaN(e.rating)) {
                sum += parseFloat(e.rating);
                count++;
            }
        });
        return count > 0 ? sum / count : 0;
    }

    function calcStatusCounts(entries) {
        const counts = {};
        entries.forEach(e => {
            const st = e.status || 'Unknown';
            counts[st] = (counts[st] || 0) + 1;
        });
        return counts;
    }

    function calcProgress(entries) {
        // Simplified progress tracking
        const labels = ['Completed', 'In Progress', 'Planned', 'Dropped/Other'];
        const counts = { 'Completed': 0, 'In Progress': 0, 'Planned': 0, 'Dropped/Other': 0 };

        entries.forEach(e => {
            const st = (e.status || '').toLowerCase();
            if (st === 'completed') counts['Completed']++;
            else if (st === 'reading' || st === 'watching') counts['In Progress']++;
            else if (st.includes('plan')) counts['Planned']++;
            else counts['Dropped/Other']++;
        });
        return { labels, data: Object.values(counts) };
    }

    window.EveLibrary.StatsCalc = {
        calcGenreCounts,
        calcAvgRating,
        calcStatusCounts,
        calcProgress
    };
})();
