window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getVectorBadge(type) {
        switch (type) {
            case 'card': return '<span class="nx-badge nx-badge-card">Card</span>';
            case 'folder': return '<span class="nx-badge nx-badge-default">Folder</span>';
            case 'library': return '<span class="nx-badge nx-badge-library">Library</span>';
            case 'google': return '<span class="nx-badge nx-badge-google">Google</span>';
            case 'knowledge': return '<span class="nx-badge nx-badge-knowledge">Source Graph</span>';
            case 'cached': return '<span class="nx-badge nx-badge-cache">API Cache</span>';
            case 'bookmark': return '<span class="nx-badge nx-badge-bookmark">Bookmark</span>';
            case 'diagnostic': return '<span class="nx-badge nx-badge-default">Diagnostic</span>';
            default: return '<span class="nx-badge nx-badge-default">Result</span>';
        }
    }

    function getProviderBadge(provider) {
        if (!provider || provider === 'google' || provider === 'bookmark' || provider === 'knowledge' || provider === 'card' || provider === 'folder' || provider === 'library') return '';
        const labels = window.EveOS?.API?.SearchInternals?.PROVIDER_LABELS || {};
        const label = labels[provider] || provider;
        return '<span class="nx-provider-tag">' + escapeHtml(label) + '</span>';
    }

    function getStateTag(className, label) {
        if (!label) return '';
        return '<span class="nx-path-tag ' + className + '">' + escapeHtml(label) + '</span>';
    }

    function renderStats(searchResult, displayedCount) {
        const stats = searchResult?.stats || {};
        const parts = [];
        if (stats.cards) parts.push('Cards: ' + stats.cards);
        if (stats.folders) parts.push('Folders: ' + stats.folders);
        if (stats.bookmarks) parts.push('Bookmarks: ' + stats.bookmarks);
        if (stats.library) parts.push('Library: ' + stats.library);
        if (stats.knowledge) parts.push('Source Graph: ' + stats.knowledge);
        if (stats.cached) parts.push('API Cache: ' + stats.cached);
        if (stats.google) parts.push('Google: ' + stats.google);

        const traceId = searchResult?.trace?.id;
        const traceButton = traceId
            ? ' <button type="button" class="nx-trace-btn" data-nx-action="trace" data-nx-trace-id="' + escapeHtml(traceId) + '">Trace ' + escapeHtml(traceId) + '</button>'
            : '';

        return parts.length
            ? '<div class="nx-results-stats">' + parts.join(' &middot; ') + ' &mdash; ' + displayedCount + ' shown'
                + (displayedCount !== (searchResult?.results?.length || 0) ? ' / ' + (searchResult?.results?.length || 0) + ' total' : '')
                + traceButton + '</div>'
            : '';
    }

    function getFacetValues(item, key) {
        switch (key) {
            case 'tabs':
                return [String(item?.path?.workspaceLabel || item?.workspaceId || '').trim()].filter(Boolean);
            case 'cards':
                return [String(item?.categoryName || '').trim()].filter(Boolean);
            case 'sourceTypes':
                return [String(item?.type || '').trim()].filter(Boolean);
            case 'providers':
                return [String(item?.provider || '').trim()].filter(Boolean);
            case 'freshness':
                return [String(item?.freshness?.label || '').trim()].filter(Boolean);
            case 'visibility':
                return [String(item?.visibility?.label || '').trim()].filter(Boolean);
            case 'health':
                return [String(item?.health?.label || '').trim()].filter(Boolean);
            case 'flags': {
                const values = [];
                if (item?.provenance?.orphaned) values.push('Orphaned');
                if (item?.health?.state === 'broken' || item?.visibility?.state === 'broken') values.push('Broken Path');
                return values;
            }
            default:
                return [];
        }
    }

    function normalizeFacetFilters(filters) {
        const next = {};
        Object.keys(filters || {}).forEach(function (key) {
            const values = Array.isArray(filters[key]) ? filters[key].map(function (value) {
                return String(value || '').trim();
            }).filter(Boolean) : [];
            if (values.length) next[key] = values;
        });
        return next;
    }

    function matchesFacetFilters(item, filters, ignoredKey) {
        const activeFilters = normalizeFacetFilters(filters);
        const keys = Object.keys(activeFilters);
        if (!keys.length) return true;
        return keys.every(function (key) {
            if (ignoredKey && key === ignoredKey) return true;
            const selected = activeFilters[key] || [];
            if (!selected.length) return true;
            const values = getFacetValues(item, key);
            return selected.some(function (value) { return values.includes(value); });
        });
    }

    function buildFacetMap(results, filters, ignoredKey) {
        const keys = ['tabs', 'cards', 'sourceTypes', 'providers', 'freshness', 'visibility', 'health', 'flags'];
        const facets = {};
        keys.forEach(function (key) { facets[key] = {}; });

        results.forEach(function (item) {
            if (!matchesFacetFilters(item, filters, ignoredKey)) return;
            keys.forEach(function (key) {
                getFacetValues(item, key).forEach(function (value) {
                    facets[key][value] = (facets[key][value] || 0) + 1;
                });
            });
        });

        return facets;
    }

    function renderFacetSummary(searchResult, activeFilters) {
        const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
        const sections = [];
        const filterState = normalizeFacetFilters(activeFilters);
        const hasActiveFilters = Object.keys(filterState).length > 0;

        function summarizeMap(key, label, limit) {
            const facetMap = buildFacetMap(results, filterState, key)[key] || {};
            const activeValues = filterState[key] || [];
            const sortedEntries = Object.entries(facetMap).sort(function (left, right) {
                return Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0]));
            });
            const includedValues = new Set();
            const entries = [];

            activeValues.forEach(function (value) {
                includedValues.add(value);
                entries.push([value, facetMap[value] || 0, true]);
            });

            sortedEntries.forEach(function (entry) {
                if (includedValues.has(entry[0])) return;
                if (entries.length >= limit) return;
                entries.push([entry[0], entry[1], false]);
                includedValues.add(entry[0]);
            });

            if (!entries.length) return '';
            return '<div class="nx-facet-chip-group"><span class="nx-facet-chip-label">' + escapeHtml(label) + ':</span> '
                + entries.map(function (entry) {
                    return '<button type="button" class="nx-facet-chip'
                        + (entry[2] ? ' nx-facet-chip-active' : '')
                        + '" data-nx-facet-key="' + escapeHtml(key)
                        + '" data-nx-facet-value="' + escapeHtml(entry[0]) + '">'
                        + escapeHtml(entry[0]) + ' (' + entry[1] + ')</button>';
                }).join(' ')
                + '</div>';
        }

        const tabs = summarizeMap('tabs', 'Tabs', 6);
        const cards = summarizeMap('cards', 'Cards', 6);
        const types = summarizeMap('sourceTypes', 'Types', 6);
        const providers = summarizeMap('providers', 'Providers', 6);
        const freshness = summarizeMap('freshness', 'Freshness', 4);
        const visibility = summarizeMap('visibility', 'Visibility', 4);
        const health = summarizeMap('health', 'Health', 4);
        const flags = summarizeMap('flags', 'Flags', 4);

        if (tabs) sections.push(tabs);
        if (cards) sections.push(cards);
        if (types) sections.push(types);
        if (providers) sections.push(providers);
        if (freshness) sections.push(freshness);
        if (visibility) sections.push(visibility);
        if (health) sections.push(health);
        if (flags) sections.push(flags);

        if (!sections.length && !hasActiveFilters) return '';

        return '<div class="nx-facet-summary">'
            + (hasActiveFilters
                ? '<div class="nx-facet-actions"><button type="button" class="nx-facet-clear" data-nx-action="clear-facets">Clear Filters</button></div>'
                : '')
            + sections.join('')
            + '</div>';
    }

    function renderPathMeta(item) {
        const navigation = window.EveOS?.SearchAdvanced?.Navigation;
        const pathLabel = navigation?.describePath
            ? navigation.describePath(item?.path)
            : String(item?.path?.pathLabel || '').trim();
        if (!pathLabel && !item?.provenance?.orphaned && !item?.provenance?.done && !item?.visibility?.label) return '';

        let tags = '';
        if (item?.path?.folderLabel) tags += '<span class="nx-path-tag">Folder</span>';
        if (item?.path?.ambiguousWorkspace) tags += '<span class="nx-path-tag">Multi-tab</span>';
        if (item?.provenance?.done) tags += '<span class="nx-path-tag">Done</span>';
        if (item?.provenance?.orphaned) tags += '<span class="nx-path-tag nx-path-tag-warn">Orphan</span>';
        if (item?.visibility?.label) {
            tags += getStateTag(
                item?.visibility?.state === 'broken'
                    ? 'nx-path-tag-danger'
                    : item?.visibility?.state === 'hidden'
                        ? 'nx-path-tag-warn'
                        : 'nx-path-tag-info',
                item.visibility.label
            );
        }
        if (item?.health?.label) {
            tags += getStateTag(
                item?.health?.state === 'broken'
                    ? 'nx-path-tag-danger'
                    : item?.health?.state === 'warning'
                        ? 'nx-path-tag-warn'
                        : 'nx-path-tag-ok',
                item.health.label
            );
        }
        if (item?.freshness?.label && item?.type !== 'google' && item?.type !== 'bookmark' && item?.type !== 'card') {
            tags += getStateTag(
                item?.freshness?.state === 'stale'
                    ? 'nx-path-tag-warn'
                    : item?.freshness?.state === 'aging'
                        ? 'nx-path-tag-info'
                        : 'nx-path-tag-ok',
                item.freshness.label
            );
        }

        return '<div class="nx-result-path-wrap">'
            + (pathLabel ? '<div class="nx-result-path">Path: ' + escapeHtml(pathLabel) + '</div>' : '')
            + (tags ? '<div class="nx-result-path-tags">' + tags + '</div>' : '')
            + '</div>';
    }

    function renderInfoPanel(kind, item, resultId) {
        const navigation = window.EveOS?.SearchAdvanced?.Navigation;
        const lines = kind === 'visibility'
            ? (navigation?.describeVisibility ? navigation.describeVisibility(item) : [])
            : (navigation?.describeProvenance ? navigation.describeProvenance(item) : []);
        if (!Array.isArray(lines) || !lines.length) return '';

        return '<div class="nx-result-provenance" hidden data-nx-panel="' + escapeHtml(kind) + '" data-nx-owner="' + escapeHtml(resultId) + '">'
            + lines.map(function (line) {
                return '<div class="nx-result-provenance-row">' + escapeHtml(line) + '</div>';
            }).join('')
            + '</div>';
    }

    function renderActions(item, resultId) {
        const actions = [];
        if (item?.url) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="newtab" data-nx-id="' + escapeHtml(resultId) + '">Open</button>');
        }
        if (item?.url && item?.type !== 'google') {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="popup" data-nx-id="' + escapeHtml(resultId) + '">Popup</button>');
        }
        if (item?.path?.workspaceId && item?.path?.categoryName) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="opencard" data-nx-id="' + escapeHtml(resultId) + '">Open Card</button>');
            actions.push('<button type="button" class="nx-action-btn nx-action-btn-primary" data-nx-action="path" data-nx-id="' + escapeHtml(resultId) + '">Go To Path</button>');
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="unidex" data-nx-id="' + escapeHtml(resultId) + '">Reveal in Unidex</button>');
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="map" data-nx-id="' + escapeHtml(resultId) + '">Map</button>');
        }
        if (item?.type === 'bookmark' && item?.path?.linkId) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="focus" data-nx-id="' + escapeHtml(resultId) + '">Focus</button>');
        }
        if (item?.visibility) {
            const label = item?.visibility?.state === 'visible' ? 'Visibility' : 'Why Not Visible?';
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="visibility" data-nx-id="' + escapeHtml(resultId) + '">' + escapeHtml(label) + '</button>');
        }
        if (item?.provenance) {
            actions.push('<button type="button" class="nx-action-btn" data-nx-action="provenance" data-nx-id="' + escapeHtml(resultId) + '">Inspect Provenance</button>');
        }
        return actions.length ? '<div class="nx-result-actions">' + actions.join('') + '</div>' : '';
    }

    function renderTitle(item) {
        const safeTitle = escapeHtml(item?.title || 'Untitled');
        if (!item?.url) return '<h4 class="nx-result-title">' + safeTitle + '</h4>';
        return '<h4 class="nx-result-title"><a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">' + safeTitle + '</a></h4>';
    }

    function renderResultCard(item, resultId) {
        const cardBadge = item?.sourceCard
            ? '<span class="nx-card-tag">Card: ' + escapeHtml(item.sourceCard) + '</span>'
            : '';
        const libraryBadge = item?.library?.linked
            ? '<span class="nx-card-tag">Library Linked</span>'
            : '';

        return '<article class="nx-result-item nx-result-' + escapeHtml(item?.type || 'default') + '">'
            + '<div class="nx-result-header">'
            + getVectorBadge(item?.type)
            + getProviderBadge(item?.provider)
            + cardBadge
            + libraryBadge
            + '</div>'
            + renderTitle(item)
            + (item?.displayUrl ? '<div class="nx-result-url">' + escapeHtml(item.displayUrl) + '</div>' : '')
            + (item?.description ? '<p class="nx-result-snippet">' + escapeHtml(item.description) + '</p>' : '')
            + renderPathMeta(item)
            + renderActions(item, resultId)
            + renderInfoPanel('visibility', item, resultId)
            + renderInfoPanel('provenance', item, resultId)
            + '</article>';
    }

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
        const groups = { card: [], folder: [], bookmark: [], library: [], knowledge: [], cached: [], google: [], diagnostic: [] };
        searchResult.results.forEach(function (result) {
            const key = String(result?.type || 'cached').trim() || 'cached';
            if (!groups[key]) groups[key] = [];
            groups[key].push(result);
        });

        const orderedGroups = [
            { key: 'card', label: 'Cards' },
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
