// --- BOOKMARK FOCUS MODAL METADATA HELPERS ---
window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    if (ns.metadataReady) return;
    function getEmptyApiRatings() {
        var ratingsApi = window.EveLibrary?.Ratings;
        if (ratingsApi?.createEmptyApiRatings) return ratingsApi.createEmptyApiRatings();
        return {
            anilist: null, myanimelist: null, mangadex: null,
            kitsu: null, tvmaze: null, mangaupdates: null, comick: null,
            openlibrary: null, wlnupdates: null, itunes: null
        };
    }

    function parseIntOrZero(value) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function normalizeList(values) {
        const formApi = window.EveLinkForm || {};
        const source = [];
        function collect(value) {
            if (Array.isArray(value)) {
                value.forEach(collect);
                return;
            }
            if (value && typeof value === 'object') {
                Object.values(value).forEach(collect);
                return;
            }
            source.push(value);
        }
        collect(values);
        if (typeof formApi.parseUniqueCsvList === 'function') {
            return formApi.parseUniqueCsvList(source.join(', '));
        }
        const seen = new Set();
        return source.join(', ')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function mergeUnique(existing, incoming) {
        const formApi = window.EveLinkForm || {};
        if (typeof formApi.mergeUniqueValues === 'function') {
            return formApi.mergeUniqueValues(existing || [], incoming || []);
        }
        const seen = new Set();
        return [...(existing || []), ...(incoming || [])]
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function buildLibraryPatch(entry) {
        window.EveLibraryNotesSections?.syncFocusRawFromHuman?.();
        const status = document.getElementById('bookmarkFocusStatus')?.value || '';
        const rating = document.getElementById('bookmarkFocusRating')?.value || '';
        const graphicChapter = parseIntOrZero(document.getElementById('bookmarkFocusGraphicChapter')?.value);
        const novelChapter = parseIntOrZero(document.getElementById('bookmarkFocusNovelChapter')?.value);
        const season = parseIntOrZero(document.getElementById('bookmarkFocusSeason')?.value);
        const episode = parseIntOrZero(document.getElementById('bookmarkFocusEpisode')?.value);
        const summary = document.getElementById('bookmarkFocusSummary')?.value.trim() || '';
        const titleAltNames = normalizeList(document.getElementById('bookmarkFocusTitleAltNames')?.value || '');

        const patch = {
            status,
            rating,
            graphicChapter,
            novelChapter,
            season,
            episode,
            chapter: graphicChapter > 0 ? graphicChapter : novelChapter,
            summary,
            titleAltNames
        };

        if (Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length) {
            patch.mediaTypes = entry.mediaTypes.slice();
        }

        return patch;
    }

    function getSafeApiRatings(value) {
        const ratingsApi = window.EveLibrary?.Ratings;
        if (ratingsApi?.sanitizeApiRatings) {
            return ratingsApi.sanitizeApiRatings(value);
        }
        return {
            ...getEmptyApiRatings(),
            ...(value || {})
        };
    }

    function buildMetadataPatch(link, entry) {
        const formApi = window.EveLinkForm || {};
        const ratingsApi = window.EveLibrary?.Ratings;
        const sources = Array.isArray(link?.sources) ? link.sources : [];

        let authors = mergeUnique(normalizeList(entry?.author ? [entry.author] : []), normalizeList(entry?.authorAltNames));
        let titleAltNames = normalizeList(entry?.titleAltNames || entry?.altTitles);
        let artists = normalizeList(entry?.artist);
        let genres = normalizeList(entry?.genre);
        let tags = normalizeList(entry?.tags);
        let language = String(entry?.language || '').trim();
        let sourceUrl = String(entry?.sourceUrl || '').trim();
        let image = String(link?.coverImage || entry?.image || entry?.imageUrl || '').trim();
        let sourceStatus = '';
        let apiRatings = getSafeApiRatings(entry?.apiRatings);

        sources.forEach(source => {
            const metadata = typeof formApi.buildSourceMetadata === 'function'
                ? formApi.buildSourceMetadata(source)
                : null;
            if (!metadata) return;

            authors = mergeUnique(authors, normalizeList(metadata.authors));
            titleAltNames = mergeUnique(titleAltNames, normalizeList(metadata.titleAltNames));
            artists = mergeUnique(artists, normalizeList(metadata.artists));
            genres = mergeUnique(genres, normalizeList(metadata.genres));
            tags = mergeUnique(tags, normalizeList(metadata.tags));

            if (!language && metadata.language) language = String(metadata.language).trim();
            if (!sourceUrl && metadata.sourceUrl) sourceUrl = String(metadata.sourceUrl).trim();
            if (!image && metadata.imageUrl) image = String(metadata.imageUrl).trim();
            if (!sourceStatus && metadata.status) sourceStatus = String(metadata.status).trim();

            if (ratingsApi?.mergeApiRatings) {
                apiRatings = ratingsApi.mergeApiRatings(apiRatings, metadata.apiRatings || getEmptyApiRatings());
            }
        });

        if (ratingsApi?.extractApiRatingsFromSources && ratingsApi?.mergeApiRatings) {
            const extracted = ratingsApi.extractApiRatingsFromSources(sources);
            apiRatings = ratingsApi.mergeApiRatings(apiRatings, extracted);
        }

        const currentAuthor = String(entry?.author || '').trim();
        const author = currentAuthor || authors[0] || '';
        const authorKey = author.toLowerCase();
        const authorAltNames = mergeUnique(
            normalizeList(entry?.authorAltNames),
            authors.filter(item => String(item || '').trim().toLowerCase() !== authorKey)
        );

        const patch = {
            author,
            authorAltNames,
            titleAltNames,
            artist: artists.join(', '),
            genre: genres.join(', '),
            tags,
            language,
            sourceUrl: sourceUrl || (window.EveLinkForm?.normalizeStoredUrl
                ? window.EveLinkForm.normalizeStoredUrl(String(link?.url || '').trim())
                : normalizeUrl(String(link?.url || '').trim())),
            image,
            apiRatings
        };

        if (!String(entry?.status || '').trim() && sourceStatus) {
            patch.status = sourceStatus;
        }

        return patch;
    }

    Object.assign(ns, {
        buildLibraryPatch,
        buildMetadataPatch
    });
    ns.metadataReady = true;
})();
