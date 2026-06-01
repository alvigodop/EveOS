window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const Modules = window.EveOS.SearchAdvanced.Modules || {};
    const { syncSearchMonitor, buildCommandTrace } = Modules.UiMonitor || {};
    window.EveOS.SearchAdvanced.UICommands = window.EveOS.SearchAdvanced.UICommands || {};
    window.EveOS.SearchAdvanced.UICommands.create = function createUiCommandExecutor(deps) {
        const byId = deps.byId;
        const getUiHelpers = deps.getUiHelpers;
        const uiHelpers = getUiHelpers();

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

        return executeNexusCommand;
    };
})();
