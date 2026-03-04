window.EveLibrary = window.EveLibrary || {};

(function () {
    const PROVIDERS = ['MangaDex', 'MyAnimeList', 'AniList'];

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function uniqStrings(values) {
        const seen = new Set();
        const result = [];
        (Array.isArray(values) ? values : []).forEach(value => {
            const next = String(value || '').trim();
            if (!next) return;
            const key = next.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(next);
        });
        return result;
    }

    function splitPeopleNames(value) {
        return uniqStrings(
            String(value || '')
                .split(/\s*(?:,|\/|;|&|\band\b)\s*/i)
                .map(item => item.trim())
        );
    }

    function normalizeExactTitle(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function hasExactCaseMatch(bookmarkTitle, sourceMeta) {
        const target = normalizeExactTitle(bookmarkTitle);
        if (!target) return false;
        const titles = uniqStrings([
            sourceMeta?.title,
            ...(Array.isArray(sourceMeta?.synonyms) ? sourceMeta.synonyms : [])
        ]).map(normalizeExactTitle);
        return titles.includes(target);
    }

    function isPlaceholderImageUrl(url) {
        return /placeholder\.com|placehold\.co|text=No\+Cover/i.test(String(url || ''));
    }

    function normalizeLanguageFromCountryCode(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const upper = raw.toUpperCase();
        const languageByCode = {
            JA: 'Japanese',
            JP: 'Japanese',
            KO: 'Korean',
            KR: 'Korean',
            ZH: 'Chinese',
            CN: 'Chinese',
            TW: 'Chinese (Traditional)',
            HK: 'Chinese (Traditional)',
            EN: 'English',
            US: 'English',
            GB: 'English',
            AU: 'English',
            CA: 'English',
            ES: 'Spanish',
            MX: 'Spanish',
            AR: 'Spanish',
            CL: 'Spanish',
            CO: 'Spanish',
            PE: 'Spanish',
            PT: 'Portuguese',
            BR: 'Portuguese',
            FR: 'French',
            DE: 'German',
            IT: 'Italian',
            RU: 'Russian',
            TH: 'Thai',
            VI: 'Vietnamese',
            ID: 'Indonesian',
            TR: 'Turkish',
            PL: 'Polish',
            UA: 'Ukrainian'
        };

        if (languageByCode[upper]) return languageByCode[upper];
        if (/^[A-Z]{2,3}$/.test(upper)) return upper;
        return raw;
    }

    function mapSourceStatusToLibraryStatus(sourceStatus) {
        const normalized = String(sourceStatus || '').trim().toLowerCase();
        if (!normalized) return '';
        if (normalized === 'completed') return 'Completed';
        if (normalized === 'cancelled') return 'Dropped';
        if (normalized === 'ongoing' || normalized === 'hiatus' || normalized === 'upcoming') return 'Reading';
        return '';
    }

    function inferMediaTypes(sources, fallbackTypes) {
        const set = new Set();
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
            (Array.isArray(fallbackTypes) && fallbackTypes.length ? fallbackTypes : ['graphicNovels'])
                .forEach(type => set.add(type));
        }
        return Array.from(set);
    }

    function emptyApiRatings() {
        return {
            anilist: null,
            myanimelist: null,
            mangadex: null
        };
    }

    function mergeSourceMetadata(sources) {
        const Ratings = window.EveLibrary?.Ratings;
        let authors = [];
        let artists = [];
        let genres = [];
        let tags = [];
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
                sourceUrl = normalizeUrl(String(source?.providerUrl || source?.url || '').trim());
            }
            if (!imageUrl) {
                const candidate = normalizeUrl(String(source?.coverUrl || '').trim());
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
            sourceStatus = PROVIDERS
                .map(providerName => {
                    const key = String(providerName || '').toLowerCase();
                    if (key.includes('anilist')) return mergedSignals.anilist?.status;
                    if (key.includes('myanimelist')) return mergedSignals.myanimelist?.status;
                    if (key.includes('mangadex')) return mergedSignals.mangadex?.status;
                    return '';
                })
                .find(Boolean) || '';
        }

        const author = authors[0] || '';
        const authorAltNames = authors.filter(name => name.toLowerCase() !== author.toLowerCase()).slice(0, 24);

        return {
            author,
            authorAltNames,
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

    window.EveLibrary.BulkAutoUtils = {
        PROVIDERS,
        escapeHtml,
        hasExactCaseMatch,
        mapSourceStatusToLibraryStatus,
        inferMediaTypes,
        emptyApiRatings,
        mergeSourceMetadata
    };
})();
