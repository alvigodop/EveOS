window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.BulkAutoModules = window.EveLibrary.BulkAutoModules || {};

(function () {
    window.EveLibrary.BulkAutoModules.createSourceUtils = function createSourceUtils(base) {
        const PROVIDERS = [
            'MangaDex', 'MyAnimeList', 'AniList',
            'Kitsu', 'TVmaze', 'MangaUpdates', 'ComicK',
            'OpenLibrary', 'WlnUpdates', 'iTunes'
        ];
        const uniqStrings = base.uniqStrings;
        const splitPeopleNames = base.splitPeopleNames;
        const normalizeLanguageFromCountryCode = base.normalizeLanguageFromCountryCode;
        const isPlaceholderImageUrl = base.isPlaceholderImageUrl;
        const emptyApiRatings = base.emptyApiRatings;

        function mapSourceStatusToLibraryStatus(sourceStatus, mediaTypes) {
            const normalized = String(sourceStatus || '').trim().toLowerCase();
            if (!normalized) return '';
            const typeList = Array.isArray(mediaTypes) ? mediaTypes : [];
            const hasFilms = typeList.includes('films');
            if (normalized === 'completed') return 'Completed';
            if (normalized === 'cancelled') return 'Dropped';
            if (normalized === 'ongoing') return hasFilms ? 'Watching' : 'Reading';
            if (normalized === 'upcoming') return hasFilms ? 'Plan to Watch' : 'Plan to Read';
            if (normalized === 'hiatus') return 'Hiatus';
            return '';
        }

        function extractTitleAltNames(source) {
            const formApi = window.EveLinkForm || null;
            if (formApi?.extractSourceTitleAltNames) {
                return formApi.extractSourceTitleAltNames(source);
            }
            const primary = String(source?.title || source?.name || '').trim().toLowerCase();
            return uniqStrings([
                ...(Array.isArray(source?.synonyms) ? source.synonyms : []),
                ...(Array.isArray(source?.altTitles) ? source.altTitles : []),
                ...(Array.isArray(source?.alternativeTitles) ? source.alternativeTitles : [])
            ]).filter(name => String(name || '').trim().toLowerCase() !== primary);
        }

        function inferMediaTypes(sources, fallbackTypes) {
            const set = new Set(Array.isArray(fallbackTypes) ? fallbackTypes : []);
            (Array.isArray(sources) ? sources : []).forEach(source => {
                const mediaType = String(source?.mediaType || '').toLowerCase();
                if (!mediaType) return;
                if (mediaType.includes('anime') || mediaType.includes('film') || mediaType.includes('movie') || mediaType.includes('tv')) {
                    set.add('films');
                    return;
                }
                if (mediaType.includes('novel')) {
                    set.add('novels');
                    return;
                }
                if (
                    mediaType.includes('manga')
                    || mediaType.includes('manhwa')
                    || mediaType.includes('manhua')
                    || mediaType.includes('comic')
                ) {
                    set.add('graphicNovels');
                }
            });

            if (!set.size) {
                set.add('graphicNovels');
            }
            return Array.from(set);
        }

        function mergeSourceMetadata(sources) {
            const Ratings = window.EveLibrary?.Ratings;
            let authors = [];
            let artists = [];
            let genres = [];
            let tags = [];
            let titleAltNames = [];
            let language = '';
            let sourceUrl = '';
            let imageUrl = '';
            let status = '';
            let sourceStatus = '';
            let summary = '';
            const apiRatings = emptyApiRatings();
            const sourceSignals = Ratings?.createEmptySourceSignals
                ? Ratings.createEmptySourceSignals()
                : null;

            (Array.isArray(sources) ? sources : []).forEach(source => {
                authors = uniqStrings([...authors, ...splitPeopleNames(source?.author)]);
                artists = uniqStrings([...artists, ...splitPeopleNames(source?.artist)]);
                titleAltNames = uniqStrings([...titleAltNames, ...extractTitleAltNames(source)]);
                genres = uniqStrings([...genres, ...(Array.isArray(source?.genres) ? source.genres : [])]);
                tags = uniqStrings([
                    ...tags,
                    ...(Array.isArray(source?.tags) ? source.tags : []),
                    ...(Array.isArray(source?.synonyms) ? source.synonyms : [])
                ]);

                if (!language) {
                    language = normalizeLanguageFromCountryCode(source?.countryOfOrigin);
                }
                if (!sourceUrl) {
                    const rawSourceUrl = String(source?.providerUrl || source?.url || '').trim();
                    sourceUrl = window.EveLinkForm?.normalizeStoredUrl
                        ? window.EveLinkForm.normalizeStoredUrl(rawSourceUrl)
                        : normalizeUrl(rawSourceUrl);
                }
                if (!imageUrl) {
                    const rawCoverUrl = String(source?.coverUrl || '').trim();
                    const candidate = window.EveLinkForm?.normalizeStoredUrl
                        ? window.EveLinkForm.normalizeStoredUrl(rawCoverUrl)
                        : normalizeUrl(rawCoverUrl);
                    if (candidate && !isPlaceholderImageUrl(candidate)) {
                        imageUrl = candidate;
                    }
                }
                if (!status) {
                    status = String(source?.status || '').trim();
                }
                if (!sourceStatus && Ratings?.normalizeSourceStatus) {
                    sourceStatus = Ratings.normalizeSourceStatus(source?.status);
                }
                if (!summary) {
                    summary = String(source?.description || '').trim();
                }

                if (Ratings?.sourceNameToProvider && Ratings?.normalizeProviderScore) {
                    const provider = Ratings.sourceNameToProvider(source?.source);
                    if (!provider) return;
                    const score = Ratings.normalizeProviderScore(provider, source?.score);
                    if (score !== null) {
                        apiRatings[provider] = score;
                    }
                }
            });

            const extractedSignals = Ratings?.extractSourceSignalsFromSources
                ? Ratings.extractSourceSignalsFromSources(sources)
                : sourceSignals;
            const mergedSignals = Ratings?.mergeSourceSignals
                ? Ratings.mergeSourceSignals(sourceSignals, extractedSignals)
                : extractedSignals;
            if (!sourceStatus && mergedSignals) {
                const Foundation = window.EveLibrary?.RatingsEngineFoundation;
                const providerKeys = Foundation?.PROVIDERS || ['anilist', 'myanimelist', 'mangadex'];
                sourceStatus = providerKeys
                    .map(function (key) {
                        return mergedSignals[key]?.status;
                    })
                    .find(Boolean) || '';
            }

            const author = authors[0] || '';
            const authorAltNames = authors.filter(name => name.toLowerCase() !== author.toLowerCase()).slice(0, 24);

            return {
                author,
                authorAltNames,
                titleAltNames: titleAltNames.slice(0, 32),
                artist: artists.join(', '),
                genre: genres.join(', '),
                tags: tags.slice(0, 40),
                language,
                sourceUrl,
                imageUrl,
                status,
                sourceStatus,
                summary,
                apiRatings,
                sourceSignals: mergedSignals
            };
        }

        return {
            PROVIDERS,
            mapSourceStatusToLibraryStatus,
            inferMediaTypes,
            mergeSourceMetadata
        };
    };
})();
