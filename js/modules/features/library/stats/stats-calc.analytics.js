/**
 * Statistics Calculator Analytics Facade
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Reading = window.EveLibrary.StatsCalcAnalyticsReading;
    const Insights = window.EveLibrary.StatsCalcAnalyticsInsights;

    if (!Reading || !Insights) {
        console.warn('[EveLibrary.StatsCalcAnalytics] Missing analytics reading or analytics insights module.');
        return;
    }

    window.EveLibrary.StatsCalcAnalytics = {
        ...Reading,
        ...Insights
    };
})();
