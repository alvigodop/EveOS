// --- BULK LIBRARY AUTO-ADD ---
(function () {
    let bulkLibraryCat = null;

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

    function getApiModules() {
        const api = window.EveOS?.API || {};
        return {
            mangaDex: api.MangaDex,
            jikan: api.Jikan,
            aniList: api.AniList,
            internals: api.DisplayInternals
        };
    }

    function ensureDependencies() {
        const modules = getApiModules();
        if (!modules.mangaDex?.searchMangaDex) throw new Error('MangaDex API module unavailable');
        if (!modules.jikan?.searchJikanManga || !modules.jikan?.searchJikanAnime) throw new Error('Jikan API module unavailable');
        if (!modules.aniList?.searchAniListManga || !modules.aniList?.searchAniListAnime) throw new Error('AniList API module unavailable');
        if (!modules.internals?.getMangaDexMeta || !modules.internals?.getJikanMeta || !modules.internals?.getAniListMeta) {
            throw new Error('API display internals unavailable');
        }
        if (!window.EveLibrary?.ConnectionsAPI) throw new Error('Library Connections API unavailable');
        return modules;
    }

    function collectProviderCandidates(rawResults, internals) {
        const candidates = {
            MangaDex: [],
            MyAnimeList: [],
            AniList: []
        };

        const mangadexData = Array.isArray(rawResults?.mangadex?.data) ? rawResults.mangadex.data : [];
        mangadexData.forEach(item => candidates.MangaDex.push(internals.getMangaDexMeta(item)));

        const jikanMangaData = Array.isArray(rawResults?.jikanManga?.data) ? rawResults.jikanManga.data : [];
        jikanMangaData.forEach(item => candidates.MyAnimeList.push(internals.getJikanMeta(item, 'Manga')));

        const jikanAnimeData = Array.isArray(rawResults?.jikanAnime?.data) ? rawResults.jikanAnime.data : [];
        jikanAnimeData.forEach(item => candidates.MyAnimeList.push(internals.getJikanMeta(item, 'Anime')));

        const aniManga = rawResults?.aniListManga?.data?.Page?.media;
        (Array.isArray(aniManga) ? aniManga : []).forEach(item => candidates.AniList.push(internals.getAniListMeta(item)));

        const aniAnime = rawResults?.aniListAnime?.data?.Page?.media;
        (Array.isArray(aniAnime) ? aniAnime : []).forEach(item => candidates.AniList.push(internals.getAniListMeta(item)));

        return candidates;
    }

    function pickExactSource(candidates, bookmarkTitle) {
        return (Array.isArray(candidates) ? candidates : []).find(source => hasExactCaseMatch(bookmarkTitle, source)) || null;
    }

    async function findExactSourcesForTitle(bookmarkTitle) {
        const modules = ensureDependencies();
        const [mangadex, jikanManga, jikanAnime, aniListManga, aniListAnime] = await Promise.all([
            modules.mangaDex.searchMangaDex(bookmarkTitle),
            modules.jikan.searchJikanManga(bookmarkTitle),
            modules.jikan.searchJikanAnime(bookmarkTitle),
            modules.aniList.searchAniListManga(bookmarkTitle),
            modules.aniList.searchAniListAnime(bookmarkTitle)
        ]);

        const providerCandidates = collectProviderCandidates({
            mangadex,
            jikanManga,
            jikanAnime,
            aniListManga,
            aniListAnime
        }, modules.internals);

        const selected = [];
        PROVIDERS.forEach(provider => {
            const matched = pickExactSource(providerCandidates[provider], bookmarkTitle);
            if (matched) selected.push(matched);
        });
        return selected;
    }

    function getCategoryLinks(categoryName) {
        return links.filter(link =>
            (link.category || 'Unsorted') === categoryName
            && link.workspace === config.activeWorkspace
        );
    }

    function buildLibraryPatch(link, currentEntry, matchedSources) {
        const Ratings = window.EveLibrary?.Ratings;
        const metadata = mergeSourceMetadata(matchedSources);
        const existingApiRatings = Ratings?.sanitizeApiRatings
            ? Ratings.sanitizeApiRatings(currentEntry?.apiRatings || emptyApiRatings())
            : (currentEntry?.apiRatings || emptyApiRatings());
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
        const mappedStatus = mapSourceStatusToLibraryStatus(nextSourceStatus);
        const nextStatus = existingStatus || mappedStatus || '';
        const nextRating = String(currentEntry?.rating ?? '').trim() ? String(currentEntry.rating) : '0';
        const nextMediaTypes = inferMediaTypes(matchedSources, currentEntry?.mediaTypes);
        const nextSourceUrl = metadata.sourceUrl || normalizeUrl(link.url || currentEntry?.sourceUrl || '');
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
            summary: metadata.summary || currentEntry?.summary || '',
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

    window.openBulkLibraryAutoModal = function (categoryName) {
        bulkLibraryCat = categoryName || 'Unsorted';
        const list = document.getElementById('bulkLibraryAutoList');
        const runButton = document.getElementById('btnRunBulkLibraryAuto');
        if (!list || !runButton) return;

        list.innerHTML = '';
        const categoryLinks = getCategoryLinks(bulkLibraryCat);
        if (!categoryLinks.length) {
            runButton.disabled = true;
            list.innerHTML = '<div style="padding:10px; color:#888;">No links in this category.</div>';
        } else {
            runButton.disabled = false;
            categoryLinks.forEach(link => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.padding = '6px 8px';
                row.style.borderBottom = '1px solid #333';
                row.innerHTML = `
                    <input type="checkbox" class="bulk-library-auto-check" data-id="${link.id}" style="margin-right:10px;" checked>
                    <div style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
                        <div style="font-weight:bold; font-size:0.9rem;">${escapeHtml(link.title || 'Untitled')}</div>
                        <div style="color:#666; font-size:0.8rem;">${escapeHtml(link.url || '')}</div>
                    </div>
                    <span id="bulk-lib-status-${link.id}" style="font-size:0.8rem; color:#999;">-</span>
                `;
                list.appendChild(row);
            });
        }

        const modal = document.getElementById('bulkLibraryAutoModal');
        if (modal) modal.style.display = 'flex';
    };

    window.toggleAllBulkLibraryAuto = function (checked) {
        document.querySelectorAll('.bulk-library-auto-check').forEach(checkbox => {
            checkbox.checked = !!checked;
        });
    };

    window.runBulkLibraryAutoUpdate = async function () {
        const selected = Array.from(document.querySelectorAll('.bulk-library-auto-check:checked'));
        if (!selected.length) {
            showToast('Select at least one bookmark.', 'warning');
            return;
        }

        let modules = null;
        try {
            modules = ensureDependencies();
        } catch (error) {
            showToast(error.message || 'Required modules are not loaded.', 'error');
            return;
        }

        const runButton = document.getElementById('btnRunBulkLibraryAuto');
        if (!runButton) return;
        const originalText = runButton.innerText;
        runButton.disabled = true;
        runButton.innerText = 'Processing...';

        const connections = window.EveLibrary.ConnectionsAPI;
        let processed = 0;
        let created = 0;
        let failed = 0;
        let providerMatches = 0;

        for (const checkbox of selected) {
            const id = checkbox.getAttribute('data-id');
            const link = links.find(item => String(item.id) === String(id));
            const status = document.getElementById(`bulk-lib-status-${id}`);
            if (!link) {
                failed++;
                if (status) status.textContent = 'ERR';
                continue;
            }

            if (status) {
                status.textContent = '...';
                status.style.color = '#999';
            }

            try {
                const matchedSources = await findExactSourcesForTitle(link.title || '');
                link.sources = matchedSources;

                const hadConnection = !!connections.findConnectionByLinkId(link.id);
                if (!hadConnection) {
                    connections.promoteLink(link.id);
                    created++;
                }
                connections.moveLinkedEntryToCategory(link.id, bulkLibraryCat || link.category || 'Unsorted');

                const linked = connections.getLinkedEntry(link.id);
                if (!linked?.entry) throw new Error('Failed to load linked entry');

                const patch = buildLibraryPatch(link, linked.entry, matchedSources);
                connections.updateLinkedEntry(link.id, patch);

                processed++;
                providerMatches += matchedSources.length;
                if (status) {
                    status.textContent = `${matchedSources.length}/3`;
                    status.style.color = '#8bc34a';
                    status.title = 'Matched provider sources (strict exact title)';
                }
            } catch (error) {
                failed++;
                if (status) {
                    status.textContent = 'ERR';
                    status.style.color = '#f44336';
                    status.title = String(error?.message || error);
                }
            }
        }

        if (typeof saveData === 'function') saveData();

        runButton.disabled = false;
        runButton.innerText = originalText;

        const summary = `Auto library update done: ${processed} processed, ${created} new entries, ${providerMatches} provider matches${failed ? `, ${failed} failed` : ''}.`;
        showToast(summary, failed ? 'warning' : 'success');
    };
})();
