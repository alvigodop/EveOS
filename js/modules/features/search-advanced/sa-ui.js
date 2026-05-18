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

    function renderCommandMessage(results, title, detail) {
        if (!results) return;
        results.innerHTML = '<div class="nx-empty" style="padding:24px 18px;">'
            + '<div style="font-size:0.92rem; color:rgba(196,226,250,0.92); margin-bottom:6px;">' + title + '</div>'
            + (detail ? '<div style="font-size:0.78rem; color:rgba(140,170,205,0.7);">' + detail + '</div>' : '')
            + '</div>';
    }

    function renderCommandDetailList(results, title, lines) {
        if (!results) return;
        const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
        results.innerHTML = '<div class="nx-empty" style="padding:24px 18px; text-align:left;">'
            + '<div style="font-size:0.92rem; color:rgba(196,226,250,0.92); margin-bottom:10px;">' + title + '</div>'
            + (safeLines.length
                ? '<div style="display:grid; gap:6px;">' + safeLines.map(function (line) {
                    return '<div style="font-size:0.78rem; color:rgba(193,212,235,0.82);">' + (uiHelpers?.escapeHtml ? uiHelpers.escapeHtml(line) : line) + '</div>';
                }).join('') + '</div>'
                : '<div style="font-size:0.78rem; color:rgba(140,170,205,0.7);">No details available.</div>')
            + '</div>';
    }

    async function executeNexusCommand(rawQuery, ui, scope) {
        const command = String(rawQuery || '').replace(/^>\s*/, '').trim().toLowerCase();
        const results = byId('esResults');

        if (command === 'reindex nexus' || command === 'rebuild nexus' || command === 'reindex') {
            const snapshot = await window.EveOS.SearchAdvanced?.Index?.rebuild?.({ reason: 'manual-command', force: true });
            if (typeof ui.updateFooterStats === 'function') await ui.updateFooterStats();
            renderCommandMessage(results, 'Nexus index rebuilt', (snapshot?.stats?.totalRecords || 0) + ' indexed records ready.');
            const trace = buildCommandTrace(command, 'reindex complete');
            syncSearchMonitor({
                isSearching: false,
                statusText: 'Nexus command',
                scopeLabel: 'Command',
                vectorStatus: 'cmd',
                resultsFound: String(snapshot?.stats?.totalRecords || 0),
                traceId: trace.id,
                traceSummary: trace.summary,
                trace: trace
            });
            ui.setMeta('Index rebuilt successfully.', false);
            return true;
        }

        if (command === 'show orphans') {
            const report = window.EveOS.SearchAdvanced?.CacheAggregator?.detectOrphanedLinks?.();
            if (report) {
                ui.renderOrphanList?.(report);
                const trace = buildCommandTrace(command, 'orphan diagnostics');
                syncSearchMonitor({
                    isSearching: false,
                    statusText: 'Nexus command',
                    scopeLabel: 'Command',
                    vectorStatus: 'cmd',
                    resultsFound: String(report.totalOrphaned || 0),
                    traceId: trace.id,
                    traceSummary: trace.summary,
                    trace: trace
                });
                return true;
            }
        }

        if (command === 'reveal hidden') {
            if (typeof config !== 'undefined') {
                config.showInactiveTabs = true;
                config.showHiddenSidebarGroups = true;
                if (typeof saveConfig === 'function') saveConfig();
                if (typeof renderSidebar === 'function') renderSidebar();
            }
            renderCommandMessage(results, 'Hidden tabs and groups revealed', 'Sidebar now shows inactive tabs and hidden groups.');
            const trace = buildCommandTrace(command, 'hidden content visible');
            syncSearchMonitor({
                isSearching: false,
                statusText: 'Nexus command',
                scopeLabel: 'Command',
                vectorStatus: 'cmd',
                resultsFound: '0',
                traceId: trace.id,
                traceSummary: trace.summary,
                trace: trace
            });
            ui.setMeta('Hidden sidebar content revealed.', false);
            return true;
        }

        if (command.startsWith('open card ')) {
            const cardQuery = command.replace(/^open card\s+/, '').trim();
            if (!cardQuery) return false;
            const local = await window.EveOS.SearchAdvanced?.Index?.search?.(cardQuery, scope, {
                activeVectors: { google: false, knowledge: false, cachedResults: false, bookmarks: true }
            });
            const target = (local?.records || []).find(function (record) {
                return record.type === 'card';
            });
            if (target && window.EveOS.SearchAdvanced?.Navigation?.openCard) {
                window.EveOS.SearchAdvanced.Navigation.openCard(target);
                renderCommandMessage(results, 'Opened card', target.title);
                const trace = buildCommandTrace(command, 'card navigation');
                syncSearchMonitor({
                    isSearching: false,
                    statusText: 'Nexus command',
                    scopeLabel: 'Command',
                    vectorStatus: 'cmd',
                    resultsFound: '1',
                    traceId: trace.id,
                    traceSummary: trace.summary,
                    trace: trace
                });
                ui.setMeta('Opened card "' + target.title + '".', false);
                return true;
            }

            renderCommandMessage(results, 'No card match', 'No matching card was found for "' + cardQuery + '".');
            const trace = buildCommandTrace(command, 'card navigation miss');
            syncSearchMonitor({
                isSearching: false,
                statusText: 'Nexus command',
                scopeLabel: 'Command',
                vectorStatus: 'cmd',
                resultsFound: '0',
                traceId: trace.id,
                traceSummary: trace.summary,
                trace: trace
            });
            ui.setMeta('No matching card found.', false);
            return true;
        }

        if (command.startsWith('open map ') || command.startsWith('map ')) {
            const mapQuery = command.startsWith('open map ')
                ? command.replace(/^open map\s+/, '').trim()
                : command.replace(/^map\s+/, '').trim();
            if (!mapQuery) return false;
            const local = await window.EveOS.SearchAdvanced?.Index?.search?.(mapQuery, scope, {
                activeVectors: { google: false, knowledge: true, cachedResults: true, bookmarks: true }
            });
            const target = (local?.records || [])[0];
            if (target && window.EveOS.SearchAdvanced?.Navigation?.openMap) {
                window.EveOS.SearchAdvanced.Navigation.openMap(target);
                renderCommandMessage(results, 'Opened Constellation Map', target.title || 'Top matching result');
                const trace = buildCommandTrace(command, 'constellation map');
                syncSearchMonitor({
                    isSearching: false,
                    statusText: 'Nexus command',
                    scopeLabel: 'Command',
                    vectorStatus: 'cmd',
                    resultsFound: '1',
                    traceId: trace.id,
                    traceSummary: trace.summary,
                    trace: trace
                });
                ui.setMeta('Opened Constellation Map for "' + (target.title || 'match') + '".', false);
                return true;
            }

            renderCommandMessage(results, 'No map target', 'No matching local result was found for "' + mapQuery + '".');
            const trace = buildCommandTrace(command, 'constellation map miss');
            syncSearchMonitor({
                isSearching: false,
                statusText: 'Nexus command',
                scopeLabel: 'Command',
                vectorStatus: 'cmd',
                resultsFound: '0',
                traceId: trace.id,
                traceSummary: trace.summary,
                trace: trace
            });
            ui.setMeta('No matching local result found for map view.', false);
            return true;
        }

        if (command.startsWith('inspect source ')) {
            const sourceQuery = command.replace(/^inspect source\s+/, '').trim();
            if (!sourceQuery) return false;
            const local = await window.EveOS.SearchAdvanced?.Index?.search?.(sourceQuery, scope, {
                activeVectors: { google: false, knowledge: true, cachedResults: true, bookmarks: true }
            });
            const target = (local?.records || [])[0];
            if (!target) {
                renderCommandMessage(results, 'No source match', 'No local Nexus result matched "' + sourceQuery + '".');
                const traceMiss = buildCommandTrace(command, 'inspect source miss');
                syncSearchMonitor({
                    isSearching: false,
                    statusText: 'Nexus command',
                    scopeLabel: 'Command',
                    vectorStatus: 'cmd',
                    resultsFound: '0',
                    traceId: traceMiss.id,
                    traceSummary: traceMiss.summary,
                    trace: traceMiss
                });
                ui.setMeta('No local result found to inspect.', false);
                return true;
            }

            const navigation = window.EveOS.SearchAdvanced?.Navigation;
            const lines = []
                .concat(['Top result: ' + (target.title || 'Untitled')])
                .concat(navigation?.describePath ? ['Path: ' + navigation.describePath(target.path)] : [])
                .concat(navigation?.describeVisibility ? navigation.describeVisibility(target) : [])
                .concat(navigation?.describeProvenance ? navigation.describeProvenance(target) : []);
            renderCommandDetailList(results, 'Source Inspection', lines);
            const trace = buildCommandTrace(command, 'inspect source');
            syncSearchMonitor({
                isSearching: false,
                statusText: 'Nexus command',
                scopeLabel: 'Command',
                vectorStatus: 'cmd',
                resultsFound: '1',
                traceId: trace.id,
                traceSummary: trace.summary,
                trace: trace
            });
            ui.setMeta('Inspected source for "' + target.title + '".', false);
            return true;
        }

        return false;
    }

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
