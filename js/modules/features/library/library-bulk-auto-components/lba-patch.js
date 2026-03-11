window.EveLibrary = window.EveLibrary || {};

(function () {
    const Utils = window.EveLibrary.BulkAutoUtils;
    if (!Utils) {
        console.warn('[EveLibrary.BulkAutoPatch] Utils module missing.');
        return;
    }

    function getCategoryLinks(categoryName) {
        return links.filter(link =>
            (link.category || 'Unsorted') === categoryName
            && link.workspace === config.activeWorkspace
        );
    }

    function buildLibraryPatch(link, currentEntry, matchedSources) {
        const Ratings = window.EveLibrary?.Ratings;
        const metadata = Utils.mergeSourceMetadata(matchedSources);
        const existingApiRatings = Ratings?.sanitizeApiRatings
            ? Ratings.sanitizeApiRatings(currentEntry?.apiRatings || Utils.emptyApiRatings())
            : (currentEntry?.apiRatings || Utils.emptyApiRatings());
        const nextApiRatings = matchedSources.length ? metadata.apiRatings : existingApiRatings;
        const existingSourceSignals = Ratings?.sanitizeSourceSignals
            ? Ratings.sanitizeSourceSignals(currentEntry?.sourceSignals)
            : (currentEntry?.sourceSignals || null);
        const nextSourceSignals = matchedSources.length && Ratings?.mergeSourceSignals
            ? Ratings.mergeSourceSignals(existingSourceSignals, metadata.sourceSignals)
            : existingSourceSignals;
        const nextSourceStatus = metadata.sourceStatus
            || (Ratings?.normalizeSourceStatus ? Ratings.normalizeSourceStatus(currentEntry?.sourceStatus || '') : (currentEntry?.sourceStatus || ''));
        const existingStatus = String(currentEntry?.status || '').trim();
        const mappedStatus = Utils.mapSourceStatusToLibraryStatus(nextSourceStatus);
        const nextStatus = existingStatus || mappedStatus || '';
        const nextRating = String(currentEntry?.rating ?? '').trim() ? String(currentEntry.rating) : '0';
        const nextMediaTypes = Utils.inferMediaTypes(matchedSources, currentEntry?.mediaTypes);
        
        const existingUrl = String(link.url || currentEntry?.sourceUrl || '').trim();
        const isGenericSearch = existingUrl.includes('google.com/search');
        const nextSourceUrl = (!existingUrl || isGenericSearch) && metadata.sourceUrl
            ? metadata.sourceUrl
            : normalizeUrl(existingUrl);

        const nextTags = metadata.tags.length
            ? metadata.tags
            : (Array.isArray(currentEntry?.tags) ? currentEntry.tags : []);

        const patch = {
            title: link.title || currentEntry?.title || 'Untitled',
            rating: nextRating,
            mediaTypes: nextMediaTypes,
            author: metadata.author || currentEntry?.author || '',
            authorAltNames: metadata.authorAltNames.length
                ? metadata.authorAltNames
                : (Array.isArray(currentEntry?.authorAltNames) ? currentEntry.authorAltNames : []),
            artist: metadata.artist || currentEntry?.artist || '',
            genre: metadata.genre || currentEntry?.genre || '',
            status: nextStatus,
            sourceStatus: nextSourceStatus || '',
            language: metadata.language || currentEntry?.language || '',
            sourceUrl: nextSourceUrl,
            image: metadata.imageUrl || currentEntry?.image || '',
            tags: nextTags,
            summary: (() => {
                const existingParts = (currentEntry?.summary || '').split('\n').map(s => s.trim()).filter(Boolean);
                const newParts = (metadata.summary || '').split('\n').map(s => s.trim()).filter(Boolean);
                const merged = [...existingParts];
                for (const part of newParts) {
                    if (!existingParts.includes(part)) {
                        merged.push(part);
                    }
                }
                return merged.join('\n\n');
            })(),
            apiRatings: nextApiRatings,
            sourceSignals: nextSourceSignals || undefined
        };

        if (Ratings?.computeDerivedRatings) {
            patch.derivedRatings = Ratings.computeDerivedRatings({
                rating: patch.rating,
                apiRatings: patch.apiRatings,
                sourceSignals: patch.sourceSignals,
                sourceStatus: patch.sourceStatus
            });
        }

        return patch;
    }

    window.EveLibrary.BulkAutoPatch = {
        getCategoryLinks,
        buildLibraryPatch
    };
})();
