window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    function getRatingsApi() {
        return window.EveLibrary?.Ratings || null;
    }

    function getCurrentLinkedEntrySnapshot() {
        const editId = document.getElementById('editId')?.value;
        if (!editId) return null;
        const connectionsApi = window.EveLibrary?.ConnectionsAPI;
        return connectionsApi?.getLinkedEntry?.(editId)?.entry || null;
    }

    function parseApiRatingInputValue(inputId, provider) {
        const value = document.getElementById(inputId)?.value;
        const ratingsApi = getRatingsApi();
        if (!ratingsApi?.normalizeProviderScore) {
            return ns.readNumericRating(value);
        }
        return ratingsApi.normalizeProviderScore(provider, value);
    }

    ns.getRatingsApi = getRatingsApi;

    ns.readApiRatingsFromInputs = function () {
        const ratings = {
            anilist: parseApiRatingInputValue('libApiRatingAniList', 'anilist'),
            myanimelist: parseApiRatingInputValue('libApiRatingMAL', 'myanimelist'),
            mangadex: parseApiRatingInputValue('libApiRatingMangaDex', 'mangadex')
        };
        const ratingsApi = getRatingsApi();
        return ratingsApi?.sanitizeApiRatings ? ratingsApi.sanitizeApiRatings(ratings) : ratings;
    };

    ns.writeApiRatingsToInputs = function (apiRatings) {
        const ratingsApi = getRatingsApi();
        const safeRatings = ratingsApi?.sanitizeApiRatings ? ratingsApi.sanitizeApiRatings(apiRatings) : (apiRatings || {});

        const anilistInput = document.getElementById('libApiRatingAniList');
        const malInput = document.getElementById('libApiRatingMAL');
        const mangadexInput = document.getElementById('libApiRatingMangaDex');
        if (anilistInput) anilistInput.value = ns.formatRating(safeRatings.anilist);
        if (malInput) malInput.value = ns.formatRating(safeRatings.myanimelist);
        if (mangadexInput) mangadexInput.value = ns.formatRating(safeRatings.mangadex);
    };

    ns.refreshDerivedRatingsPreview = function (entryLike) {
        const ratingsApi = getRatingsApi();
        if (!ratingsApi?.computeDerivedRatings) return null;

        const linkedEntry = getCurrentLinkedEntrySnapshot();
        const rating = entryLike?.rating ?? (document.getElementById('libRating')?.value || '');
        const apiRatings = entryLike?.apiRatings || ns.readApiRatingsFromInputs();
        const sourceSignals = entryLike?.sourceSignals || linkedEntry?.sourceSignals || null;
        const sourceStatus = entryLike?.sourceStatus || linkedEntry?.sourceStatus || '';
        const derived = ratingsApi.computeDerivedRatings({
            ...(linkedEntry || {}),
            ...(entryLike || {}),
            rating,
            apiRatings,
            sourceSignals,
            sourceStatus
        });

        const avgInput = document.getElementById('libApiRatingAverage');
        const weightedInput = document.getElementById('libApiRatingWeighted');
        const unifiedInput = document.getElementById('libUnifiedRating');
        if (avgInput) avgInput.value = ns.formatRating(derived?.apiAverage10);
        if (weightedInput) weightedInput.value = ns.formatRating(derived?.apiWeighted10);
        if (unifiedInput) unifiedInput.value = ns.formatRating(derived?.activeValue);
        return derived;
    };

    ns.buildRatingsPatch = function () {
        const ratingsApi = getRatingsApi();
        const linkedEntry = getCurrentLinkedEntrySnapshot();
        const rating = document.getElementById('libRating')?.value || '';
        const apiRatings = ns.readApiRatingsFromInputs();
        const safeRatings = ratingsApi?.sanitizeApiRatings ? ratingsApi.sanitizeApiRatings(apiRatings) : apiRatings;
        const derivedRatings = ratingsApi?.computeDerivedRatings
            ? ratingsApi.computeDerivedRatings({
                ...(linkedEntry || {}),
                rating,
                apiRatings: safeRatings,
                sourceSignals: linkedEntry?.sourceSignals || null,
                sourceStatus: linkedEntry?.sourceStatus || ''
            })
            : null;
        return {
            apiRatings: safeRatings,
            derivedRatings
        };
    };
})(window.EveLinkForm);
