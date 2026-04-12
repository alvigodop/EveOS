window.EveLibrary = window.EveLibrary || {};

(function () {
    const Foundation = window.EveLibrary.RatingsEngineFoundation;
    const Settings = window.EveLibrary.RatingsEngineSettings;
    const Derived = window.EveLibrary.RatingsEngineDerived;

    if (!Foundation || !Settings || !Derived) {
        console.warn('[EveLibrary.Ratings] Engine components are missing (foundation/settings/derived).');
        return;
    }

    window.EveLibrary.Ratings = {
        PROVIDERS: Foundation.PROVIDERS,
        DEFAULTS: Foundation.DEFAULTS,
        sourceNameToProvider: Foundation.sourceNameToProvider,
        normalizeProviderScore: Foundation.normalizeProviderScore,
        sanitizeApiRatings: Foundation.sanitizeApiRatings,
        createEmptyApiRatings: Foundation.createEmptyApiRatings,
        mergeApiRatings: Foundation.mergeApiRatings,
        extractApiRatingsFromSources: Foundation.extractApiRatingsFromSources,
        createEmptySourceSignals: Foundation.createEmptySourceSignals,
        sanitizeSourceSignals: Foundation.sanitizeSourceSignals,
        mergeSourceSignals: Foundation.mergeSourceSignals,
        extractSourceSignalsFromSources: Foundation.extractSourceSignalsFromSources,
        normalizeSourceStatus: Foundation.normalizeSourceStatus,
        normalizePersonalRatingTo10: Settings.normalizePersonalRatingTo10,
        ensureConfigDefaults: Settings.ensureConfigDefaults,
        getSettings: Settings.getSettings,
        getActiveScale: Derived.getActiveScale,
        computeDerivedRatings: Derived.computeDerivedRatings,
        applyDerivedRatings: Derived.applyDerivedRatings,
        getRatingValue: Derived.getRatingValue
    };
})();
