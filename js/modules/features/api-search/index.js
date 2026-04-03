window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const PROVIDER_CONFIG = [
        { key: 'mangadex', label: 'MangaDex', shortLabel: 'Dex' },
        { key: 'jikanManga', label: 'Jikan Manga', shortLabel: 'J-Manga' },
        { key: 'jikanAnime', label: 'Jikan Anime', shortLabel: 'J-Anime' },
        { key: 'anilistManga', label: 'AniList Manga', shortLabel: 'AL Manga' },
        { key: 'anilistAnime', label: 'AniList Anime', shortLabel: 'AL Anime' },
        { key: 'mangaupdates', label: 'MangaUpdates', shortLabel: 'MU' },
        { key: 'kitsuAnime', label: 'Kitsu Anime', shortLabel: 'K Anime' },
        { key: 'kitsuManga', label: 'Kitsu Manga', shortLabel: 'K Manga' },
        { key: 'tvmaze', label: 'TVmaze', shortLabel: 'TV' },
        { key: 'itunes', label: 'iTunes', shortLabel: 'iTunes' },
        { key: 'wlnupdates', label: 'WLNUpdates', shortLabel: 'WLN' },
        { key: 'openlibrary', label: 'OpenLibrary', shortLabel: 'Books' },
        { key: 'comick', label: 'ComicK', shortLabel: 'ComicK' }
    ];
    const PROVIDER_ORDER = PROVIDER_CONFIG.map(function (provider) {
        return [provider.key, provider.label];
    });
    const PROVIDER_KEYS = PROVIDER_CONFIG.map(function (provider) {
        return provider.key;
    });
    const PROVIDER_LABELS = PROVIDER_CONFIG.reduce(function (acc, provider) {
        acc[provider.key] = provider.label;
        return acc;
    }, {});
    const PROVIDER_SET = new Set(PROVIDER_KEYS);
    const TTL_OPTIONS = [
        { value: 60 * 60 * 1000, label: '1 hour' },
        { value: 6 * 60 * 60 * 1000, label: '6 hours' },
        { value: 24 * 60 * 60 * 1000, label: '24 hours' },
        { value: 7 * 24 * 60 * 60 * 1000, label: '7 days' }
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

    function isProviderSource(source) {
        return PROVIDER_SET.has(String(source || '').trim());
    }

    function getProviderLabel(providerKey) {
        return PROVIDER_LABELS[String(providerKey || '').trim()] || 'API Provider';
    }

    function buildTtlOptionsMarkup(selectedTtlMs) {
        const fallbackTtl = Number(selectedTtlMs) > 0 ? Number(selectedTtlMs) : Number(api.Cache?.DEFAULT_TTL_MS || (24 * 60 * 60 * 1000));
        return TTL_OPTIONS.map(function (option) {
            const selected = Number(option.value) === fallbackTtl ? 'selected' : '';
            return `<option value="${option.value}" ${selected}>${escapeHtml(option.label)}</option>`;
        }).join('');
    }

    function syncTtlState(ttlMs, origin) {
        const selectors = [
            '[data-api-ttl-select="search"]',
            '[data-api-ttl-select="scraper"]'
        ];

        selectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element === origin) return;
                element.value = String(ttlMs);
            });
        });
    }

    function persistTtlPreference(categoryName, ttlMs, origin) {
        const resolvedCategory = ensureCategoryContext(categoryName);
        const normalizedTtl = Number(ttlMs) > 0 ? Number(ttlMs) : Number(api.Cache?.DEFAULT_TTL_MS || (24 * 60 * 60 * 1000));
        if (api.Cache) {
            api.Cache.savePrefs({ ttlMs: normalizedTtl }, resolvedCategory);
        }
        syncTtlState(normalizedTtl, origin);
    }

    function filterSourcesByProvider(sources, providerKey) {
        if (!providerKey || !isProviderSource(providerKey)) {
            return sources || {};
        }
        return {
            [providerKey]: sources?.[providerKey]
        };
    }

    function mergeSources(baseSources, nextSources) {
        return {
            ...(baseSources && typeof baseSources === 'object' ? baseSources : {}),
            ...(nextSources && typeof nextSources === 'object' ? nextSources : {})
        };
    }

    async function fetchProviderResults(query, providerKey) {
        switch (providerKey) {
            case 'mangadex':
                return api.MangaDex.searchMangaDex(query);
            case 'jikanManga':
                return api.Jikan.searchJikanManga(query);
            case 'jikanAnime':
                return api.Jikan.searchJikanAnime(query);
            case 'anilistManga':
                return api.AniList.searchAniListManga(query);
            case 'anilistAnime':
                return api.AniList.searchAniListAnime(query);
            case 'mangaupdates':
                return api.MangaUpdates.searchMangaUpdates(query);
            case 'kitsuAnime':
                return api.Kitsu.searchKitsuAnime(query);
            case 'kitsuManga':
                return api.Kitsu.searchKitsuManga(query);
            case 'tvmaze':
                return api.TVmaze.searchTVmaze(query);
            case 'itunes':
                return api.iTunes.searchiTunes(query);
            case 'wlnupdates':
                return api.WlnUpdates.searchWlnUpdates(query);
            case 'openlibrary':
                return api.OpenLibrary.searchOpenLibrary(query);
            case 'comick':
                return api.ComicK.searchComicK(query);
            default:
                throw new Error(`Unsupported API provider source: ${providerKey}`);
        }
    }

    async function collectLiveResults(query, providerKey = null) {
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

        if (providerKey && isProviderSource(providerKey)) {
            return {
                [providerKey]: await fetchProviderResults(query, providerKey)
            };
        }

        const pairs = await Promise.all(PROVIDER_KEYS.map(async function (key) {
            return [key, await fetchProviderResults(query, key)];
        }));

        return pairs.reduce(function (acc, pair) {
            acc[pair[0]] = pair[1];
            return acc;
        }, {});
    }

    function renderSourceResults(sourceResults, resultsContainer, onSelect, providerKey = null) {
        const Display = api.Display;
        if (!Display || typeof Display.displayResults !== 'function') {
            throw new Error('Display module is not loaded.');
        }

        const visibleSources = filterSourcesByProvider(sourceResults || {}, providerKey);
        resultsContainer.style.display = 'block';
        Display.displayResults(visibleSources, resultsContainer, onSelect);
        updateResultsCount(countResults(visibleSources));
        return visibleSources;
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

    function renderCacheOnlyMessage(resultsContainer, query, providerKey = null) {
        if (!resultsContainer) return;
        const providerLabel = providerKey ? getProviderLabel(providerKey) : 'this view';
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = `
            <div style="padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03);">
                <div style="font-weight:600; margin-bottom:4px;">No cached API result for this card.</div>
                <div style="font-size:0.83rem; opacity:0.75;">
                    Query <strong>${escapeHtml(query)}</strong> has not been cached for <strong>${escapeHtml(providerLabel)}</strong> inside this card yet. Enable Hybrid or Live to fetch it.
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

    function buildCacheListMarkup(entries, emptyMessage, providerKey = null) {
        const visibleEntries = Array.isArray(entries) ? entries.filter(function (entry) {
            if (!providerKey || !isProviderSource(providerKey)) return true;
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) : [];

        if (!visibleEntries.length) {
            return `<div style="opacity:0.68; font-size:0.83rem;">${escapeHtml(emptyMessage)}</div>`;
        }

        return visibleEntries.map(function (entry) {
            const totalResults = providerKey && isProviderSource(providerKey)
                ? Number(entry.summary?.perSource?.[providerKey] || 0)
                : Number(entry.summary?.totalResults || 0);
            const providerBadges = PROVIDER_ORDER
                .map(function ([key, label]) {
                    const count = Number(entry.summary?.perSource?.[key] || 0);
                    if (providerKey && key !== providerKey) return '';
                    if (!count) return '';
                    return `<span class="api-provider-badge">${escapeHtml(label)} <strong>${count}</strong></span>`;
                })
                .filter(Boolean)
                .join('');

            return `
                <div class="api-cache-entry" data-query="${escapeHtml(entry.query)}">
                    <div class="api-cache-entry-header">
                        <div class="api-cache-entry-copy">
                            <div class="api-cache-entry-title">${escapeHtml(entry.query)}</div>
                            <div class="api-cache-entry-meta">${totalResults} results . updated ${escapeHtml(formatRelativeTime(entry.updatedAt))}</div>
                            <div class="api-cache-entry-expiry">${escapeHtml(formatExpiry(entry.expiresAt))}</div>
                        </div>
                        <div class="api-cache-actions">
                            <button type="button" class="api-cache-load-btn" data-query="${escapeHtml(entry.query)}">Load</button>
                            <button type="button" class="api-cache-refresh-btn" data-query="${escapeHtml(entry.query)}">Refresh</button>
                            <button type="button" class="api-cache-delete-btn" data-query="${escapeHtml(entry.query)}">Delete</button>
                        </div>
                    </div>
                    <div class="api-provider-badges">${providerBadges || '<span class="api-provider-empty">No provider hits stored.</span>'}</div>
                </div>
            `;
        }).join('');
    }

    function wireCacheList(container, categoryName, resultsContainer, queryInput, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const cacheEntries = api.Cache ? api.Cache.listQueries(resolvedCategory) : [];
        container.innerHTML = buildCacheListMarkup(cacheEntries, 'No API queries cached for this card yet.', options.providerKey);
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
                        providerKey: options.providerKey,
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
                        providerKey: options.providerKey,
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

    function getLatestCachedQuery(categoryName, providerKey = null) {
        const cacheEntries = api.Cache ? api.Cache.listQueries(categoryName) : [];
        if (!providerKey || !isProviderSource(providerKey)) {
            return cacheEntries[0] || null;
        }
        return cacheEntries.find(function (entry) {
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) || null;
    }

    function renderScraperSourceTabs(container, activeSource) {
        if (!container) return;

        container.innerHTML = PROVIDER_CONFIG.map(function (provider) {
            const isActive = String(activeSource || '').trim() === provider.key ? ' active' : '';
            return `
                <button class="source-toggle-btn${isActive}" data-source="${escapeHtml(provider.key)}" data-provider-source="true" onclick="updateSource('${escapeHtml(provider.key)}')">
                    <span class="icon">${escapeHtml(provider.shortLabel)}</span> ${escapeHtml(provider.label)}
                </button>
            `;
        }).join('');
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
        const providerKey = isProviderSource(options.providerKey) ? options.providerKey : null;
        const shouldUseLive = resolveLivePreference(resolvedCategory, options.liveResults);
        const shouldUseHybrid = resolveHybridPreference(resolvedCategory, options.hybridResults);
        const normalizedQuery = String(query).trim();
        const cachedEntry = api.Cache ? api.Cache.getQuery(normalizedQuery, resolvedCategory) : null;
        const cachedVisibleSources = filterSourcesByProvider(cachedEntry?.sources || {}, providerKey);
        const cachedVisibleCount = countResults(cachedVisibleSources);

        resultsContainer.style.display = 'block';

        if (!shouldUseLive && cachedEntry?.sources && cachedVisibleCount > 0) {
            if (api.Cache) api.Cache.touchQuery(normalizedQuery, resolvedCategory);
            const renderedSources = renderSourceResults(cachedEntry.sources, resultsContainer, onSelect, providerKey);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
            }
            return {
                sources: renderedSources,
                meta: {
                    fromCache: true,
                    providerKey,
                    summary: api.Cache?.summarizeSources?.(renderedSources) || { totalResults: 0 }
                }
            };
        }

        if (!shouldUseLive && !shouldUseHybrid) {
            renderCacheOnlyMessage(resultsContainer, normalizedQuery, providerKey);
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

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching ${escapeHtml(providerKey ? getProviderLabel(providerKey) : 'API providers')}...</div>`;
        updateResultsCount(0);

        try {
            const liveSources = await collectLiveResults(normalizedQuery, providerKey);
            const mergedSources = providerKey ? mergeSources(cachedEntry?.sources, liveSources) : liveSources;
            const storedEntry = api.Cache ? api.Cache.storeQuery(normalizedQuery, mergedSources, resolvedCategory, { ttlMs: options.ttlMs }) : null;
            const renderedSources = renderSourceResults(mergedSources, resultsContainer, onSelect, providerKey);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({ fromCache: false, entry: storedEntry, categoryName: resolvedCategory });
            }
            return {
                sources: renderedSources,
                meta: {
                    fromCache: false,
                    providerKey,
                    summary: api.Cache?.summarizeSources?.(renderedSources) || { totalResults: 0 }
                }
            };
        } catch (error) {
            console.error('API search error:', error);

            if (cachedEntry?.sources && cachedVisibleCount > 0) {
                if (api.Cache) api.Cache.touchQuery(normalizedQuery, resolvedCategory);
                const renderedSources = renderSourceResults(cachedEntry.sources, resultsContainer, onSelect, providerKey);
                if (typeof options.onAfterRender === 'function') {
                    options.onAfterRender({ fromCache: true, fallback: true, entry: cachedEntry, categoryName: resolvedCategory });
                }
                return {
                    sources: renderedSources,
                    meta: {
                        fromCache: true,
                        fallback: true,
                        providerKey,
                        summary: api.Cache?.summarizeSources?.(renderedSources) || { totalResults: 0 }
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
        const providerKey = isProviderSource(options.providerKey) ? options.providerKey : null;
        const cachedEntry = api.Cache.getQuery(query, resolvedCategory);
        if (!cachedEntry?.sources) return null;
        if (countResults(filterSourcesByProvider(cachedEntry.sources, providerKey)) < 1) return null;

        api.Cache.touchQuery(query, resolvedCategory);
        const renderedSources = renderSourceResults(cachedEntry.sources, resultsContainer, onSelect, providerKey);
        if (typeof options.onAfterRender === 'function') {
            options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
        }
        return {
            ...cachedEntry,
            renderedSources
        };
    }

    function renderSearchUI(searchContainer, resultsContainer, categoryName) {
        if (!searchContainer || !resultsContainer) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const prefs = api.Cache ? api.Cache.loadPrefs(resolvedCategory) : {
            liveResults: false,
            hybridResults: true,
            ttlMs: api.Cache?.DEFAULT_TTL_MS
        };

        searchContainer.innerHTML = `
            <div class="api-control-card">
                <div class="api-search-box">
                    <input type="text" class="api-search-input" placeholder="Search all API providers for this card...">
                    <button type="button" class="api-search-btn">Search</button>
                </div>
                <div class="api-preferences-row">
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-hybrid-toggle="search" ${prefs.hybridResults !== false ? 'checked' : ''}>
                        <span>Hybrid cache</span>
                    </label>
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-live-toggle="search" ${prefs.liveResults ? 'checked' : ''}>
                        <span>Live results</span>
                    </label>
                    <label class="api-select-chip">
                        <span>TTL</span>
                        <select data-api-ttl-select="search" class="api-ttl-select">${buildTtlOptionsMarkup(prefs.ttlMs)}</select>
                    </label>
                    <button type="button" class="api-action-btn api-search-refresh-last-btn">Refresh Last</button>
                    <button type="button" class="api-action-btn api-search-clear-cache-btn">Clear Cache Pool</button>
                    <span class="api-surface-note">Cache is isolated to this card only.</span>
                </div>
                <details class="api-cache-pool-details" open>
                    <summary>Cache Pool</summary>
                    <div class="api-cache-pool-list"></div>
                </details>
            </div>
        `;

        const input = searchContainer.querySelector('.api-search-input');
        const button = searchContainer.querySelector('.api-search-btn');
        const hybridToggle = searchContainer.querySelector('[data-api-hybrid-toggle="search"]');
        const liveToggle = searchContainer.querySelector('[data-api-live-toggle="search"]');
        const ttlSelect = searchContainer.querySelector('[data-api-ttl-select="search"]');
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
                ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
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

        if (ttlSelect) {
            ttlSelect.addEventListener('change', function () {
                persistTtlPreference(resolvedCategory, ttlSelect.value, ttlSelect);
            });
        }

        if (refreshLastButton) {
            refreshLastButton.addEventListener('click', function () {
                const fallbackEntry = getLatestCachedQuery(resolvedCategory, null);
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
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
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
        syncTtlState(Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs, ttlSelect);
    }

    function renderScraperPanelUI(container, categoryName, options = {}) {
        if (!container) return;

        const resolvedCategory = ensureCategoryContext(categoryName);
        const providerKey = isProviderSource(options.providerKey) ? options.providerKey : null;
        const providerLabel = providerKey ? getProviderLabel(providerKey) : 'All API Sources';
        const prefs = api.Cache ? api.Cache.loadPrefs(resolvedCategory) : {
            liveResults: false,
            hybridResults: true,
            ttlMs: api.Cache?.DEFAULT_TTL_MS
        };

        container.innerHTML = `
            <div class="api-scraper-shell">
                <div class="api-scraper-hero">
                    <div>
                        <div class="api-scraper-kicker">Card-scoped provider cache</div>
                        <div class="api-scraper-provider-title">${escapeHtml(providerLabel)}</div>
                        <div class="api-scraper-provider-meta">
                            ${providerKey ? `Search and cache only ${escapeHtml(providerLabel)} results from the left search bar.` : 'Search all API providers from the left search bar. Cached queries and results stay inside this card.'}
                        </div>
                    </div>
                    <div class="api-scraper-focus-pill">${providerKey ? 'Provider view' : 'All providers'}</div>
                </div>
                <div class="api-preferences-row">
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-hybrid-toggle="scraper" ${prefs.hybridResults !== false ? 'checked' : ''}>
                        <span>Hybrid cache</span>
                    </label>
                    <label class="api-toggle-chip">
                        <input type="checkbox" data-api-live-toggle="scraper" ${prefs.liveResults ? 'checked' : ''}>
                        <span>Live results</span>
                    </label>
                    <label class="api-select-chip">
                        <span>TTL</span>
                        <select data-api-ttl-select="scraper" class="api-ttl-select">${buildTtlOptionsMarkup(prefs.ttlMs)}</select>
                    </label>
                    <button type="button" class="api-action-btn api-scraper-refresh-btn">Refresh Last</button>
                    <button type="button" class="api-action-btn api-scraper-clear-btn">Clear Cache Pool</button>
                </div>
                <div class="api-scraper-cache-list"></div>
            </div>
        `;

        const queryInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('results');
        const hybridToggle = container.querySelector('[data-api-hybrid-toggle="scraper"]');
        const liveToggle = container.querySelector('[data-api-live-toggle="scraper"]');
        const ttlSelect = container.querySelector('[data-api-ttl-select="scraper"]');
        const refreshButton = container.querySelector('.api-scraper-refresh-btn');
        const clearButton = container.querySelector('.api-scraper-clear-btn');
        const cacheList = container.querySelector('.api-scraper-cache-list');

        ensureScraperLiveToggleBinding(resolvedCategory);
        syncHybridToggleState(prefs.hybridResults !== false, hybridToggle);
        syncLiveToggleState(prefs.liveResults === true, liveToggle);
        syncTtlState(Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs, ttlSelect);

        function beforeLoad() {
            if (typeof window.updateSource === 'function') {
                window.updateSource(providerKey || 'api');
            }
        }

        function refreshPool() {
            wireCacheList(cacheList, resolvedCategory, resultsContainer, queryInput, {
                beforeLoad: beforeLoad,
                interactionDelayMs: 340,
                providerKey: providerKey,
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

        if (ttlSelect) {
            ttlSelect.addEventListener('change', function () {
                persistTtlPreference(resolvedCategory, ttlSelect.value, ttlSelect);
            });
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', function () {
                beforeLoad();
                const latestEntry = getLatestCachedQuery(resolvedCategory, providerKey);
                const nextQuery = String(queryInput?.value || '').trim() || latestEntry?.query || '';
                if (!nextQuery || !resultsContainer) return;
                if (queryInput) queryInput.value = nextQuery;
                runAfterDelay(function () {
                    runSearch(nextQuery, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey: providerKey,
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
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
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
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
        getProviderLabel,
        isProviderSource,
        renderScraperSourceTabs,
        renderSearchUI,
        renderScraperPanelUI,
        refreshScraperPanel: renderScraperPanelUI,
        loadCachedQuery,
        runSearch
    };
})(window.EveOS.API);

