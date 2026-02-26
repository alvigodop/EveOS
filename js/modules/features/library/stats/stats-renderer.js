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

    function renderStats(categoryName, container) {
        const lib = State.getCategoryLibrary(categoryName);
        const entries = Search?.getTypeScopedEntries ? Search.getTypeScopedEntries(categoryName) : (lib.entries || []);
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;

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
                    <p class="lib-stat-highlight">Average Rating: ${StatsCalc.calcAvgRating(entries).toFixed(2)} / 5</p>
                    <div class="lib-stat-summary">Total Entries: ${entries.length}</div>
                </div>
            </div>
        `;

        if (typeof Chart === 'undefined') {
            container.innerHTML += `<p class="error-msg">Chart.js library not loaded.</p>`;
            return;
        }

        // 1. Status Chart
        const statusData = StatsCalc.calcStatusCounts(entries);
        const statusLabels = Object.keys(statusData);
        ChartUtils.createChart(prefix + 'statusChart', prefix + 'status', 'doughnut', statusLabels, [{
            data: Object.values(statusData),
            backgroundColor: ChartUtils.generateColors(statusLabels.length)
        }], { plugins: { legend: { position: 'right' } } });

        // 2. Genre Chart
        const genreData = StatsCalc.calcGenreCounts(entries);
        const genreLabels = Object.keys(genreData);
        ChartUtils.createChart(prefix + 'genreChart', prefix + 'genre', 'bar', genreLabels, [{
            label: 'Entries per Genre',
            data: Object.values(genreData),
            backgroundColor: ChartUtils.Colors.PRIMARY
        }]);
    }

    window.EveLibrary.StatsRenderer = {
        renderStats
    };
})();
