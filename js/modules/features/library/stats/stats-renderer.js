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

    if (!Kpi || !Charts || !Widgets) {
        console.warn('[EveLibrary.StatsRenderer] One or more renderer modules are missing (kpi/widgets/charts).');
    }

    const distributionModeByCategory = {};
    const breakdownModeByCategory = {};

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatAverage(value, digits) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
    }

    function formatPercent(value) {
        const n = Number(value);
        return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '0%';
    }

    function formatSigned(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '0';
        const abs = Math.abs(n).toFixed(2).replace(/\.?0+$/, '');
        return n > 0 ? `+${abs}` : (n < 0 ? `-${abs}` : abs);
    }

    function axisMax(values) {
        const max = (values || []).reduce((acc, value) => Math.max(acc, Number(value) || 0), 0);
        if (max <= 0) return 1;
        if (max <= 3) return max + 1;
        if (max <= 10) return max + 2;
        return Math.ceil(max * 1.15);
    }

    function getPrefix(categoryName) {
        return `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
    }

    function getEntriesForStats(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const allTypeEntries = Search?.getTypeScopedEntries
            ? Search.getTypeScopedEntries(categoryName)
            : (lib.entries || []);
        const entries = Search?.getFilteredEntries
            ? Search.getFilteredEntries(categoryName)
            : allTypeEntries;
        return { allTypeEntries, entries };
    }

    function isFilmLikeEntry(entry) {
        const mediaTypes = Array.isArray(entry?.mediaTypes)
            ? entry.mediaTypes.map(item => String(item || '').toLowerCase())
            : [];
        if (mediaTypes.includes('films')) return true;
        if (mediaTypes.includes('graphicnovels') || mediaTypes.includes('novels')) return false;

        const episode = Number(entry?.episode);
        const chapter = Number(entry?.chapter ?? entry?.graphicChapter ?? entry?.novelChapter);
        return Number.isFinite(episode) && episode > 0 && (!Number.isFinite(chapter) || chapter <= 0);
    }

    function getWorkspaceId() {
        if (typeof State?.getCurrentWorkspaceId === 'function') {
            return State.getCurrentWorkspaceId();
        }
        if (window.eveState?.config?.activeWorkspace) return String(window.eveState.config.activeWorkspace);
        if (typeof config !== 'undefined' && config?.activeWorkspace) return String(config.activeWorkspace);
        return 'main';
    }

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

    function quickIncrement(categoryName, entryId) {
        const lib = State.getCategoryLibrary(categoryName);
        if (!lib || !Array.isArray(lib.entries)) return false;
        const entry = lib.entries.find(item => String(item?.id) === String(entryId));
        if (!entry) return false;

        if (isFilmLikeEntry(entry)) {
            const current = Number(entry.episode);
            entry.episode = Number.isFinite(current) ? current + 1 : 1;
        } else {
            const current = Number(entry.chapter ?? entry.graphicChapter ?? entry.novelChapter);
            const next = Number.isFinite(current) ? current + 1 : 1;
            entry.chapter = next;
            const mediaTypes = Array.isArray(entry.mediaTypes) ? entry.mediaTypes : [];
            if (!mediaTypes.length || mediaTypes.includes('graphicNovels')) {
                entry.graphicChapter = next;
            }
            if (mediaTypes.includes('novels')) {
                entry.novelChapter = next;
            }
        }

        entry.lastEdited = new Date().toISOString();
        if (Ratings?.applyDerivedRatings) {
            Ratings.applyDerivedRatings(entry);
        }
        Storage?.saveLibrary?.();
        if (window.EveLibrary?.ConnectionsAPI?.syncFromLibraryEntry) {
            window.EveLibrary.ConnectionsAPI.syncFromLibraryEntry(categoryName, entry, getWorkspaceId());
        }

        if (window.EveLibrary?.UI?.refreshLibrary) {
            window.EveLibrary.UI.refreshLibrary(categoryName);
        } else {
            const statsView = document.getElementById(`${getPrefix(categoryName)}stats-view`);
            if (statsView) renderStats(categoryName, statsView);
        }
        return true;
    }

    function applyTagFilter(categoryName, tag) {
        const prefix = getPrefix(categoryName);
        const input = document.getElementById(`${prefix}search-tags`);
        if (input) {
            const next = String(tag || '').trim();
            input.value = next;
        }
        if (window.EveLibrary?.UI?.refreshLibrary) {
            window.EveLibrary.UI.refreshLibrary(categoryName);
        } else {
            const statsView = document.getElementById(`${prefix}stats-view`);
            if (statsView) renderStats(categoryName, statsView);
        }
    }

    window.EveLibrary.StatsRenderer = {
        renderStats,
        setDistributionMode,
        setBreakdownMode,
        quickIncrement,
        applyTagFilter
    };
})();
