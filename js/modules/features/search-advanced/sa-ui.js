window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const State = window.EveOS.SearchAdvanced.State;
    const Api = window.EveOS.SearchAdvanced.Api;
    const Modules = window.EveOS.SearchAdvanced.Modules || {};

    let uiHelpers = null;
    let activeScope = null;

    function getUiHelpers() {
        if (!uiHelpers) {
            uiHelpers = Modules.createUiHelpers({
                onRunSearch: runSearch,
                onClearFilters: clearFilters
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

    function resolveCurrentScope(scopeMode) {
        const mode = scopeMode === 'all' ? 'all' : getCurrentScopeMode();
        if (mode === 'all') return {};
        if (activeScope && (activeScope.workspaceId || activeScope.categoryName)) return activeScope;

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

    function syncSearchMonitor(state) {
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) return;

        const setText = function (selector, value) {
            const node = indicator.querySelector(selector);
            if (node) node.textContent = String(value || '');
        };

        indicator.classList.toggle('searching', !!state?.isSearching);
        indicator.classList.remove('error');
        setText('#searchStatusLabel', 'Nexus:');
        setText('#wikisSearchedLabel', 'Vectors:');
        setText('#resultsFoundLabel', 'Results:');
        setText('.status-text', state?.statusText || 'Nexus Search');
        setText('#searchStatus', state?.scopeLabel || 'Scoped');
        setText('#wikisSearched', state?.vectorStatus || '0');
        setText('#resultsFound', state?.resultsFound || '0');
        setText('#nexusTrace', state?.traceSummary || state?.traceId || '—');

        const dot = indicator.querySelector('.dot');
        if (dot) {
            dot.style.background = state?.isSearching ? '#6ee7ff' : '#9fd7e6';
        }

        if (state?.trace && window.SearchMonitorBoot?.recordNexusTrace) {
            window.SearchMonitorBoot.recordNexusTrace(state.trace);
        }
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

    function buildCommandTrace(command, summary) {
        const stamp = Date.now();
        return {
            id: 'CMD-' + stamp.toString(36).toUpperCase(),
            startedAt: stamp,
            endedAt: stamp,
            totalMs: 0,
            command: command,
            summary: summary,
            vectors: {}
        };
    }

    function countSatisfiedVectors(stats, settings) {
        const active = settings?.activeVectors || {};
        let count = 0;
        if (active.bookmarks && ((stats?.bookmarks || 0) > 0 || (stats?.cards || 0) > 0 || (stats?.library || 0) > 0)) count += 1;
        if (active.knowledge && (stats?.knowledge || 0) > 0) count += 1;
        if (active.cachedResults && (stats?.cached || 0) > 0) count += 1;
        if (active.google && (stats?.google || 0) > 0) count += 1;
        return count;
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

    function openExpandedSearchModal(options) {
        const ui = getUiHelpers();
        ui.createModalIfNeeded();
        activeScope = (options?.scope && (options.scope.workspaceId || options.scope.categoryName))
            ? options.scope
            : null;

        const settings = State.getSettings();
        const scopeModeOverride = options?.scopeMode
            || (options?.scope && !options.scope.workspaceId && !options.scope.categoryName ? 'all' : '');
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
