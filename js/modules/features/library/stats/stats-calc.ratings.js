/**
 * Statistics Calculator - Ratings Metrics
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsCalcRatingModules = window.EveLibrary.StatsCalcRatingModules || {};

(function () {
    const modules = window.EveLibrary.StatsCalcRatingModules || {};
    if (!modules.overview || !modules.distribution) {
        console.warn('[EveLibrary.StatsCalcRatings] Helper modules missing.');
        return;
    }

    window.EveLibrary.StatsCalcRatings = Object.assign({}, modules.overview, modules.distribution);
})();
