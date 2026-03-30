window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};
    if (shared.derivedMetricsReady) return;

    const {
        uniqueNonEmpty,
        splitLibraryFieldValues,
        normalizeLanguageLabel,
        normalizeStatusLabel
    } = shared;

    if (!uniqueNonEmpty || !splitLibraryFieldValues || !normalizeLanguageLabel || !normalizeStatusLabel) {
        console.warn('[EveBookmarkFolders] Derived metrics helpers missing; metrics not initialized.');
        return;
    }

    function getDerivedTagValues(link, entry) {
        return uniqueNonEmpty([
            ...(Array.isArray(link?.tags) ? link.tags : []),
            ...splitLibraryFieldValues(entry?.tags)
        ]);
    }

    function getDerivedGenreValues(entry) {
        return uniqueNonEmpty([
            ...splitLibraryFieldValues(entry?.genre),
            ...splitLibraryFieldValues(entry?.genres)
        ]);
    }

    function getDerivedAuthorValues(entry) {
        return uniqueNonEmpty([
            ...splitLibraryFieldValues(entry?.author),
            ...splitLibraryFieldValues(entry?.authors),
            ...splitLibraryFieldValues(entry?.authorAltNames),
            ...splitLibraryFieldValues(entry?.writer)
        ]);
    }

    function getDerivedLanguageValues(link, entry) {
        const values = uniqueNonEmpty([
            ...splitLibraryFieldValues(link?.language),
            ...splitLibraryFieldValues(entry?.language),
            ...splitLibraryFieldValues(entry?.languages),
            ...splitLibraryFieldValues(entry?.originalLanguage)
        ]);
        return uniqueNonEmpty(values.map((value) => normalizeLanguageLabel(value)));
    }

    function getDerivedStatusValue(link, entry) {
        const libraryStatus = entry?.libraryStatus;
        const raw = libraryStatus?.label || libraryStatus?.name || libraryStatus?.id || entry?.status || link?.status || '';
        const normalized = normalizeStatusLabel(raw);
        return normalized || null;
    }

    function getDerivedRatingValue(link, entry) {
        const candidates = [
            entry?.derivedRatings?.activeValue,
            entry?.derivedRatings?.unified,
            entry?.derivedRatings?.selectedRating10,
            entry?.derivedRatings?.hybrid10,
            entry?.apiRating,
            entry?.personalRating,
            entry?.rating,
            link?.rating,
            link?.priority === 'high' ? 8 : null
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric;
            }
        }
        return null;
    }

    function getDerivedConfidenceValue(entry) {
        const candidates = [
            entry?.derivedRatings?.confidence,
            entry?.confidence
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric)) {
                if (numeric <= 1) return numeric;
                return Math.max(0, Math.min(1, numeric / 10));
            }
        }
        return null;
    }

    function getDerivedProgressValue(entry) {
        const candidates = [
            entry?.chapter,
            entry?.graphicChapter,
            entry?.novelChapter,
            entry?.episode,
            entry?.chapterTotal,
            entry?.chapters,
            entry?.episodeTotal,
            entry?.episodes
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric) && numeric > 0) return numeric;
        }
        return null;
    }

    function getDerivedDemographicValue(entry) {
        const values = uniqueNonEmpty([
            ...splitLibraryFieldValues(entry?.demographic),
            ...splitLibraryFieldValues(entry?.demographics),
            ...splitLibraryFieldValues(entry?.audience)
        ]);
        return values[0] || null;
    }

    function getDerivedPublicationValue(entry) {
        const candidates = [
            entry?.publicationYear,
            entry?.year,
            entry?.releaseYear,
            entry?.publishedYear,
            entry?.startYear
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric) && numeric >= 1900 && numeric <= 2100) {
                return Math.floor(numeric);
            }
        }

        const textCandidates = [entry?.releaseDate, entry?.publishedAt, entry?.dateAdded];
        for (let i = 0; i < textCandidates.length; i += 1) {
            const date = new Date(textCandidates[i]);
            const year = Number(date.getUTCFullYear());
            if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
                return year;
            }
        }
        return null;
    }

    Object.assign(shared, {
        getDerivedTagValues,
        getDerivedGenreValues,
        getDerivedAuthorValues,
        getDerivedLanguageValues,
        getDerivedStatusValue,
        getDerivedRatingValue,
        getDerivedConfidenceValue,
        getDerivedProgressValue,
        getDerivedDemographicValue,
        getDerivedPublicationValue
    });

    shared.derivedMetricsReady = true;
})(window.EveBookmarkFolders);
