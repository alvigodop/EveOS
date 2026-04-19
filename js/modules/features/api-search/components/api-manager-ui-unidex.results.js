window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.unidexResultsReady) return;

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
    };

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
    };

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
                apiSectionsHost.innerHTML = '<div class="unidex-search-empty">No API provider matches for this query inside this card yet.</div>';
            }
        }

        ctx.bindUnifiedResultLinks(resultsContainer);
        ctx.updateResultsCount(totalResults);
        return payload;
    };

    ctx.unidexResultsReady = true;
})(window.EveOS.API);
