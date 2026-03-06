/**
 * Statistics Calculator Shared Facade
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const SharedUtils = window.EveLibrary.StatsCalcSharedUtils;
    const SharedMetrics = window.EveLibrary.StatsCalcSharedMetrics;

    if (!SharedUtils || !SharedMetrics) {
        console.warn('[EveLibrary.StatsCalcShared] Missing shared utils or shared metrics module.');
        return;
    }

    window.EveLibrary.StatsCalcShared = {
        ...SharedUtils,
        ...SharedMetrics
    };
})();
