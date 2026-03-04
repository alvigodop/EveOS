window.EveLibrary = window.EveLibrary || {};

(function () {
    const Foundation = window.EveLibrary.RatingsEngineFoundation;
    const Settings = window.EveLibrary.RatingsEngineSettings;
    const Confidence = window.EveLibrary.RatingsEngineConfidence;
    if (!Foundation || !Settings || !Confidence) {
        console.warn('[EveLibrary.RatingsEngineDerived] Foundation/settings/confidence module missing.');
        return;
    }

    const {
        round,
        sanitizeApiRatings,
        mergeSourceSignals,
        extractSourceSignalsFromSources,
        normalizeSourceStatus
    } = Foundation;
    const {
        getSettings,
        normalizePersonalRatingTo10,
        pickActiveScaleValue
    } = Settings;
    const { computeConfidence } = Confidence;

    function computeApiAverage(apiRatings, settings) {
        const values = [];
        Foundation.PROVIDERS.forEach(provider => {
            if (!settings.enabledProviders[provider]) return;
            const value = apiRatings[provider];
            if (value === null) return;
            values.push(value);
        });
        if (!values.length) return null;
        const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
        return round(avg, 2);
    }

    function computeApiWeighted(apiRatings, settings) {
        let weightedTotal = 0;
        let weightSum = 0;
        Foundation.PROVIDERS.forEach(provider => {
            if (!settings.enabledProviders[provider]) return;
            const value = apiRatings[provider];
            if (value === null) return;
            const weight = settings.providerWeights[provider];
            if (!Number.isFinite(weight) || weight <= 0) return;
            weightedTotal += value * weight;
            weightSum += weight;
        });
        if (weightSum <= 0) return null;
        return round(weightedTotal / weightSum, 2);
    }

    function computeDerivedRatings(entryLike, options) {
        const settings = options && options.settings ? options.settings : getSettings(options?.config);
        const apiRatings = sanitizeApiRatings(entryLike?.apiRatings || entryLike);
        const sourceSignals = mergeSourceSignals(
            entryLike?.sourceSignals,
            extractSourceSignalsFromSources(entryLike?.sources)
        );
        const sourceStatus = normalizeSourceStatus(entryLike?.sourceStatus);
        const personal10 = normalizePersonalRatingTo10(entryLike?.rating ?? entryLike?.personalRating ?? entryLike?.personal10);
        const apiAverage10 = computeApiAverage(apiRatings, settings);
        const apiWeighted10 = computeApiWeighted(apiRatings, settings);

        let hybrid10 = null;
        if (personal10 !== null && apiWeighted10 !== null) {
            hybrid10 = round((settings.personalWeight * personal10) + ((1 - settings.personalWeight) * apiWeighted10), 2);
        } else if (personal10 !== null) {
            hybrid10 = personal10;
        } else if (apiWeighted10 !== null) {
            hybrid10 = apiWeighted10;
        }

        const confidenceData = computeConfidence(entryLike, settings, apiRatings, sourceSignals, hybrid10);
        const confidence = confidenceData.value;
        const activeValue = pickActiveScaleValue(settings.activeScale, {
            personal10,
            apiAverage10,
            apiWeighted10,
            hybrid10,
            confidence
        });

        return {
            personal10,
            apiAverage10,
            apiWeighted10,
            hybrid10,
            activeScale: settings.activeScale,
            activeValue,
            confidence,
            confidenceBreakdown: confidenceData.breakdown,
            sourceStatus
        };
    }

    function applyDerivedRatings(entry, options) {
        if (!entry || typeof entry !== "object") return entry;
        entry.apiRatings = sanitizeApiRatings(entry.apiRatings);
        entry.sourceSignals = mergeSourceSignals(entry.sourceSignals, extractSourceSignalsFromSources(entry.sources));
        if (!entry.sourceStatus) {
            const inferred = normalizeSourceStatus(entry.status);
            // Avoid treating normal personal progress labels as source status.
            if (inferred && inferred !== "Completed") {
                entry.sourceStatus = inferred;
            }
        }
        if (entry.sourceStatus) {
            entry.sourceStatus = normalizeSourceStatus(entry.sourceStatus);
        }
        entry.derivedRatings = computeDerivedRatings(entry, options);
        return entry;
    }

    function getActiveScale(configRef) {
        return getSettings(configRef).activeScale;
    }

    function getRatingValue(entry, scale, options) {
        if (!entry || typeof entry !== "object") return null;
        const settings = options?.settings || getSettings(options?.config);
        const derived = entry.derivedRatings && typeof entry.derivedRatings === "object"
            ? entry.derivedRatings
            : computeDerivedRatings(entry, { settings });
        const value = pickActiveScaleValue(scale || settings.activeScale, {
            personal10: derived.personal10,
            apiAverage10: derived.apiAverage10,
            apiWeighted10: derived.apiWeighted10,
            hybrid10: derived.hybrid10,
            confidence: derived.confidence
        });
        return value === null ? null : round(value, 2);
    }

    window.EveLibrary.RatingsEngineDerived = {
        computeDerivedRatings,
        applyDerivedRatings,
        getActiveScale,
        getRatingValue
    };
})();
