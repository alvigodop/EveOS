window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

ctx.renderSearchUI = async function renderSearchUI(searchContainer, resultsContainer, categoryName) {
        if (!searchContainer || !resultsContainer) return;

        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const prefs = api.Cache ? await api.Cache.loadPrefs(resolvedCategory) : {
            liveResults: false,
            hybridResults: true,
            ttlMs: api.Cache?.DEFAULT_TTL_MS
        };

        searchContainer.innerHTML = `
            <div class="api-control-card">
                <div class="api-search-box">
                    <input type="text" class="api-search-input" placeholder="Search API, Wikipedia, and Fandom saved sources for this card...">
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
                        <select data-api-ttl-select="search" class="api-ttl-select">${ctx.buildTtlOptionsMarkup(prefs.ttlMs)}</select>
                    </label>
                    ${ctx.buildOpenModeMarkup(prefs.openMode, 'search')}
                    <button type="button" class="api-action-btn api-search-refresh-last-btn">Refresh Last</button>
                    <button type="button" class="api-action-btn api-search-open-unidex-btn">Open Unidex</button>
                    <button type="button" class="api-action-btn api-search-clear-cache-btn">Clear Cache Pool</button>
                    <span class="api-surface-note">This mirrors Scraper &gt; Unidex and searches API, Wikipedia, and Fandom data scoped to this card only.</span>
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
        const openModeRadios = searchContainer.querySelectorAll('[data-api-open-mode="search"]');
        const refreshLastButton = searchContainer.querySelector('.api-search-refresh-last-btn');
        const openUnidexButton = searchContainer.querySelector('.api-search-open-unidex-btn');
        const clearCacheButton = searchContainer.querySelector('.api-search-clear-cache-btn');
        const cachePoolList = searchContainer.querySelector('.api-cache-pool-list');

        ctx.refreshPool = function refreshPool() {
            ctx.wireUnifiedCacheList(cachePoolList, resolvedCategory, resultsContainer, input, {
                onRefresh: ctx.refreshPool
            });
        }

        if (!api.Manager) api.Manager = {};
        api.Manager.refreshSearchUnidexPool = ctx.refreshPool;

        ctx.executeSearch = function executeSearch(forceLive) {
            const nextQuery = String(input.value || '').trim();
            if (!nextQuery) return;
            
            const loadingCallback = window.SearchUIRenderer ? SearchUIRenderer.showLoading.bind(SearchUIRenderer) : null;

            ctx.runUnifiedSearch(nextQuery, resultsContainer, null, {
                categoryName: resolvedCategory,
                ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                liveResults: typeof forceLive === 'boolean' ? forceLive : liveToggle.checked,
                hybridResults: hybridToggle?.checked !== false,
                loadingCallback: loadingCallback,
                onAfterRender: ctx.refreshPool
            });
        }

        if (button) {
            button.onclick = function () { ctx.executeSearch(); };
        }

        if (input) {
            input.onkeypress = function (event) {
                if (event.key === 'Enter') ctx.executeSearch();
            };
        }

        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                ctx.persistLivePreference(resolvedCategory, liveToggle.checked, liveToggle);
            });
        }

        if (hybridToggle) {
            hybridToggle.addEventListener('change', function () {
                ctx.persistHybridPreference(resolvedCategory, hybridToggle.checked, hybridToggle);
            });
        }

        if (ttlSelect) {
            ttlSelect.addEventListener('change', function () {
                ctx.persistTtlPreference(resolvedCategory, ttlSelect.value, ttlSelect);
            });
        }

        openModeRadios.forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (!radio.checked) return;
                ctx.persistOpenModePreference(resolvedCategory, radio.value, radio);
            });
        });

        if (refreshLastButton) {
            refreshLastButton.addEventListener('click', async function () {
                const fallbackEntry = await ctx.getLatestCachedQuery(resolvedCategory, null);
                if (!String(input.value || '').trim() && fallbackEntry?.query) {
                    input.value = fallbackEntry.query;
                }
                ctx.executeSearch(true);
            });
        }

        if (openUnidexButton) {
            openUnidexButton.addEventListener('click', function () {
                const focusQuery = String(input?.value || '').trim();
                if (typeof window.switchCategoryTab === 'function') {
                    window.switchCategoryTab('scraper');
                }

                window.setTimeout(function () {
                    if (typeof window.updateSource === 'function') {
                        window.updateSource('unidex');
                    }

                    const scraperInput = document.getElementById('searchInput');
                    if (scraperInput && focusQuery) {
                        scraperInput.value = focusQuery;
                    }

                    const unidexPanelContainer = document.getElementById('unidex-scraper-panel-container');
                    if (unidexPanelContainer && window.EveOS?.API?.Manager?.renderUnidexPanelUI) {
                        window.EveOS.API.Manager.renderUnidexPanelUI(unidexPanelContainer, resolvedCategory, {
                            filterQuery: focusQuery
                        });
                    }
                }, 180);
            });
        }

        if (clearCacheButton) {
            clearCacheButton.addEventListener('click', async function () {
                if (api.Cache) {
                    await api.Cache.clearAll(resolvedCategory);
                    await api.Cache.savePrefs({
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                        liveResults: liveToggle?.checked === true,
                        hybridResults: hybridToggle?.checked !== false,
                        openMode: ctx.resolveOpenModePreference(resolvedCategory, searchContainer.querySelector('[data-api-open-mode="search"]:checked')?.value)
                    }, resolvedCategory);
                }
                ctx.clearKnowledgeCaches(resolvedCategory);
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                }
                ctx.updateResultsCount(0);
                ctx.refreshPool();
            });
        }

        ctx.refreshPool();
        ctx.syncHybridToggleState(hybridToggle?.checked !== false, hybridToggle);
        ctx.syncLiveToggleState(liveToggle?.checked === true, liveToggle);
        ctx.syncTtlState(Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs, ttlSelect);
        ctx.syncOpenModeState(prefs.openMode, Array.from(openModeRadios).find(function (radio) { return radio.checked; }) || null);
    }

ctx.renderScraperPanelUI = async function renderScraperPanelUI(container, categoryName, options = {}) {
        if (!container) return;

        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
        const providerLabel = providerKey ? ctx.getProviderLabel(providerKey) : 'All API Sources';
        const prefs = api.Cache ? await api.Cache.loadPrefs(resolvedCategory) : {
            liveResults: false,
            hybridResults: true,
            ttlMs: api.Cache?.DEFAULT_TTL_MS
        };

        container.innerHTML = `
            <div class="api-scraper-shell">
                <div class="api-scraper-hero">
                    <div>
                        <div class="api-scraper-kicker">Card-scoped provider cache</div>
                        <div class="api-scraper-provider-title">${ctx.escapeHtml(providerLabel)}</div>
                        <div class="api-scraper-provider-meta">
                            ${providerKey ? `Search and cache only ${ctx.escapeHtml(providerLabel)} results from the left search bar.` : 'Search all API providers from the left search bar. Cached queries and results stay inside this card.'}
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
                        <select data-api-ttl-select="scraper" class="api-ttl-select">${ctx.buildTtlOptionsMarkup(prefs.ttlMs)}</select>
                    </label>
                    ${ctx.buildOpenModeMarkup(prefs.openMode, 'scraper')}
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
        const openModeRadios = container.querySelectorAll('[data-api-open-mode="scraper"]');
        const refreshButton = container.querySelector('.api-scraper-refresh-btn');
        const clearButton = container.querySelector('.api-scraper-clear-btn');
        const cacheList = container.querySelector('.api-scraper-cache-list');

        ctx.ensureScraperLiveToggleBinding(resolvedCategory);
        ctx.syncHybridToggleState(prefs.hybridResults !== false, hybridToggle);
        ctx.syncLiveToggleState(prefs.liveResults === true, liveToggle);
        ctx.syncTtlState(Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs, ttlSelect);
        ctx.syncOpenModeState(prefs.openMode, Array.from(openModeRadios).find(function (radio) { return radio.checked; }) || null);

        ctx.beforeLoad = function beforeLoad() {
            if (typeof window.updateSource === 'function') {
                window.updateSource(providerKey || 'api');
            }
        }

        ctx.refreshPool = function refreshPool() {
            ctx.wireCacheList(cacheList, resolvedCategory, resultsContainer, queryInput, {
                beforeLoad: ctx.beforeLoad,
                interactionDelayMs: 340,
                providerKey: providerKey,
                onRefresh: ctx.refreshPool
            });
        }

        if (hybridToggle) {
            hybridToggle.addEventListener('change', function () {
                ctx.persistHybridPreference(resolvedCategory, hybridToggle.checked, hybridToggle);
            });
        }

        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                ctx.persistLivePreference(resolvedCategory, liveToggle.checked, liveToggle);
            });
        }

        if (ttlSelect) {
            ttlSelect.addEventListener('change', function () {
                ctx.persistTtlPreference(resolvedCategory, ttlSelect.value, ttlSelect);
            });
        }

        openModeRadios.forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (!radio.checked) return;
                ctx.persistOpenModePreference(resolvedCategory, radio.value, radio);
            });
        });

        if (refreshButton) {
            refreshButton.addEventListener('click', async function () {
                ctx.beforeLoad();
                const latestEntry = await ctx.getLatestCachedQuery(resolvedCategory, providerKey);
                const nextQuery = String(queryInput?.value || '').trim() || latestEntry?.query || '';
                if (!nextQuery || !resultsContainer) return;
                if (queryInput) queryInput.value = nextQuery;
                
                const loadingCallback = window.SearchUIRenderer ? SearchUIRenderer.showLoading.bind(SearchUIRenderer) : null;

                ctx.runAfterDelay(function () {
                    ctx.runSearch(nextQuery, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey: providerKey,
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                        liveResults: true,
                        hybridResults: hybridToggle?.checked !== false,
                        loadingCallback: loadingCallback,
                        onAfterRender: ctx.refreshPool
                    });
                }, 340);
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', async function () {
                if (api.Cache) {
                    await api.Cache.clearAll(resolvedCategory);
                    await api.Cache.savePrefs({
                        ttlMs: Number(ttlSelect?.value) > 0 ? Number(ttlSelect.value) : prefs.ttlMs,
                        liveResults: liveToggle?.checked === true,
                        hybridResults: hybridToggle?.checked !== false,
                        openMode: ctx.resolveOpenModePreference(resolvedCategory, container.querySelector('[data-api-open-mode="scraper"]:checked')?.value)
                    }, resolvedCategory);
                }
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    resultsContainer.style.display = 'none';
                }
                ctx.refreshPool();
                ctx.updateResultsCount(0);
            });
        }

        ctx.refreshPool();
    }
})(window.EveOS.API);