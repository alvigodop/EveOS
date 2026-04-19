window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.unidexPanelReady) return;

    ctx.renderUnidexPanelUI = async function renderUnidexPanelUI(container, categoryName, options = {}) {
        if (!container) return;

        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const filterQuery = String(options.filterQuery || '').trim();
        container.innerHTML = `
            <div class="api-scraper-shell unidex-scraper-shell">
                <div class="api-scraper-hero">
                    <div>
                        <div class="api-scraper-kicker">Unified Knowledge Base</div>
                        <div class="api-scraper-provider-title">Unidex</div>
                        <div class="api-scraper-provider-meta">Group saved wiki sources, fandom domains, and cached API queries under one source identity for this card.</div>
                    </div>
                    <div class="api-scraper-focus-pill">Knowledge Base</div>
                </div>
                <div class="api-cache-pool-list unidex-source-list">
                    ${await ctx.buildUnidexManagementMarkup(resolvedCategory, filterQuery)}
                </div>
            </div>
        `;

        const resultsContainer = document.getElementById('results');
        const queryInput = document.getElementById('searchInput');

        ctx.refreshPanel = function refreshPanel() {
            ctx.renderUnidexPanelUI(container, resolvedCategory, { filterQuery });
        };

        ctx.getGroup = async function getGroup(groupKey) {
            return (await ctx.buildSourceCacheGroups(resolvedCategory, { includeUncachedKnowledge: true })).find(function (group) {
                return String(group.id || '') === String(groupKey || '');
            }) || null;
        };

        ctx.openSource = function openSource(scope, key) {
            if (typeof window.updateSource === 'function') {
                window.updateSource(scope);
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput && key) {
                searchInput.value = key;
            }
        };

        container.querySelectorAll('.api-cache-open-source-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key) return;
                ctx.openSource(scope, key);
            });
        });

        container.querySelectorAll('.api-cache-view-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key || !window.CacheManager) return;
                if (scope === 'wikipedia' && typeof window.CacheManager.viewWikiCachedData === 'function') {
                    window.CacheManager.viewWikiCachedData(key);
                } else if (scope === 'fandom' && typeof window.CacheManager.viewFandomCachedData === 'function') {
                    window.CacheManager.viewFandomCachedData(key);
                }
            });
        });

        container.querySelectorAll('.api-cache-refresh-source-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key || !window.WikiManager) return;
                if (scope === 'wikipedia' && typeof window.WikiManager.reloadWikiEntryStatus === 'function') {
                    await window.WikiManager.reloadWikiEntryStatus(key);
                } else if (scope === 'fandom' && typeof window.WikiManager.reloadFandomWikiStatus === 'function') {
                    await window.WikiManager.reloadFandomWikiStatus(key);
                }
                ctx.refreshPanel();
            });
        });

        container.querySelectorAll('.api-cache-clear-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.sourceScope || '').trim();
                const key = String(button.dataset.sourceKey || '').trim();
                if (!scope || !key || !window.CacheManager) return;
                if (scope === 'wikipedia' && typeof window.CacheManager.clearWikiCache === 'function') {
                    window.CacheManager.clearWikiCache(key);
                } else if (scope === 'fandom' && typeof window.CacheManager.clearFandomCache === 'function') {
                    window.CacheManager.clearFandomCache(key);
                }
                ctx.refreshPanel();
            });
        });

        container.querySelectorAll('.api-cache-load-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                if (queryInput) queryInput.value = query;
                await ctx.loadCachedQuery(query, resultsContainer, null, {
                    categoryName: resolvedCategory
                });
            });
        });

        container.querySelectorAll('.api-cache-open-provider-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const providerKey = String(button.dataset.providerKey || '').trim();
                const query = String(button.dataset.query || '').trim();
                if (!providerKey || !query) return;
                if (queryInput) queryInput.value = query;
                if (typeof window.updateSource === 'function') {
                    window.updateSource(providerKey);
                }
                if (resultsContainer) {
                    await ctx.loadCachedQuery(query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        providerKey
                    });
                }
            });
        });

        container.querySelectorAll('.api-cache-refresh-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = await ctx.getGroup(button.dataset.groupKey);
                if (!group) return;
                if (group.wikipediaEntry && window.WikiManager && typeof window.WikiManager.reloadWikiEntryStatus === 'function') {
                    await window.WikiManager.reloadWikiEntryStatus(group.wikipediaEntry.key);
                }
                if (group.fandomEntry && window.WikiManager && typeof window.WikiManager.reloadFandomWikiStatus === 'function') {
                    await window.WikiManager.reloadFandomWikiStatus(group.fandomEntry.key);
                }
                if (group.apiEntries.length) {
                    for (const entry of group.apiEntries) {
                        if (queryInput) queryInput.value = entry.query;
                        await ctx.runSearch(entry.query, resultsContainer, null, {
                            categoryName: resolvedCategory,
                            liveResults: true
                        });
                    }
                }
                ctx.refreshPanel();
            });
        });

        container.querySelectorAll('.api-cache-clear-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = await ctx.getGroup(button.dataset.groupKey);
                if (!group) return;
                if (group.wikipediaEntry && window.CacheManager && typeof window.CacheManager.clearWikiCache === 'function') {
                    window.CacheManager.clearWikiCache(group.wikipediaEntry.key);
                }
                if (group.fandomEntry && window.CacheManager && typeof window.CacheManager.clearFandomCache === 'function') {
                    window.CacheManager.clearFandomCache(group.fandomEntry.key);
                }
                if (group.apiEntries.length && api.Cache) {
                    for (const entry of group.apiEntries) {
                        await api.Cache.deleteQuery(entry.query, resolvedCategory);
                    }
                }
                ctx.refreshPanel();
            });
        });

        container.querySelectorAll('.unidex-link-source-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const scope = String(button.dataset.linkScope || '').trim();
                const title = String(button.dataset.linkTitle || '').trim();
                if (!scope || !title || !window.WikiManager) return;

                if (scope === 'wikipedia' && typeof window.WikiManager.addWikiEntry === 'function') {
                    window.WikiManager.addWikiEntry(title, title);
                    ctx.refreshPanel();
                    return;
                }

                if (scope === 'fandom' && typeof window.WikiManager.addFandomDomain === 'function') {
                    window.WikiManager.addFandomDomain(ctx.suggestFandomDomain(title), title);
                    ctx.refreshPanel();
                }
            });
        });
    };

    ctx.unidexPanelReady = true;
})(window.EveOS.API);
