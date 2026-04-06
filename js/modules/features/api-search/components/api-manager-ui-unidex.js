window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

ctx.buildUnidexApiProviderRows = function buildUnidexApiProviderRows(apiEntries) {
        const providerStats = {};

        (Array.isArray(apiEntries) ? apiEntries : []).forEach(function (entry) {
            const updatedAt = Number(entry?.updatedAt || 0);
            Object.entries(entry?.summary?.perSource || {}).forEach(function ([providerKey, count]) {
                const resultCount = Number(count || 0);
                if (!resultCount) return;
                if (!providerStats[providerKey]) {
                    providerStats[providerKey] = {
                        providerKey,
                        label: ctx.getProviderLabel(providerKey),
                        resultCount: 0,
                        queryCount: 0,
                        updatedAt: 0,
                        latestQuery: ''
                    };
                }
                providerStats[providerKey].resultCount += resultCount;
                providerStats[providerKey].queryCount += 1;
                if (updatedAt >= providerStats[providerKey].updatedAt) {
                    providerStats[providerKey].updatedAt = updatedAt;
                    providerStats[providerKey].latestQuery = String(entry?.query || '').trim();
                }
            });
        });

        return ctx.PROVIDER_ORDER.map(function ([providerKey]) {
            const provider = providerStats[providerKey];
            if (!provider) return '';
            const resultLabel = `${provider.resultCount} result${provider.resultCount === 1 ? '' : 's'}`;
            const queryLabel = `${provider.queryCount} quer${provider.queryCount === 1 ? 'y' : 'ies'}`;
            const freshness = provider.updatedAt ? `Updated ${ctx.formatRelativeTime(provider.updatedAt)}` : 'No timestamp';
            return `
                <div class="unidex-api-provider-row">
                    <div class="unidex-api-provider-copy">
                        <div class="unidex-api-provider-title">${ctx.escapeHtml(provider.label)}</div>
                        <div class="unidex-api-provider-meta">${ctx.escapeHtml(resultLabel)} . ${ctx.escapeHtml(queryLabel)} . ${ctx.escapeHtml(freshness)}</div>
                    </div>
                    <div class="unidex-api-provider-actions">
                        <button type="button" class="api-cache-open-provider-btn" data-provider-key="${ctx.escapeHtml(provider.providerKey)}" data-query="${ctx.escapeHtml(provider.latestQuery)}">Open</button>
                    </div>
                </div>
            `;
        }).filter(Boolean).join('');
    }

ctx.buildUnidexLaneMarkup = function buildUnidexLaneMarkup(group) {
        const lanes = [];

        if (group.wikipediaEntry) {
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Wikipedia</div>
                        <div class="unidex-lane-meta">${ctx.escapeHtml(group.wikipediaEntry.subtitle)}</div>
                        <div class="unidex-lane-status">${ctx.escapeHtml(ctx.formatCacheFreshness(group.wikipediaEntry))}${group.wikipediaEntry.hasCache ? ` . ${group.wikipediaEntry.itemCount} items` : ''}</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-open-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">Open</button>
                        <button type="button" class="api-cache-view-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">View</button>
                        <button type="button" class="api-cache-refresh-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">Refresh</button>
                        <button type="button" class="api-cache-clear-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">Clear</button>
                    </div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Wikipedia</div>
                        <div class="unidex-lane-status">No linked Wikipedia entry yet.</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="unidex-link-source-btn" data-link-scope="wikipedia" data-link-title="${ctx.escapeHtml(group.title)}">Link Wiki</button>
                    </div>
                </div>
            `);
        }

        if (group.fandomEntry) {
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Fandom</div>
                        <div class="unidex-lane-meta">${ctx.escapeHtml(group.fandomEntry.subtitle)}</div>
                        <div class="unidex-lane-status">${ctx.escapeHtml(ctx.formatCacheFreshness(group.fandomEntry))}${group.fandomEntry.hasCache ? ` . ${group.fandomEntry.itemCount} items` : ''}</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-open-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">Open</button>
                        <button type="button" class="api-cache-view-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">View</button>
                        <button type="button" class="api-cache-refresh-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">Refresh</button>
                        <button type="button" class="api-cache-clear-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">Clear</button>
                    </div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Fandom</div>
                        <div class="unidex-lane-status">No linked Fandom domain yet.</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="unidex-link-source-btn" data-link-scope="fandom" data-link-title="${ctx.escapeHtml(group.title)}">Link Fandom</button>
                    </div>
                </div>
            `);
        }

        const apiProviderCounts = ctx.summarizeApiGroupProviders(group.apiEntries);
        if (group.apiEntries.length) {
            const apiBadges = ctx.PROVIDER_ORDER.map(function ([key, label]) {
                const count = Number(apiProviderCounts[key] || 0);
                if (!count) return '';
                return `<span class="api-provider-badge">${ctx.escapeHtml(label)} <strong>${count}</strong></span>`;
            }).filter(Boolean).join('');
            const latestApi = group.apiEntries[0];
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">API Cache</div>
                        <div class="unidex-lane-meta">${group.apiEntries.length === 1 ? ctx.escapeHtml(latestApi.query) : `${group.apiEntries.length} cached queries`}</div>
                        <div class="unidex-lane-status">Updated ${ctx.escapeHtml(ctx.formatRelativeTime(latestApi.updatedAt))} . ${Number(latestApi.summary?.totalResults || 0)} total results</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-load-btn" data-query="${ctx.escapeHtml(latestApi.query)}">Load</button>
                        <button type="button" class="api-cache-refresh-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Refresh</button>
                        <button type="button" class="api-cache-clear-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Clear</button>
                    </div>
                    <div class="unidex-api-provider-list">
                        ${ctx.buildUnidexApiProviderRows(group.apiEntries)}
                    </div>
                    <div class="api-provider-badges">${apiBadges}</div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">API Cache</div>
                        <div class="unidex-lane-status">No cached API queries linked to this source yet.</div>
                    </div>
                </div>
            `);
        }

        return lanes.join('');
    }

ctx.buildUnidexGroupMarkup = function buildUnidexGroupMarkup(group) {
        const linkedLanes = [
            group.wikipediaEntry ? 'Wikipedia' : null,
            group.fandomEntry ? 'Fandom' : null,
            group.apiEntries.length ? 'API' : null
        ].filter(Boolean);

        return `
            <div class="api-cache-entry unidex-source-card" data-group-key="${ctx.escapeHtml(group.id)}">
                <div class="api-cache-entry-header">
                    <div class="api-cache-entry-copy">
                        <div class="api-cache-entry-title">${ctx.escapeHtml(group.title)}</div>
                        <div class="api-cache-entry-meta">${ctx.escapeHtml(linkedLanes.join(' . ') || 'Unlinked source')} . updated ${ctx.escapeHtml(ctx.formatRelativeTime(group.updatedAt || 0))}</div>
                    </div>
                    <div class="api-provider-badges">
                        ${group.wikipediaEntry ? '<span class="api-provider-badge api-provider-badge-source">Wiki</span>' : ''}
                        ${group.fandomEntry ? '<span class="api-provider-badge api-provider-badge-source">Fandom</span>' : ''}
                        ${group.apiEntries.length ? '<span class="api-provider-badge api-provider-badge-source">API</span>' : ''}
                    </div>
                </div>
                <div class="unidex-lane-list">
                    ${ctx.buildUnidexLaneMarkup(group)}
                </div>
            </div>
        `;
    }

ctx.buildUnidexManagementMarkup = async function buildUnidexManagementMarkup(categoryName, filterQuery = '') {
        const groups = (await ctx.buildSourceCacheGroups(categoryName, { includeUncachedKnowledge: true })).filter(function (group) {
            return ctx.matchesGroupFilter(group, filterQuery);
        });
        if (!groups.length) {
            const baseMessage = filterQuery
                ? `No unified sources match "${ctx.escapeHtml(filterQuery)}" for this card yet.`
                : 'No saved wiki sources, fandom domains, or cached API queries for this card yet.';
            return `<div style="opacity:0.68; font-size:0.83rem;">${baseMessage}</div>`;
        }
        return groups.map(ctx.buildUnidexGroupMarkup).join('');
    }

ctx.suggestFandomDomain = function suggestFandomDomain(title) {
        const base = String(title || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
        return base ? `${base}.fandom.com` : '';
    }

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
        }

        ctx.getGroup = async function getGroup(groupKey) {
            return (await ctx.buildSourceCacheGroups(resolvedCategory, { includeUncachedKnowledge: true })).find(function (group) {
                return String(group.id || '') === String(groupKey || '');
            }) || null;
        }

        ctx.openSource = function openSource(scope, key) {
            if (typeof window.updateSource === 'function') {
                window.updateSource(scope);
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput && key) {
                searchInput.value = key;
            }
        }

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
    }

ctx.bindUnifiedResultLinks = function bindUnifiedResultLinks(container) {
        if (!container) return;

        container.querySelectorAll('[data-unidex-link="1"]').forEach(function (link) {
            link.addEventListener('click', function (event) {
                const href = String(link.getAttribute('href') || '').trim();
                const title = String(link.getAttribute('data-unidex-link-title') || '').trim();
                const categoryName = String(link.getAttribute('data-unidex-link-category') || '').trim();
                if (!href) return;
                ctx.handleResultLinkClick(event, href, title || 'Search Result', { categoryName });
            });
        });

        container.querySelectorAll('[data-unidex-link-button="1"]').forEach(function (button) {
            button.addEventListener('click', function (event) {
                const href = String(button.getAttribute('data-unidex-link-url') || '').trim();
                const title = String(button.getAttribute('data-unidex-link-title') || '').trim();
                const categoryName = String(button.getAttribute('data-unidex-link-category') || '').trim();
                if (!href) return;
                ctx.handleResultLinkClick(event, href, title || 'Search Result', { categoryName });
            });
        });
    }

ctx.renderProviderResultsSubset = function renderProviderResultsSubset(sourceResults, resultsContainer, onSelect, providerKey, isGlobalCached) {
        const Display = api.Display;
        if (!Display || typeof Display.displayResults !== 'function' || !resultsContainer) {
            return {};
        }

        const visibleSources = ctx.filterSourcesByProvider(sourceResults || {}, providerKey);
        resultsContainer.style.display = 'block';
        Display.displayResults(visibleSources, resultsContainer, onSelect, { 
            isCached: !!(isGlobalCached ?? sourceResults.isCached)
        });
        return visibleSources;
    }

ctx.renderUnifiedSearchResults = function renderUnifiedSearchResults(payload, resultsContainer, onSelect) {
        if (!resultsContainer) return payload;

        const totalResults = Number(payload?.api?.meta?.summary?.totalResults || 0)
            + Number(payload?.wikipedia?.results?.length || 0)
            + Number(payload?.fandom?.results?.length || 0);

        resultsContainer.innerHTML = `
            <div class="api-unidex-results-shell">
                <div class="api-unidex-results-summary">
                    <span class="api-provider-badge api-provider-badge-source">Search Unidex</span>
                    <span class="api-provider-badge">API <strong>${Number(payload?.api?.meta?.summary?.totalResults || 0)}</strong></span>
                    <span class="api-provider-badge">Wikipedia <strong>${Number(payload?.wikipedia?.results?.length || 0)}</strong></span>
                    <span class="api-provider-badge">Fandom <strong>${Number(payload?.fandom?.results?.length || 0)}</strong></span>
                </div>
                ${ctx.buildKnowledgeResultsSection('wikipedia', payload?.wikipedia, payload?.categoryName)}
                ${ctx.buildKnowledgeResultsSection('fandom', payload?.fandom, payload?.categoryName)}
                <details class="api-cache-section unidex-search-section" data-unidex-section="api" open>
                    <summary class="api-cache-section-header">
                        <span>API Providers</span>
                        <span class="api-cache-section-count">${Number(payload?.api?.meta?.summary?.totalResults || 0)} results</span>
                    </summary>
                    <div class="api-cache-section-list">
                        <div class="api-unidex-provider-sections"></div>
                    </div>
                </details>
            </div>
        `;

        const apiSectionsHost = resultsContainer.querySelector('.api-unidex-provider-sections');
        if (apiSectionsHost) {
            const apiSummary = payload?.api?.meta?.summary || {};
            const providerSections = ctx.PROVIDER_ORDER.filter(function ([providerKey]) {
                return Number(apiSummary?.perSource?.[providerKey] || 0) > 0;
            });

            if (payload?.api?.meta?.cacheMiss && totalResults < 1) {
                apiSectionsHost.innerHTML = `
                    <div class="unidex-search-empty">
                        No cached Search Unidex result for this card yet. Enable Hybrid or Live to fetch API, Wikipedia, and Fandom results.
                    </div>
                `;
            } else if (payload?.api?.meta?.error && Number(payload?.api?.meta?.summary?.totalResults || 0) < 1) {
                apiSectionsHost.innerHTML = `
                    <div class="unidex-search-empty">
                        Unable to load API provider results: ${ctx.escapeHtml(payload.api.meta.error.message || payload.api.meta.error)}
                    </div>
                `;
            } else if (providerSections.length > 0) {
                apiSectionsHost.innerHTML = providerSections.map(function ([providerKey, label]) {
                    const providerCount = Number(apiSummary?.perSource?.[providerKey] || 0);
                    return `
                        <details class="api-cache-section api-unidex-provider-section" data-unidex-api-provider="${ctx.escapeHtml(providerKey)}" open>
                            <summary class="api-cache-section-header">
                                <span>${ctx.escapeHtml(label)}</span>
                                <span class="api-cache-section-count">${providerCount} results</span>
                            </summary>
                            <div class="api-unidex-provider-results" data-unidex-api-provider-results="${ctx.escapeHtml(providerKey)}"></div>
                        </details>
                    `;
                }).join('');

                providerSections.forEach(function ([providerKey]) {
                    const providerHost = apiSectionsHost.querySelector(`[data-unidex-api-provider-results="${providerKey}"]`);
                    if (!providerHost) return;
                    const isCached = !!(payload.api?.meta?.fromCache);
                    ctx.renderProviderResultsSubset(payload.api.allSources, providerHost, onSelect, providerKey, isCached);
                });
            } else {
                apiSectionsHost.innerHTML = `<div class="unidex-search-empty">No API provider matches for this query inside this card yet.</div>`;
            }
        }

        ctx.bindUnifiedResultLinks(resultsContainer);
        ctx.updateResultsCount(totalResults);
        return payload;
    }
})(window.EveOS.API);