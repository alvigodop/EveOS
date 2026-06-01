window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const State = window.EveOS.SearchAdvanced.State;
    const Api = window.EveOS.SearchAdvanced.Api;
    const Modules = window.EveOS.SearchAdvanced.Modules || {};
    const { syncSearchMonitor, buildCommandTrace, countSatisfiedVectors } = Modules.UiMonitor || {};

    let uiHelpers = null;
    let activeScope = null;

    function getUiHelpers() {
        if (!uiHelpers) {
            uiHelpers = Modules.createUiHelpers({
                onRunSearch: runSearch,
                onClearFilters: clearFilters,
                getScope: function (scopeMode) {
                    return resolveCurrentScope(scopeMode);
                }
            });
        }
        return uiHelpers;
    }

    function byId(id) {
        return getUiHelpers().byId(id);
    }

    function getCurrentScopeMode() {
        const selected = document.querySelector('.nx-mode-btn.nx-mode-btn-active[data-scope-mode]');
        if (selected) {
            return selected.getAttribute('data-scope-mode') === 'all' ? 'all' : 'current';
        }
        return State?.getSettings?.()?.scopeMode === 'all' ? 'all' : 'current';
    }

    function normalizeWorkspaceIds(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map(function (value) { return String(value || '').trim(); })
            .filter(Boolean)));
    }

    function hasScopeTarget(scope) {
        return !!(
            scope
            && (
                scope.workspaceId
                || scope.categoryName
                || normalizeWorkspaceIds(scope.workspaceIds).length > 0
            )
        );
    }

    function resolveGroupOverviewScope() {
        const currentConfig = window.eveState?.config || (typeof config !== 'undefined' ? config : null) || {};
        const groupId = String(currentConfig.groupOverviewId || '').trim();
        if (!groupId) return null;

        const workspaceIds = normalizeWorkspaceIds(
            window._eveActiveVisibleWorkspaceIds instanceof Set
                ? Array.from(window._eveActiveVisibleWorkspaceIds)
                : window._eveActiveVisibleWorkspaceIds
        );
        if (!workspaceIds.length) return null;

        const group = Array.isArray(currentConfig.sidebarGroups)
            ? currentConfig.sidebarGroups.find(function (item) {
                return String(item?.id || '').trim() === groupId;
            })
            : null;

        return {
            workspaceIds,
            groupId,
            groupName: String(group?.name || 'Group Overview').trim() || 'Group Overview'
        };
    }

    function resolveCurrentScope(scopeMode) {
        const mode = scopeMode === 'all' ? 'all' : getCurrentScopeMode();
        if (mode === 'all') return {};
        if (hasScopeTarget(activeScope)) return activeScope;

        const groupScope = resolveGroupOverviewScope();
        if (groupScope) return groupScope;

        const grid = document.getElementById('dashboard-grid');
        const isUnidexMode = grid && grid.classList.contains('unidex-mode');
        if (isUnidexMode) return {};

        const activeWorkspace = String(
            window.eveState?.config?.activeWorkspace
            || (typeof config !== 'undefined' ? config?.activeWorkspace : '')
            || 'main'
        ).trim() || 'main';

        return { workspaceId: activeWorkspace };
    }

    function buildScopeLabel(scopeMode, scope) {
        const Agg = window.EveOS.SearchAdvanced.CacheAggregator;
        const resolvedScope = scope || resolveCurrentScope(scopeMode);
        return Agg?.describeScopeLabel ? Agg.describeScopeLabel(resolvedScope) : (scopeMode === 'all' ? 'All Tabs' : 'Scoped');
    }

    function refreshScopeIndicator() {
        const scopeMode = getCurrentScopeMode();
        const scope = resolveCurrentScope(scopeMode);
        const scopeIndicator = byId('esScopeIndicator');
        if (scopeIndicator) {
            scopeIndicator.textContent = 'Scope: ' + buildScopeLabel(scopeMode, scope);
            scopeIndicator.style.display = '';
        }
        return { scopeMode, scope };
    }

    const executeNexusCommand = window.EveOS.SearchAdvanced.UICommands.create({ byId, getUiHelpers });

    async function runSearch() {
        const ui = getUiHelpers();
        const query = (byId('esQuery')?.value || '').trim();
        const settings = ui.collectSettings();
        State.updateSettings(settings);

        if (!query) {
            ui.setMeta('Enter a search query.', true);
            return;
        }

        const scopeMode = settings.scopeMode === 'all' ? 'all' : getCurrentScopeMode();
        const scope = resolveCurrentScope(scopeMode);

        try {
            ui.setLoading(true);

            const scopeLabel = buildScopeLabel(scopeMode, scope);
            const activeVectorCount = Object.keys(settings.activeVectors || {}).filter(function (key) {
                return !!settings.activeVectors[key];
            }).length;
            refreshScopeIndicator();

            syncSearchMonitor({
                isSearching: true,
                statusText: 'Nexus search running',
                scopeLabel: scopeLabel,
                vectorStatus: '0/' + activeVectorCount,
                resultsFound: '0',
                traceSummary: 'pending'
            });

            if (query.startsWith('>')) {
                const handled = await executeNexusCommand(query, ui, scope);
                if (handled) return;
            }

            const SearchVectors = window.EveOS.SearchAdvanced.SearchVectors;
            if (SearchVectors && typeof SearchVectors.runMultiVectorSearch === 'function') {
                const result = await SearchVectors.runMultiVectorSearch(query, settings, scope);
                const renderFn = Modules.renderVectorResults;
                if (typeof renderFn === 'function') {
                    renderFn(result, byId('esResults'));
                } else {
                    const results = byId('esResults');
                    if (results) {
                        results.innerHTML = (result.results || []).map(function (item) {
                            return '<div class="nx-result-item"><a href="' + (item.url || '#') + '" target="_blank">' + (item.title || 'Untitled') + '</a></div>';
                        }).join('') || '<div class="nx-empty">No results</div>';
                    }
                }

                const stats = result.stats || {};
                const total = (result.results || []).length;
                const satisfiedVectors = countSatisfiedVectors(stats, settings);
                ui.setMeta(total + ' results across ' + satisfiedVectors + ' vectors (' + scopeLabel + ')', false);
                syncSearchMonitor({
                    isSearching: false,
                    statusText: 'Nexus ready',
                    scopeLabel: scopeLabel,
                    vectorStatus: satisfiedVectors + '/' + activeVectorCount,
                    resultsFound: String(total),
                    traceId: result?.trace?.id || '',
                    traceSummary: result?.trace?.summary || (result?.trace ? ('total ' + result.trace.totalMs + 'ms') : ''),
                    trace: result?.trace || null
                });
            } else {
                const data = await Api.runSearch(query, settings);
                ui.renderResults(data);
                syncSearchMonitor({
                    isSearching: false,
                    statusText: 'Nexus ready',
                    scopeLabel: scopeLabel,
                    vectorStatus: '1/' + activeVectorCount,
                    resultsFound: String(Array.isArray(data?.items) ? data.items.length : 0),
                    traceSummary: 'legacy google'
                });
            }

            if (typeof ui.updateFooterStats === 'function') await ui.updateFooterStats();
        } catch (error) {
            const message = error?.message || 'Search failed.';
            ui.setMeta(message, true);
            const results = byId('esResults');
            if (results) results.innerHTML = '<div class="nx-empty" style="color:#ff7b7b">' + (ui.escapeHtml ? ui.escapeHtml(message) : message) + '</div>';
            syncSearchMonitor({
                isSearching: false,
                statusText: 'Nexus error',
                scopeLabel: 'Error',
                vectorStatus: '0',
                resultsFound: '0',
                traceSummary: message
            });
        } finally {
            ui.setLoading(false);
        }
    }

    function clearFilters() {
        const ui = getUiHelpers();
        ui.resetFilters();

        const results = byId('esResults');
        if (results) results.innerHTML = '';
        ui.setMeta('Filters cleared.', false);

        State.updateSettings(ui.collectSettings());
    }

    function refreshVisibleDatapackViewState() {
        const panel = byId('nxDatapackViewPanel');
        if (!panel) return false;
        const datapackView = window.EveOS?.SearchAdvanced?.DatapackView;
        if (!datapackView || typeof datapackView.renderGateway !== 'function') return false;
        datapackView.renderGateway();
        return true;
    }

    function openExpandedSearchModal(options) {
        const ui = getUiHelpers();
        ui.createModalIfNeeded();
        activeScope = hasScopeTarget(options?.scope)
            ? options.scope
            : null;

        const settings = State.getSettings();
        const scopeModeOverride = options?.scopeMode
            || (options?.scope && !hasScopeTarget(options.scope) ? 'all' : '');
        const queryFromOptions = typeof options?.query === 'string'
            ? options.query
            : (byId('search')?.value || '');
        const effectiveSettings = scopeModeOverride
            ? Object.assign({}, settings, { scopeMode: scopeModeOverride })
            : settings;
        ui.applySettingsToForm(effectiveSettings, queryFromOptions);
        if (scopeModeOverride) {
            State.updateSettings({ scopeMode: scopeModeOverride });
        }

        const modal = byId('expandedSearchModal');
        if (modal) modal.style.display = 'flex';

        refreshScopeIndicator();
        refreshVisibleDatapackViewState();

        if (typeof ui.updateFooterStats === 'function') ui.updateFooterStats();

        if (options?.autoSearch) {
            runSearch();
        } else {
            const queryInput = byId('esQuery');
            if (queryInput) queryInput.focus();
        }
    }

    window.openExpandedSearchModal = openExpandedSearchModal;
    window.EveOS.SearchAdvanced.UI = {
        openExpandedSearchModal,
        runSearch,
        refreshScopeIndicator,
        getCurrentScopeMode,
        getResolvedScope: function (scopeMode) {
            return resolveCurrentScope(scopeMode);
        },
        getScopeLabel: function (scopeMode) {
            return buildScopeLabel(scopeMode || getCurrentScopeMode());
        }
    };
})();
