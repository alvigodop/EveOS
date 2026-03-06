/**
 * Library Stats Renderer Facade
 * Delegates KPI, chart, and widget responsibilities to focused modules.
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;
    const Storage = window.EveLibrary.Storage;
    const Ratings = window.EveLibrary.Ratings;
    const StatsCalc = window.EveLibrary.StatsCalc;
    const ChartUtils = window.EveLibrary.ChartUtils;
    const Kpi = window.EveLibrary.StatsRendererKpi;
    const Charts = window.EveLibrary.StatsRendererCharts;
    const Widgets = window.EveLibrary.StatsRendererWidgets;
    const createHelpers = window.EveLibrary.createStatsRendererHelpers;
    const createActions = window.EveLibrary.createStatsRendererActions;

    if (!Kpi || !Charts || !Widgets || !createHelpers || !createActions) {
        console.warn('[EveLibrary.StatsRenderer] One or more renderer modules are missing.');
        return;
    }

    const helpers = createHelpers({ State, Search });
    const {
        escapeHtml,
        formatAverage,
        formatPercent,
        formatSigned,
        axisMax,
        getPrefix,
        getEntriesForStats,
        isFilmLikeEntry,
        getWorkspaceId
    } = helpers;

    const distributionModeByCategory = {};
    const breakdownModeByCategory = {};

    function getDistributionMode(categoryName) {
        return String(distributionModeByCategory[categoryName] || 'genre').toLowerCase() === 'tags' ? 'tags' : 'genre';
    }

    function getBreakdownMode(categoryName) {
        return String(breakdownModeByCategory[categoryName] || 'status').toLowerCase() === 'origin' ? 'origin' : 'status';
    }

    function updateCharts(categoryName) {
        const { entries } = getEntriesForStats(categoryName);
        Charts?.renderCharts?.({
            categoryName,
            entries,
            getPrefix,
            getBreakdownMode,
            getDistributionMode,
            axisMax,
            StatsCalc,
            ChartUtils,
            widgets: Widgets,
            escapeHtml
        });
    }

    function setDistributionMode(categoryName, mode) {
        distributionModeByCategory[categoryName] = String(mode || '').toLowerCase() === 'tags' ? 'tags' : 'genre';
        updateCharts(categoryName);
    }

    function setBreakdownMode(categoryName, mode) {
        breakdownModeByCategory[categoryName] = String(mode || '').toLowerCase() === 'origin' ? 'origin' : 'status';
        updateCharts(categoryName);
    }

    function renderStats(categoryName, container) {
        const { allTypeEntries, entries } = getEntriesForStats(categoryName);
        const prefix = getPrefix(categoryName);
        const safeCat = String(categoryName || '').replace(/'/g, "\\'");
        const activeEntries = StatsCalc.calcActiveReadingEntries
            ? StatsCalc.calcActiveReadingEntries(entries, 12)
            : [];

        const rating = StatsCalc.calcRatingOverview
            ? StatsCalc.calcRatingOverview(entries)
            : { personalAvg5: null, personalRatedCount: 0, unifiedAvg10: null, unifiedRatedCount: 0, apiAvg10: null, apiRatedCount: 0 };
        const kpis = StatsCalc.calcSummaryKpis
            ? StatsCalc.calcSummaryKpis(entries)
            : { totalSeries: entries.length, totalProgressUnits: 0, estimatedHours: 0, avgUnified10: null, topAuthorName: '', topAuthorCount: 0, averageConfidence: 0, highConfidenceShare: 0 };
        const hotTakes = StatsCalc.calcRatingDiscrepancies
            ? StatsCalc.calcRatingDiscrepancies(entries, 3)
            : { totalCompared: 0, lovedByMe: [] };

        container.innerHTML = `
            <div class="lib-stats-grid lib-stats-grid-advanced">
                <div class="lib-stat-card lib-stat-card-span-2">
                    <div class="lib-stat-head">
                        <h4>Currently Reading</h4>
                        <span class="lib-stat-summary">${activeEntries.length} active</span>
                    </div>
                    ${Widgets?.renderActiveCards ? Widgets.renderActiveCards({
                        categoryName,
                        items: activeEntries,
                        escapeHtml
                    }) : ''}
                </div>

                <div class="lib-stat-card lib-stat-card-span-2">
                    <h4>Summary Cards</h4>
                    <div class="lib-kpi-grid">
                        ${Kpi?.renderSummaryCards ? Kpi.renderSummaryCards({
                            entriesCount: entries.length,
                            totalCount: allTypeEntries.length,
                            kpis,
                            formatAverage,
                            formatPercent,
                            escapeHtml
                        }) : ''}
                    </div>
                </div>

                <div class="lib-stat-card">
                    <div class="lib-stat-head">
                        <h4>Primary Breakdown</h4>
                        <select class="lib-stat-select" onchange="window.EveLibrary.StatsRenderer.setBreakdownMode('${safeCat}', this.value)">
                            <option value="status" ${getBreakdownMode(categoryName) === 'status' ? 'selected' : ''}>Status</option>
                            <option value="origin" ${getBreakdownMode(categoryName) === 'origin' ? 'selected' : ''}>Origin</option>
                        </select>
                    </div>
                    <div class="lib-chart-wrapper"><canvas id="${prefix}breakdownChart"></canvas></div>
                </div>

                <div class="lib-stat-card">
                    <div class="lib-stat-head">
                        <h4>Distribution</h4>
                        <select class="lib-stat-select" onchange="window.EveLibrary.StatsRenderer.setDistributionMode('${safeCat}', this.value)">
                            <option value="genre" ${getDistributionMode(categoryName) === 'genre' ? 'selected' : ''}>Genres</option>
                            <option value="tags" ${getDistributionMode(categoryName) === 'tags' ? 'selected' : ''}>Tags</option>
                        </select>
                    </div>
                    <div class="lib-chart-wrapper lib-chart-wrapper-wide"><canvas id="${prefix}distributionChart"></canvas></div>
                </div>

                <div class="lib-stat-card"><h4>Taste Profile Radar</h4><div class="lib-chart-wrapper"><canvas id="${prefix}radarChart"></canvas></div></div>
                <div class="lib-stat-card"><h4>Rating Histogram</h4><div class="lib-chart-wrapper"><canvas id="${prefix}ratingChart"></canvas></div></div>
                <div class="lib-stat-card lib-stat-card-span-2"><h4>Publication Timeline</h4><div class="lib-chart-wrapper"><canvas id="${prefix}publicationChart"></canvas></div></div>
                <div class="lib-stat-card"><h4>Completeness Funnel</h4><div class="lib-chart-wrapper"><canvas id="${prefix}funnelChart"></canvas></div></div>
                <div class="lib-stat-card"><h4>Demographic Split</h4><div class="lib-chart-wrapper"><canvas id="${prefix}demographicChart"></canvas></div></div>
                <div class="lib-stat-card lib-stat-card-span-2"><h4>Tag Cloud</h4><div id="${prefix}tagCloud" class="lib-tag-cloud"></div></div>
                <div class="lib-stat-card lib-stat-card-span-2"><h4>Reading Habits (Last 30 Days)</h4><div class="lib-chart-wrapper"><canvas id="${prefix}habitsChart"></canvas></div></div>
                <div class="lib-stat-card lib-stat-card-span-2"><h4>Reading Progress (Monthly Chapters)</h4><div class="lib-chart-wrapper"><canvas id="${prefix}monthlyProgressChart"></canvas></div></div>
                <div class="lib-stat-card lib-stat-card-span-2"><h4>Length vs Quality</h4><div class="lib-chart-wrapper lib-chart-wrapper-tall"><canvas id="${prefix}scatterChart"></canvas></div></div>

                <div class="lib-stat-card">
                    <h4>Rating Overview</h4>
                    <p class="lib-stat-highlight">Unified Avg: ${formatAverage(rating.unifiedAvg10, 2)} / 10</p>
                    <div class="lib-stat-summary">Unified Rated: ${rating.unifiedRatedCount}</div>
                    <div class="lib-stat-summary">Personal Avg: ${formatAverage(rating.personalAvg5, 2)} / 5 (${rating.personalRatedCount})</div>
                    <div class="lib-stat-summary">API Avg: ${formatAverage(rating.apiAvg10, 2)} / 10 (${rating.apiRatedCount})</div>
                </div>

                <div class="lib-stat-card">
                    <h4>Hot Takes</h4>
                    <div class="lib-stat-summary">Compared entries: ${hotTakes.totalCompared}</div>
                    <ul class="lib-stat-list">
                        ${Widgets?.renderHotTakeList ? Widgets.renderHotTakeList({
                            items: hotTakes.lovedByMe,
                            emptyLabel: 'No positive deltas yet.',
                            escapeHtml,
                            formatSigned
                        }) : ''}
                    </ul>
                </div>
            </div>
        `;

        if (typeof Chart === 'undefined') {
            container.innerHTML += '<p class="error-msg">Chart.js library not loaded.</p>';
            return;
        }

        updateCharts(categoryName);
    }

    const actions = createActions({
        State,
        Storage,
        Ratings,
        renderStats,
        getPrefix,
        getWorkspaceId,
        isFilmLikeEntry
    });

    window.EveLibrary.StatsRenderer = {
        renderStats,
        setDistributionMode,
        setBreakdownMode,
        quickIncrement: actions.quickIncrement,
        applyTagFilter: actions.applyTagFilter
    };
})();
