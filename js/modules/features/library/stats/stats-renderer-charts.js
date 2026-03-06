/**
 * Library Stats Renderer - Chart Module
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsRendererChartModules = window.EveLibrary.StatsRendererChartModules || {};

(function () {
    const modules = window.EveLibrary.StatsRendererChartModules || {};
    if (!modules.summary || !modules.progress) {
        console.warn('[EveLibrary.StatsRendererCharts] Helper modules missing.');
        return;
    }

    function renderCharts(params) {
        modules.summary.renderSummaryCharts(params);
        modules.progress.renderProgressCharts(params);
    }

    window.EveLibrary.StatsRendererCharts = {
        renderCharts
    };
})();
