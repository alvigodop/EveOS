window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    const VectorResultParts = window.EveOS.SearchAdvanced.Modules.VectorResultParts || {};
    const { escapeHtml, renderStats, normalizeFacetFilters, matchesFacetFilters, renderFacetSummary, renderResultCard } = VectorResultParts;

function bindResultActions(container) {
        if (!container) return;
        if (container._nxVectorHandler) {
            container.removeEventListener('click', container._nxVectorHandler);
        }

        container._nxVectorHandler = function (event) {
            const traceButton = event.target.closest('[data-nx-trace-id]');
            if (traceButton && container.contains(traceButton)) {
                event.preventDefault();
                event.stopPropagation();
                window.SearchMonitorBoot?.showNexusTrace?.(traceButton.getAttribute('data-nx-trace-id') || '');
                return;
            }

            const actionButton = event.target.closest('[data-nx-action]');
            if (actionButton && container.contains(actionButton)) {
                event.preventDefault();
                event.stopPropagation();

                if (actionButton.getAttribute('data-nx-action') === 'clear-facets') {
                    container._nxFacetFilters = {};
                    if (container._nxLastSearchResult) renderVectorResults(container._nxLastSearchResult, container);
                    return;
                }

                const resultId = String(actionButton.getAttribute('data-nx-id') || '').trim();
                const action = String(actionButton.getAttribute('data-nx-action') || '').trim();
                const result = container._nxResultMap?.get(resultId);
                if (!result) return;

                const navigation = window.EveOS?.SearchAdvanced?.Navigation;
                if (action === 'newtab' && result.url) {
                    window.open(result.url, '_blank', 'noopener,noreferrer');
                    return;
                }
                if (action === 'popup' && result.url) {
                    window.open(result.url, 'nexus_popup', 'width=1100,height=780');
                    return;
                }
                if (action === 'path' && navigation?.goToPath) {
                    navigation.goToPath(result);
                    return;
                }
                if (action === 'opencard' && navigation?.openCard) {
                    navigation.openCard(result);
                    return;
                }
                if (action === 'unidex' && navigation?.openInUnidex) {
                    navigation.openInUnidex(result);
                    return;
                }
                if (action === 'map' && navigation?.openMap) {
                    navigation.openMap(result);
                    return;
                }
                if (action === 'focus' && navigation?.focusBookmark) {
                    navigation.focusBookmark(result);
                    return;
                }
                if (action === 'open-smart-view') {
                    const opened = window.EveSmartViewRegistry?.openSmartViewRecord
                        ? window.EveSmartViewRegistry.openSmartViewRecord(result)
                        : false;
                    if (!opened && navigation?.goToPath) navigation.goToPath(result);
                    return;
                }
                if (action === 'reveal-smart-view') {
                    const outcome = window.EveSmartViewRegistry?.revealSmartViewRecord
                        ? window.EveSmartViewRegistry.revealSmartViewRecord(result)
                        : { ok: false, error: 'Smart View reveal actions are not available yet.' };
                    if (!outcome.ok && typeof showToast === 'function') {
                        showToast(outcome.error || 'Could not reveal Smart View matches.', outcome.opened ? 'info' : 'warning');
                    }
                    return;
                }
                if (action === 'save-smart-view') {
                    const outcome = window.EveSmartViewRegistry?.saveSmartViewRecordAsCardView
                        ? window.EveSmartViewRegistry.saveSmartViewRecordAsCardView(result)
                        : { ok: false, error: 'Smart View save actions are not available yet.' };
                    if (outcome.alreadySaved && typeof showToast === 'function') {
                        showToast('This Smart View is already saved in the card.', 'info');
                    } else if (!outcome.ok && typeof showToast === 'function') {
                        showToast(outcome.error || 'Could not convert this result into a saved Smart View.', 'warning');
                    }
                    return;
                }
                if (action === 'json-state' || action === 'json-validate') {
                    const linkApi = window.EveOS?.NebulaJsonLink
                        || window.EveOS?.SearchAdvanced?.NebulaJsonLink
                        || window.NebulaJsonLink
                        || null;
                    const entityLink = result.entityLink || result.provenance?.entityLink || '';
                    if (!linkApi || !entityLink) {
                        if (typeof showToast === 'function') showToast('No JSON link is available for this result.', 'warning');
                        return;
                    }
                    const outcome = linkApi.executeAction(action === 'json-state' ? 'open-json-state' : 'validate', entityLink);
                    if (action === 'json-validate' && typeof showToast === 'function') {
                        showToast(outcome.valid || outcome.ok ? 'JSON link is valid.' : 'JSON link issue: ' + (outcome.errors || []).join(', '), outcome.valid || outcome.ok ? 'success' : 'warning');
                    }
                    return;
                }
                if (action === 'provenance' || action === 'visibility') {
                    const article = actionButton.closest('.nx-result-item');
                    const panel = article?.querySelector('[data-nx-panel="' + action + '"][data-nx-owner="' + resultId + '"]');
                    if (panel) panel.hidden = !panel.hidden;
                }
                return;
            }

            const facetButton = event.target.closest('[data-nx-facet-key][data-nx-facet-value]');
            if (facetButton && container.contains(facetButton)) {
                event.preventDefault();
                event.stopPropagation();
                const key = String(facetButton.getAttribute('data-nx-facet-key') || '').trim();
                const value = String(facetButton.getAttribute('data-nx-facet-value') || '').trim();
                if (!key || !value) return;
                const filters = normalizeFacetFilters(container._nxFacetFilters || {});
                const next = new Set(filters[key] || []);
                if (next.has(value)) next.delete(value);
                else next.add(value);
                filters[key] = Array.from(next);
                if (!filters[key].length) delete filters[key];
                container._nxFacetFilters = filters;
                if (container._nxLastSearchResult) renderVectorResults(container._nxLastSearchResult, container);
                return;
            }

            const header = event.target.closest('[data-nx-collapse-group]');
            if (header && container.contains(header)) {
                const group = header.closest('.nx-result-group');
                if (group) group.classList.toggle('collapsed');
            }
        };

        container.addEventListener('click', container._nxVectorHandler);
    }

    function renderMergedResults(results, resultMap) {
        return '<div class="nx-result-group nx-result-group-merged">'
            + '<div class="nx-group-header"><span class="nx-group-title">Merged Results</span><span class="nx-group-count">' + results.length + '</span></div>'
            + '<div class="nx-group-body">'
            + results.map(function (item, index) {
                const resultId = 'merged_' + index + '_' + Math.random().toString(36).slice(2, 8);
                resultMap.set(resultId, item);
                return renderResultCard(item, resultId);
            }).join('')
            + '</div></div>';
    }

    function renderSegmentedResults(searchResult, resultMap) {
        const groups = { card: [], smartView: [], folder: [], bookmark: [], library: [], knowledge: [], cached: [], google: [], diagnostic: [] };
        searchResult.results.forEach(function (result) {
            const key = String(result?.type || 'cached').trim() || 'cached';
            if (!groups[key]) groups[key] = [];
            groups[key].push(result);
        });

        const orderedGroups = [
            { key: 'card', label: 'Cards' },
            { key: 'smartView', label: 'Smart Views' },
            { key: 'folder', label: 'Folders' },
            { key: 'bookmark', label: 'Bookmarks' },
            { key: 'library', label: 'Library Entries' },
            { key: 'knowledge', label: 'Knowledge & Source Graph' },
            { key: 'cached', label: 'Cached API Results' },
            { key: 'google', label: 'Google CSE' },
            { key: 'diagnostic', label: 'Diagnostics' }
        ];

        let html = '';
        orderedGroups.forEach(function (group) {
            const items = groups[group.key];
            if (!items?.length) return;

            html += '<div class="nx-result-group">';
            html += '<div class="nx-group-header nx-group-toggle" data-nx-collapse-group>'
                + '<span class="nx-group-arrow">▾</span>'
                + '<span class="nx-group-title">' + escapeHtml(group.label) + '</span>'
                + '<span class="nx-group-count">' + items.length + '</span>'
                + '</div>';
            html += '<div class="nx-group-body">';

            items.forEach(function (item, index) {
                const resultId = group.key + '_' + index + '_' + Math.random().toString(36).slice(2, 8);
                resultMap.set(resultId, item);
                html += renderResultCard(item, resultId);
            });

            html += '</div></div>';
        });

        return html;
    }

    function renderVectorResults(searchResult, container) {
        if (!container) return;
        const previousQuery = container._nxLastSearchQuery || '';
        const nextQuery = String(searchResult?.query || '');
        if (previousQuery !== nextQuery) {
            container._nxFacetFilters = {};
        }
        container._nxLastSearchQuery = nextQuery;
        container._nxLastSearchResult = searchResult || null;
        const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
        const facetFilters = normalizeFacetFilters(container._nxFacetFilters || {});
        const filteredResults = results.filter(function (item) {
            return matchesFacetFilters(item, facetFilters);
        });
        if (!results.length) {
            container.innerHTML = '<div class="nx-empty">No results found across any vector.</div>';
            container._nxResultMap = new Map();
            bindResultActions(container);
            return;
        }

        const resultMap = new Map();
        let html = renderStats(searchResult, filteredResults.length);
        html += renderFacetSummary(searchResult, facetFilters);
        if (!filteredResults.length) {
            html += '<div class="nx-empty">No results match the active Nexus facets.</div>';
        } else {
            const renderResult = Object.assign({}, searchResult, { results: filteredResults });
            html += searchResult?.mode === 'merged'
                ? renderMergedResults(filteredResults, resultMap)
                : renderSegmentedResults(renderResult, resultMap);
        }

        container.innerHTML = html;
        container._nxResultMap = resultMap;
        bindResultActions(container);
    }

    window.EveOS.SearchAdvanced.Modules.renderVectorResults = renderVectorResults;
})();
