/**
 * Statistics Calculator Facade
 * Implementation is split across stats-calc.shared.js, stats-calc.ratings.js, and stats-calc.analytics.js.
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Shared = window.EveLibrary.StatsCalcShared;
    const Ratings = window.EveLibrary.StatsCalcRatings;
    const Analytics = window.EveLibrary.StatsCalcAnalytics;

    if (!Shared || !Ratings || !Analytics) {
        console.warn('[EveLibrary.StatsCalc] One or more stats modules are missing (shared/ratings/analytics).');
        return;
    }

    window.EveLibrary.StatsCalc = {
        calcGenreCounts: Shared.calcGenreCounts,
        calcTagCounts: Shared.calcTagCounts,
        calcOriginCounts: Shared.calcOriginCounts,
        calcAvgRating: Shared.calcAvgRating,
        calcStatusCounts: Shared.calcStatusCounts,
        calcProgress: Shared.calcProgress,

        calcRatingOverview: Ratings.calcRatingOverview,
        calcRatingDiscrepancies: Ratings.calcRatingDiscrepancies,
        calcGenreRatingStats: Ratings.calcGenreRatingStats,
        calcRatingDistribution: Ratings.calcRatingDistribution,
        calcUnifiedRatingDistribution: Ratings.calcUnifiedRatingDistribution,
        calcBacklogFunnel: Ratings.calcBacklogFunnel,
        calcLibraryHealth: Ratings.calcLibraryHealth,

        calcTopGenres: Analytics.calcTopGenres,
        calcCreatorLoyalty: Analytics.calcCreatorLoyalty,
        calcDropoffStats: Analytics.calcDropoffStats,
        calcReadingVelocity: Analytics.calcReadingVelocity,
        calcMonthlyReadingProgress: Analytics.calcMonthlyReadingProgress,
        calcDailyReadingHabits: Analytics.calcDailyReadingHabits,
        calcEstimatedReadingTime: Analytics.calcEstimatedReadingTime,
        calcPublicationYearCounts: Analytics.calcPublicationYearCounts,
        calcTagCloud: Analytics.calcTagCloud,
        calcLengthVsQuality: Analytics.calcLengthVsQuality,
        calcDemographicCounts: Analytics.calcDemographicCounts,
        calcSummaryKpis: Analytics.calcSummaryKpis,
        calcActiveReadingEntries: Analytics.calcActiveReadingEntries
    };
})();
