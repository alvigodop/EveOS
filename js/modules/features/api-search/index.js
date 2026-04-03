window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const PROVIDER_ORDER = [
        ['mangadex', 'MangaDex'],
        ['jikanManga', 'Jikan Manga'],
        ['jikanAnime', 'Jikan Anime'],
        ['anilistManga', 'AniList Manga'],
        ['anilistAnime', 'AniList Anime'],
        ['mangaupdates', 'MangaUpdates'],
        ['kitsuAnime', 'Kitsu Anime'],
        ['kitsuManga', 'Kitsu Manga'],
        ['tvmaze', 'TVmaze'],
        ['itunes', 'iTunes'],
        ['wlnupdates', 'WLNUpdates'],
        ['openlibrary', 'OpenLibrary'],
        ['comick', 'ComicK']
    ];

    function normalizeCategoryName(categoryName) {
        return String(categoryName || window.currentCategoryCtx || window.StorageManager?.categoryContext || '').trim();
    }

    function ensureCategoryContext(categoryName) {
        const resolvedCategory = normalizeCategoryName(categoryName);
        if (resolvedCategory && window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
            window.StorageManager.setCategoryContext(resolvedCategory);
        }
        return resolvedCategory;
    }

    function countResults(sources) {
        const summary = api.Cache?.summarizeSources ? api.Cache.summarizeSources(sources || {}) : { totalResults: 0 };
        return Number(summary.totalResults || 0);
    }

    function updateResultsCount(total) {
        const counter = document.getElementById('resultCount');
        if (counter) {
            counter.textContent = String(Number(total) || 0);
        }
    }

    function formatRelativeTime(timestamp) {
        if (!(Number(timestamp) > 0)) return 'unknown';
        const diffMs = Math.max(0, Date.now() - Number(timestamp));
        const diffMinutes = Math.round(diffMs / 60000);
        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.round(diffHours / 24);
        return `${diffDays}d ago`;
    }

    function formatExpiry(expiresAt) {
        if (!(Number(expiresAt) > 0)) return 'No expiry';
        const diffMs = Number(expiresAt) - Date.now();
        if (diffMs <= 0) return 'Expired';
        const diffMinutes = Math.round(diffMs / 60000);
        if (diffMinutes < 60) return `Expires in ${diffMinutes}m`;
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return `Expires in ${diffHours}h`;
        const diffDays = Math.round(diffHours / 24);
        return `Expires in ${diffDays}d`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function collectLiveResults(query) {
        const Core = api.Core;
        const MangaDex = api.MangaDex;
        const Jikan = api.Jikan;
        const AniList = api.AniList;
        const MangaUpdates = api.MangaUpdates;
        const Kitsu = api.Kitsu;
        const TVmaze = api.TVmaze;
        const iTunes = api.iTunes;
        const WlnUpdates = api.WlnUpdates;
        const OpenLibrary = api.OpenLibrary;
        const ComicK = api.ComicK;

        if (!Core || !MangaDex || !Jikan || !AniList || !MangaUpdates || !Kitsu || !TVmaze || !iTunes || !WlnUpdates || !OpenLibrary || !ComicK) {
            throw new Error('API modules are not fully loaded.');
        }

        const [
            mangadexResults,
            jikanMangaResults,
            jikanAnimeResults,
            anilistMangaResults,
            anilistAnimeResults,
            mangaupdatesResults,
            kitsuAnimeResults,
            kitsuMangaResults,
            tvmazeResults,
            itunesResults,
            wlnupdatesResults,
            openlibraryResults,
            comickResults
        ] = await Promise.all([
            MangaDex.searchMangaDex(query),
            Jikan.searchJikanManga(query),
            Jikan.searchJikanAnime(query),
            AniList.searchAniListManga(query),
            AniList.searchAniListAnime(query),
            MangaUpdates.searchMangaUpdates(query),
            Kitsu.searchKitsuAnime(query),
            Kitsu.searchKitsuManga(query),
            TVmaze.searchTVmaze(query),
            iTunes.searchiTunes(query),
            WlnUpdates.searchWlnUpdates(query),
            OpenLibrary.searchOpenLibrary(query),
            ComicK.searchComicK(query)
        ]);

        return {
            mangadex: mangadexResults,
            jikanManga: jikanMangaResults,
            jikanAnime: jikanAnimeResults,
            anilistManga: anilistMangaResults,
            anilistAnime: anilistAnimeResults,
            mangaupdates: mangaupdatesResults,
            kitsuAnime: kitsuAnimeResults,
            kitsuManga: kitsuMangaResults,
            tvmaze: tvmazeResults,
            itunes: itunesResults,
            wlnupdates: wlnupdatesResults,
            openlibrary: openlibraryResults,
            comick: comickResults
        };
    }

    function renderSourceResults(sourceResults, resultsContainer, onSelect) {
        const Display = api.Display;
        if (!Display || typeof Display.displayResults !== 'function') {
            throw new Error('Display module is not loaded.');
        }

        resultsContainer.style.display = 'block';
        Display.displayResults(sourceResults || {}, resultsContainer, onSelect);
        updateResultsCount(countResults(sourceResults));
        return sourceResults;
    }

    function resolveLivePreference(categoryName, explicitValue) {
        if (typeof explicitValue === 'boolean') return explicitValue;
        return api.Cache ? api.Cache.loadPrefs(categoryName).liveResults === true : false;
    }

    function resolveHybridPreference(categoryName, explicitValue) {
        if (typeof explicitValue === 'boolean') return explicitValue;
        return api.Cache ? api.Cache.loadPrefs(categoryName).hybridResults !== false : true;
    }

    function runAfterDelay(callback, delayMs) {
        if (!(typeof callback === 'function')) return;
        if (Number(delayMs) > 0) {
            window.setTimeout(callback, Number(delayMs));
            return;
        }
        callback();
    }

    function renderCacheOnlyMessage(resultsContainer, query) {
        if (!resultsContainer) return;
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = `
            <div style="padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03);">
                <div style="font-weight:600; margin-bottom:4px;">No cached API result for this card.</div>
                <div style="font-size:0.83rem; opacity:0.75;">
                    Query <strong>${escapeHtml(query)}</strong> has not been cached inside this card yet. Enable Hybrid or Live to fetch it.
                </div>
            </div>
        `;
        updateResultsCount(0);
    }

    function syncLiveToggleState(enabled, origin) {
        const liveSelectors = [
            '[data-api-live-toggle="shared"]',
            '[data-api-live-toggle="search"]',
            '[data-api-live-toggle="scraper"]',
            '#liveSearchToggle'
        ];

        liveSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                if ('checked' in element) {
                    element.checked = enabled;
                }
            });
        });
    }

    function syncHybridToggleState(enabled, origin) {
        const hybridSelectors = [
            '[data-api-hybrid-toggle="shared"]',
            '[data-api-hybrid-toggle="search"]',
            '[data-api-hybrid-toggle="scraper"]',
            '#hybridSearchToggle'
        ];

        hybridSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                if ('checked' in element) {
                    element.checked = enabled;
                }
            });
        });
    }

    function persistLivePreference(categoryName, enabled, origin) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        if (api.Cache) {
            api.Cache.savePrefs({ liveResults: enabled === true }, resolvedCategory);
        }
        syncLiveToggleState(enabled === true, origin);
    }

    function persistHybridPreference(categoryName, enabled, origin) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        if (api.Cache) {
            api.Cache.savePrefs({ hybridResults: enabled !== false }, resolvedCategory);
        }
        syncHybridToggleState(enabled !== false, origin);
    }

    function buildCacheListMarkup(entries, emptyMessage) {
        if (!Array.isArray(entries) || !entries.length) {
            return `<div style="opacity:0.68; font-size:0.83rem;">${escapeHtml(emptyMessage)}</div>`;
        }

        return entries.map(function (entry) {
            const providerBadges = PROVIDER_ORDER
                .map(function ([key, label]) {
                    const count = Number(entry.summary?.perSource?.[key] || 0);
                    if (!count) return '';
                    return `<span style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:999px; background:rgba(255,255,255,0.08); font-size:0.72rem;">${escapeHtml(label)} <strong>${count}</strong></span>`;
                })
                .filter(Boolean)
                .join('');

            return `
                <div class="api-cache-entry" data-query="${escapeHtml(entry.query)}" style="display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03);">
                    <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                        <div style="min-width:0;">
                            <div style="font-weight:600; word-break:break-word;">${escapeHtml(entry.query)}</div>
                            <div style="font-size:0.77rem; opacity:0.7;">${entry.summary?.totalResults || 0} results . updated ${escapeHtml(formatRelativeTime(entry.updatedAt))}</div>
                            <div style="font-size:0.74rem; opacity:0.58;">${escapeHtml(formatExpiry(entry.expiresAt))}</div>
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                            <button type="button" class="api-cache-load-btn" data-query="${escapeHtml(entry.query)}">Load</button>
                            <button type="button" class="api-cache-refresh-btn" data-query="${escapeHtml(entry.query)}">Refresh</button>
                            <button type="button" class="api-cache-delete-btn" data-query="${escapeHtml(entry.query)}">Delete</button>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">${providerBadges || '<span style="opacity:0.55; font-size:0.78rem;">No provider hits stored.</span>'}</div>
                </div>
            `;
        }).join('');
    }

    function wireCacheList(container, categoryName, resultsContainer, queryInput, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const cacheEntries = api.Cache ? api.Cache.listQueries(resolvedCategory) : [];
        container.innerHTML = buildCacheListMarkup(cacheEntries, 'No API queries cached for this card yet.');
        const interactionDelayMs = Number(options.interactionDelayMs) > 0 ? Number(options.interactionDelayMs) : 0;

        function assignQuery(query) {
            if (!queryInput) return;
            queryInput.value = query;
        }

        container.querySelectorAll('.api-cache-load-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                assignQuery(query);
                if (options.beforeLoad) options.beforeLoad(query);
                runAfterDelay(function () {
                    loadCachedQuery(query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        onAfterRender: options.onRefresh
                    });
                }, interactionDelayMs);
            });
        });

        container.querySelectorAll('.api-cache-refresh-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                assignQuery(query);
                if (options.beforeLoad) options.beforeLoad(query);
                runAfterDelay(function () {
                    runSearch(query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        liveResults: true,
                        onAfterRender: function () {
                            if (typeof options.onRefresh === 'function') options.onRefresh();
                        }
                    });
                }, interactionDelayMs);
            });
        });

        container.querySelectorAll('.api-cache-delete-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query || !api.Cache) return;
                api.Cache.deleteQuery(query, resolvedCategory);
                wireCacheList(container, resolvedCategory, resultsContainer, queryInput, options);
            });
        });
    }

    function getLatestCachedQuery(categoryName) {
        const cacheEntries = api.Cache ? api.Cache.listQueries(categoryName) : [];
        return cacheEntries[0] || null;
    }

    function ensureScraperLiveToggleBinding(categoryName) {
        const liveToggle = document.getElementById('liveSearchToggle');
        const hybridToggle = document.getElementById('hybridSearchToggle');

        if (liveToggle) {
            const enabled = resolveLivePreference(categoryName);
            liveToggle.checked = enabled;

            if (liveToggle.dataset.apiLiveBound !== '1') {
                liveToggle.dataset.apiLiveBound = '1';
                liveToggle.addEventListener('change', function () {
                    persistLivePreference(categoryName, liveToggle.checked, liveToggle);
                });
            }
        }

        if (hybridToggle) {
            const enabled = resolveHybridPreference(categoryName);
            hybridToggle.checked = enabled;

            if (hybridToggle.dataset.apiHybridBound !== '1') {
                hybridToggle.dataset.apiHybridBound = '1';
                hybridToggle.addEventListener('change', function () {
                    persistHybridPreference(categoryName, hybridToggle.checked, hybridToggle);
                });
            }
        }
    }

    async function runSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ensureCategoryContext(options.categoryName);
        const shouldUseLive = resolveLivePreference(resolvedCategory, options.liveResults);
        const shouldUseHybrid = resolveHybridPreference(resolvedCategory, options.hybridResults);
        const normalizedQuery = String(query).trim();
        const cachedEntry = api.Cache ? api.Cache.getQuery(normalizedQuery, resolvedCategory) : null;

        resultsContainer.style.display = 'block';

        if (!shouldUseLive && cachedEntry?.sources) {
            if (api.Cache) api.Cache.touchQuery(normalizedQuery, resolvedCategory);
            renderSourceResults(cachedEntry.sources, resultsContainer, onSelect);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
            }
            return {
                sources: cachedEntry.sources,
                meta: {
                    fromCache: true,
                    summary: cachedEntry.summary || api.Cache?.summarizeSources?.(cachedEntry.sources) || { totalResults: 0 }
                }
            };
        }

        if (!shouldUseLive && !shouldUseHybrid) {
            renderCacheOnlyMessage(resultsContainer, normalizedQuery);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({
                    fromCache: false,
                    cacheMiss: true,
                    categoryName: resolvedCategory
                });
            }
            return {
                sources: {},
                meta: {
                    fromCache: false,
                    cacheMiss: true,
                    summary: { totalResults: 0 }
                }
            };
        }

        resultsContainer.innerHTML = '<div style="padding:10px;">Searching APIs...</div>';
        updateResultsCount(0);

        try {
            const sourceResults = await collectLiveResults(normalizedQuery);
            const storedEntry = api.Cache ? api.Cache.storeQuery(normalizedQuery, sourceResults, resolvedCategory) : null;
            renderSourceResults(sourceResults, resultsContainer, onSelect);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({ fromCache: false, entry: storedEntry, categoryName: resolvedCategory });
            }
            return {
                sources: sourceResults,
                meta: {
                    fromCache: false,
                    summary: storedEntry?.summary || api.Cache?.summarizeSources?.(sourceResults) || { totalResults: 0 }
                }
            };
        } catch (error) {
            console.error('API search error:', error);

            if (cachedEntry?.sources) {
                if (api.Cache) api.Cache.touchQuery(normalizedQuery, resolvedCategory);
                renderSourceResults(cachedEntry.sources, resultsContainer, onSelect);
                if (typeof options.onAfterRender === 'function') {
                    options.onAfterRender({ fromCache: true, fallback: true, entry: cachedEntry, categoryName: resolvedCategory });
                }
                return {
                    sources: cachedEntry.sources,
                    meta: {
                        fromCache: true,
                        fallback: true,
                        summary: cachedEntry.summary || api.Cache?.summarizeSources?.(cachedEntry.sources) || { totalResults: 0 }
                    }
                };
            }

            resultsContainer.innerHTML = 'An error occurred while searching.<br><pre style="text-align:left; font-size:12px; color:red;">' + (error.stack || error.message || error) + '</pre>';
            return null;
        }
    }

    function loadCachedQuery(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer || !api.Cache) return null;

        const resolvedCategory = ensureCategoryContext(options.categoryName);
        const cachedEntry = api.Cache.getQuery(query, resolvedCategory);
        if (!cachedEntry?.sources) return null;

        api.Cache.touchQuery(query, resolvedCategory);
        renderSourceResults(cachedEntry.sources, resultsContainer, onSelect);
        if (typeof options.onAfterRender === 'function') {
            options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
        }
        return cachedEntry;
    }

    function renderSearchUI(searchContainer, resultsContainer, categoryName) {
        if (!searchContainer || !resultsContainer) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const prefs = api.Cache ? api.Cache.loadPrefs(resolvedCategory) : { liveResults: false };

        searchContainer.innerHTML = `
            <div class="api-search-box" style="display:flex; gap:8px; margin-bottom:10px;">
                <input type="text" class="api-search-input" placeholder="Search Manga / Anime / Comics / Books..." style="flex:1; padding:6px 8px;">
                <button type="button" class="api-search-btn" style="padding:6px 10px;">Search</button>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
                <label style="display:inline-flex; align-items:center; gap:6px; font-size:0.84rem;">
                    <input type="checkbox" data-api-hybrid-toggle="search" ${prefs.hybridResults !== false ? 'checked' : ''}>
                    <span>Hybrid cache</span>
                </label>
                <label style="display:inline-flex; align-items:center; gap:6px; font-size:0.84rem;">
                    <input type="checkbox" data-api-live-toggle="search" ${prefs.liveResults ? 'checked' : ''}>
                    <span>Live results</span>
                </label>
                <button type="button" class="api-search-refresh-last-btn" style="padding:4px 8px;">Refresh Last</button>
                <button type="button" class="api-search-clear-cache-btn" style="padding:4px 8px;">Clear Cache Pool</button>
                <span style="font-size:0.78rem; opacity:0.64;">Cache is scoped to this card only.</span>
            </div>
            <details class="api-cache-pool-details" open>
                <summary style="cursor:pointer; margin-bottom:8px;">Cache Pool</summary>
                <div class="api-cache-pool-list" style="display:flex; flex-direction:column; gap:8px;"></div>
            </details>
        `;

        const input = searchContainer.querySelector('.api-search-input');
        const button = searchContainer.querySelector('.api-search-btn');
        const hybridToggle = searchContainer.querySelector('[data-api-hybrid-toggle="search"]');
        const liveToggle = searchContainer.querySelector('[data-api-live-toggle="search"]');
        const refreshLastButton = searchContainer.querySelector('.api-search-refresh-last-btn');
        const clearCacheButton = searchContainer.querySelector('.api-search-clear-cache-btn');
        const cachePoolList = searchContainer.querySelector('.api-cache-pool-list');

        function refreshPool() {
            wireCacheList(cachePoolList, resolvedCategory, resultsContainer, input, {
                onRefresh: refreshPool
            });
        }

        function executeSearch(forceLive) {
            const nextQuery = String(input.value || '').trim();
            if (!nextQuery) return;
            runSearch(nextQuery, resultsContainer, null, {
                categoryName: resolvedCategory,
                liveResults: typeof forceLive === 'boolean' ? forceLive : liveToggle.checked,
                hybridResults: hybridToggle?.checked !== false,
                onAfterRender: refreshPool
            });
        }

        if (button) {
            button.onclick = function () { executeSearch(); };
        }

        if (input) {
            input.onkeypress = function (event) {
                if (event.key === 'Enter') executeSearch();
            };
        }

        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                persistLivePreference(resolvedCategory, liveToggle.checked, liveToggle);
            });
        }

        if (hybridToggle) {
            hybridToggle.addEventListener('change', function () {
                persistHybridPreference(resolvedCategory, hybridToggle.checked, hybridToggle);
            });
        }

        if (refreshLastButton) {
            refreshLastButton.addEventListener('click', function () {
                const fallbackEntry = getLatestCachedQuery(resolvedCategory);
                if (!String(input.value || '').trim() && fallbackEntry?.query) {
                    input.value = fallbackEntry.query;
                }
                executeSearch(true);
            });
        }

        if (clearCacheButton) {
            clearCacheButton.addEventListener('click', function () {
                if (api.Cache) {
                    api.Cache.clearAll(resolvedCategory);
                    api.Cache.savePrefs({
                        liveResults: liveToggle?.checked === true,
                        hybridResults: hybridToggle?.checked !== false
                    }, resolvedCategory);
                }
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                }
                updateResultsCount(0);
                refreshPool();
            });
        }

        refreshPool();
        syncHybridToggleState(hybridToggle?.checked !== false, hybridToggle);
        syncLiveToggleState(liveToggle?.checked === true, liveToggle);
    }

    function renderScraperPanelUI(container, categoryName) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const prefs = api.Cache ? api.Cache.loadPrefs(resolvedCategory) : { liveResults: false };

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="font-size:0.83rem; opacity:0.78;">
                    Search all API providers from the left search bar. Cached queries and results stay inside this card.
                </div>
                <label style="display:inline-flex; align-items:center; gap:8px; font-size:0.84rem;">
                    <input type="checkbox" data-api-hybrid-toggle="scraper" ${prefs.hybridResults !== false ? 'checked' : ''}>
                    <span>Hybrid cache</span>
                </label>
                <label style="display:inline-flex; align-items:center; gap:8px; font-size:0.84rem;">
                    <input type="checkbox" data-api-live-toggle="scraper" ${prefs.liveResults ? 'checked' : ''}>
                    <span>Live results</span>
                </label>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="api-scraper-refresh-btn">Refresh Last</button>
                    <button type="button" class="api-scraper-clear-btn">Clear Cache Pool</button>
                </div>
                <div class="api-scraper-cache-list" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
        `;

        const queryInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('results');
        const hybridToggle = container.querySelector('[data-api-hybrid-toggle="scraper"]');
        const liveToggle = container.querySelector('[data-api-live-toggle="scraper"]');
        const refreshButton = container.querySelector('.api-scraper-refresh-btn');
        const clearButton = container.querySelector('.api-scraper-clear-btn');
        const cacheList = container.querySelector('.api-scraper-cache-list');

        ensureScraperLiveToggleBinding(resolvedCategory);
        syncHybridToggleState(prefs.hybridResults !== false, hybridToggle);
        syncLiveToggleState(prefs.liveResults === true, liveToggle);

        function beforeLoad() {
            if (typeof window.updateSource === 'function') {
                window.updateSource('api');
            }
        }

        function refreshPool() {
            wireCacheList(cacheList, resolvedCategory, resultsContainer, queryInput, {
                beforeLoad: beforeLoad,
                interactionDelayMs: 340,
                onRefresh: refreshPool
            });
        }

        if (hybridToggle) {
            hybridToggle.addEventListener('change', function () {
                persistHybridPreference(resolvedCategory, hybridToggle.checked, hybridToggle);
            });
        }

        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                persistLivePreference(resolvedCategory, liveToggle.checked, liveToggle);
            });
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', function () {
                beforeLoad();
                const latestEntry = getLatestCachedQuery(resolvedCategory);
                const nextQuery = String(queryInput?.value || '').trim() || latestEntry?.query || '';
                if (!nextQuery || !resultsContainer) return;
                if (queryInput) queryInput.value = nextQuery;
                runAfterDelay(function () {
                    runSearch(nextQuery, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        liveResults: true,
                        hybridResults: hybridToggle?.checked !== false,
                        onAfterRender: refreshPool
                    });
                }, 340);
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', function () {
                if (api.Cache) {
                    api.Cache.clearAll(resolvedCategory);
                    api.Cache.savePrefs({
                        liveResults: liveToggle?.checked === true,
                        hybridResults: hybridToggle?.checked !== false
                    }, resolvedCategory);
                }
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                }
                refreshPool();
                updateResultsCount(0);
            });
        }

        refreshPool();
    }

    api.Manager = {
        collectLiveResults,
        renderSearchUI,
        renderScraperPanelUI,
        refreshScraperPanel: renderScraperPanelUI,
        loadCachedQuery,
        runSearch
    };
})(window.EveOS.API);

