window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

ctx.buildCacheListMarkup = function buildCacheListMarkup(entries, emptyMessage, providerKey = null) {
        const visibleEntries = Array.isArray(entries) ? entries.filter(function (entry) {
            if (!providerKey || !ctx.isProviderSource(providerKey)) return true;
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) : [];

        if (!visibleEntries.length) {
            return `<div style="opacity:0.68; font-size:0.83rem;">${ctx.escapeHtml(emptyMessage)}</div>`;
        }

        return visibleEntries.map(function (entry) {
            const totalResults = providerKey && ctx.isProviderSource(providerKey)
                ? Number(entry.summary?.perSource?.[providerKey] || 0)
                : Number(entry.summary?.totalResults || 0);
            const providerBadges = ctx.PROVIDER_ORDER
                .map(function ([key, label]) {
                    const count = Number(entry.summary?.perSource?.[key] || 0);
                    if (providerKey && key !== providerKey) return '';
                    if (!count) return '';
                    return `<span class="api-provider-badge">${ctx.escapeHtml(label)} <strong>${count}</strong></span>`;
                })
                .filter(Boolean)
                .join('');

            return `
                <div class="api-cache-entry" data-query="${ctx.escapeHtml(entry.query)}">
                    <div class="api-cache-entry-header">
                        <div class="api-cache-entry-copy">
                            <div class="api-cache-entry-title">${ctx.escapeHtml(entry.query)}</div>
                            <div class="api-cache-entry-meta">${totalResults} results . updated ${ctx.escapeHtml(ctx.formatRelativeTime(entry.updatedAt))}</div>
                            <div class="api-cache-entry-expiry">${ctx.escapeHtml(ctx.formatExpiry(entry.expiresAt))}</div>
                        </div>
                        <div class="api-cache-actions">
                            <button type="button" class="api-cache-load-btn" data-query="${ctx.escapeHtml(entry.query)}">Load</button>
                            <button type="button" class="api-cache-refresh-btn" data-query="${ctx.escapeHtml(entry.query)}">Refresh</button>
                            <button type="button" class="api-cache-delete-btn" data-query="${ctx.escapeHtml(entry.query)}">Delete</button>
                        </div>
                    </div>
                    <div class="api-provider-badges">${providerBadges || '<span class="api-provider-empty">No provider hits stored.</span>'}</div>
                </div>
            `;
        }).join('');
    }

ctx.wireCacheList = async function wireCacheList(container, categoryName, resultsContainer, queryInput, options = {}) {
        if (!container) return;

        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        const cacheEntries = api.Cache ? await api.Cache.listQueries(resolvedCategory) : [];
        container.innerHTML = ctx.buildCacheListMarkup(cacheEntries, 'No API queries cached for this card yet.', options.providerKey);
        const interactionDelayMs = Number(options.interactionDelayMs) > 0 ? Number(options.interactionDelayMs) : 0;

        ctx.assignQuery = function assignQuery(query) {
            if (!queryInput) return;
            queryInput.value = query;
        }

        container.querySelectorAll('.api-cache-load-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const query = String(button.dataset.query || '').trim();
                if (!query) return;
                ctx.assignQuery(query);
                if (options.beforeLoad) options.beforeLoad(query);
                ctx.runAfterDelay(function () {
                    ctx.loadCachedQuery(query, resultsContainer, null, {
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
                ctx.assignQuery(query);
                if (options.beforeLoad) options.beforeLoad(query);
                ctx.runAfterDelay(function () {
                    ctx.runSearch(query, resultsContainer, null, {
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
            button.addEventListener('click', async function () {
                const query = String(button.dataset.query || '').trim();
                if (!query || !api.Cache) return;
                await api.Cache.deleteQuery(query, resolvedCategory);
                ctx.wireCacheList(container, resolvedCategory, resultsContainer, queryInput, options);
            });
        });
    }

ctx.wireUnifiedCacheList = async function wireUnifiedCacheList(container, categoryName, resultsContainer, queryInput, options = {}) {
        if (!container) return;

        const resolvedCategory = ctx.ensureCategoryContext(categoryName);
        container.innerHTML = await ctx.buildUnifiedCacheListMarkup(resolvedCategory);

        ctx.refreshPool = function refreshPool() {
            ctx.wireUnifiedCacheList(container, resolvedCategory, resultsContainer, queryInput, options);
        }

        ctx.getGroup = async function getGroup(groupKey) {
            return (await ctx.buildSourceCacheGroups(resolvedCategory)).find(function (group) {
                return String(group.id || '') === String(groupKey || '');
            }) || null;
        }

        ctx.focusUnifiedGroup = function focusUnifiedGroup(group) {
            if (typeof window.switchCategoryTab === 'function') {
                window.switchCategoryTab('scraper');
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput && group?.title) {
                searchInput.value = group.title;
            }
            if (typeof window.updateSource === 'function') {
                window.updateSource('unidex');
            }
            const unidexContainer = document.getElementById('unidex-scraper-panel-container');
            if (unidexContainer) {
                ctx.renderUnidexPanelUI(unidexContainer, resolvedCategory, {
                    filterQuery: group?.title || ''
                });
            }
        }

        container.querySelectorAll('.api-cache-open-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = await ctx.getGroup(button.dataset.groupKey);
                if (!group) return;
                ctx.focusUnifiedGroup(group);
            });
        });

        container.querySelectorAll('.api-cache-view-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = await ctx.getGroup(button.dataset.groupKey);
                if (!group) return;
                ctx.ensureCategoryContext(resolvedCategory);
                if (group.wikipediaEntry && window.CacheManager && typeof window.CacheManager.viewWikiCachedData === 'function') {
                    window.CacheManager.viewWikiCachedData(group.wikipediaEntry.key);
                    return;
                }
                if (group.fandomEntry && window.CacheManager && typeof window.CacheManager.viewFandomCachedData === 'function') {
                    window.CacheManager.viewFandomCachedData(group.fandomEntry.key);
                    return;
                }
                const latestApi = group.apiEntries[0];
                if (latestApi) {
                    if (queryInput) queryInput.value = latestApi.query;
                    await ctx.loadCachedQuery(latestApi.query, resultsContainer, null, {
                        categoryName: resolvedCategory,
                        onAfterRender: ctx.refreshPool
                    });
                }
            });
        });

        container.querySelectorAll('.api-cache-refresh-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = await ctx.getGroup(button.dataset.groupKey);
                if (!group) return;
                ctx.ensureCategoryContext(resolvedCategory);
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
                ctx.refreshPool();
            });
        });

        container.querySelectorAll('.api-cache-clear-group-btn').forEach(function (button) {
            button.addEventListener('click', async function () {
                const group = await ctx.getGroup(button.dataset.groupKey);
                if (!group) return;
                ctx.ensureCategoryContext(resolvedCategory);
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
                ctx.refreshPool();
            });
        });
    }
})(window.EveOS.API);