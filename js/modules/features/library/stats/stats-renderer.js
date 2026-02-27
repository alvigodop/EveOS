/**
 * Statistics Renderer for Eve OS Library
 * Renders charts inside category library panel
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;
    const StatsCalc = window.EveLibrary.StatsCalc;
    const ChartUtils = window.EveLibrary.ChartUtils;

    function formatAverage(value, digits) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 'N/A';
        return n.toFixed(digits);
    }

    function toTopCounts(counts, limit) {
        const pairs = Object.entries(counts || {})
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);

        if (pairs.length <= limit) return pairs;
        const topPairs = pairs.slice(0, limit - 1);
        const otherCount = pairs.slice(limit - 1).reduce((sum, item) => sum + item[1], 0);
        topPairs.push(['Other', otherCount]);
        return topPairs;
    }

    function renderStats(categoryName, container) {
        const lib = State.getCategoryLibrary(categoryName);
        const allTypeEntries = Search?.getTypeScopedEntries
            ? Search.getTypeScopedEntries(categoryName)
            : (lib.entries || []);
        const entries = Search?.getFilteredEntries
            ? Search.getFilteredEntries(categoryName)
            : allTypeEntries;
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const rating = StatsCalc.calcRatingOverview(entries);
        const filteredInfo = `${entries.length} shown / ${allTypeEntries.length} total`;

        // Stats Container Layout
        container.innerHTML = `
            <div class="lib-stats-grid">
                <div class="lib-stat-card">
                    <h4>Status Distribution</h4>
                    <div class="lib-chart-wrapper"><canvas id="${prefix}statusChart"></canvas></div>
                </div>
                <div class="lib-stat-card">
                    <h4>Genre Distribution</h4>
                    <div class="lib-chart-wrapper"><canvas id="${prefix}genreChart"></canvas></div>
                </div>
                <div class="lib-stat-card">
                    <h4>Rating Overview</h4>
                    <p class="lib-stat-highlight">Unified Avg: ${formatAverage(rating.unifiedAvg10, 2)} / 10</p>
                    <div class="lib-stat-summary">Unified Rated: ${rating.unifiedRatedCount}</div>
                    <div class="lib-stat-summary">Personal Avg: ${formatAverage(rating.personalAvg5, 2)} / 5 (${rating.personalRatedCount})</div>
                    <div class="lib-stat-summary">API Avg: ${formatAverage(rating.apiAvg10, 2)} / 10 (${rating.apiRatedCount})</div>
                    <div class="lib-stat-summary">Entries: ${filteredInfo}</div>
                </div>
            </div>
        `;

        if (typeof Chart === 'undefined') {
            container.innerHTML += `<p class="error-msg">Chart.js library not loaded.</p>`;
            return;
        }

        // 1. Status Chart
        const statusData = StatsCalc.calcStatusCounts(entries);
        const statusPairs = Object.entries(statusData).filter(([, count]) => count > 0);
        const statusLabels = statusPairs.length ? statusPairs.map(([label]) => label) : ['No Data'];
        const statusValues = statusPairs.length ? statusPairs.map(([, count]) => count) : [1];
        ChartUtils.createChart(prefix + 'statusChart', prefix + 'status', 'doughnut', statusLabels, [{
            data: statusValues,
            backgroundColor: ChartUtils.generateColors(statusLabels.length)
        }], { plugins: { legend: { position: 'right' } } });

        // 2. Genre Chart
        const genreData = StatsCalc.calcGenreCounts(entries);
        const genrePairs = toTopCounts(genreData, 10);
        const genreLabels = genrePairs.length ? genrePairs.map(([label]) => label) : ['No Data'];
        const genreValues = genrePairs.length ? genrePairs.map(([, count]) => count) : [1];
        ChartUtils.createChart(prefix + 'genreChart', prefix + 'genre', 'bar', genreLabels, [{
            label: 'Entries per Genre',
            data: genreValues,
            backgroundColor: ChartUtils.Colors.PRIMARY
        }]);
    }

    window.EveLibrary.StatsRenderer = {
        renderStats
    };
})();
