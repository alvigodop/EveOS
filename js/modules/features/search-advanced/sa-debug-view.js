window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;

    function escHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function text(value, fallback) {
        const normalized = String(value ?? '').trim();
        return normalized || String(fallback ?? '').trim();
    }

    function getAllLinks() {
        if (typeof window.getLiveLinks === 'function') {
            return window.getLiveLinks();
        }
        return Array.isArray(window.eveState?.links)
            ? window.eveState.links
            : (typeof window.links !== 'undefined' ? window.links : []);
    }

    function getConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {});
    }

    function getWorkspaces() {
        return getConfig().workspaces || [];
    }

    function collectOverview() {
        const links = getAllLinks();
        const cfg = getConfig();
        const workspaces = getWorkspaces();
        const helpers = window.EveWorkspaceHelpers;
        const allWsIds = helpers?.flattenIds
            ? new Set(helpers.flattenIds(workspaces))
            : new Set(workspaces.map(function (workspace) { return workspace?.id; }).filter(Boolean));
        if (allWsIds.size === 0) allWsIds.add('main');

        const orphanCount = links.filter(function (link) {
            return link && !allWsIds.has(String(link.workspace || 'main').trim());
        }).length;
        const categorySet = new Set();
        const workspaceLinkCounts = {};

        links.forEach(function (link) {
            if (!link) return;
            const ws = String(link.workspace || 'main').trim();
            const cat = String(link.category || 'Unsorted').trim();
            categorySet.add(cat);
            workspaceLinkCounts[ws] = (workspaceLinkCounts[ws] || 0) + 1;
        });

        const largestWs = Object.entries(workspaceLinkCounts).sort(function (left, right) {
            return Number(right[1] || 0) - Number(left[1] || 0);
        })[0];

        return {
            totalLinks: links.length,
            totalWorkspaces: allWsIds.size,
            totalCategories: categorySet.size,
            orphanedLinks: orphanCount,
            activeWorkspace: String(cfg.activeWorkspace || 'main'),
            perfMode: !!window._evePerfMode,
            viewMode: cfg.viewMode || 'grid',
            largestWorkspace: largestWs ? { id: largestWs[0], count: largestWs[1] } : null,
            folderViewCacheSize: Object.keys(window.EveFolderViewV2?._viewModelCache || {}).length,
            configKeys: Object.keys(cfg).length
        };
    }

    function collectPerformanceInfo() {
        const indexStats = window.EveOS?.SearchAdvanced?.Index?.getStats?.() || {};
        return {
            perfMode: !!window._evePerfMode,
            masonryDisabled: !!window._evePerfMode,
            saveDataDebounced: true,
            saveConfigDebounced: true,
            folderCacheHit: Object.keys(window.EveFolderViewV2?._viewModelCache || {}).length > 0,
            progressiveRenderCap: 50,
            linkItemCap: window._evePerfMode ? 50 : 'unlimited',
            memoryUsage: (performance?.memory?.usedJSHeapSize)
                ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB'
                : 'N/A',
            nexusIndexedRecords: indexStats.totalRecords || 0,
            nexusIndexedCards: indexStats.cardCount || 0,
            nexusIndexedProviders: indexStats.providerCount || 0
        };
    }

    async function collectDatapackSpineInfo() {
        const scopeApi = window.EveOS?.SearchAdvanced?.UI;
        const indexApi = window.EveOS?.SearchAdvanced?.Index;
        const scopeMode = scopeApi?.getCurrentScopeMode?.() || 'current';
        const scope = scopeApi?.getResolvedScope?.(scopeMode) || null;
        const scopeLabel = scopeApi?.getScopeLabel?.(scopeMode) || (scopeMode === 'all' ? 'All Tabs' : 'Current Scope');

        if (!indexApi?.ensureFresh) {
            return {
                scopeMode,
                scope,
                scopeLabel,
                integrity: null,
                graph: null,
                topWorkspaces: []
            };
        }

        const snapshot = await indexApi.ensureFresh();
        const integrity = indexApi.getIntegrityReport
            ? await indexApi.getIntegrityReport({ snapshot, scope })
            : null;
        const projection = indexApi.buildGraphProjection
            ? await indexApi.buildGraphProjection({ snapshot, scope })
            : null;
        const folderIntegrity = window.EveBookmarkFolders?.collectFolderIntegrity
            ? window.EveBookmarkFolders.collectFolderIntegrity({ scope })
            : null;
        const kindCounts = (projection?.nodes || []).reduce(function (acc, node) {
            const key = String(node?.kind || 'node');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const topWorkspaces = Object.entries(integrity?.byWorkspace || {})
            .sort(function (left, right) {
                return Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0]));
            })
            .slice(0, 5);

        return {
            scopeMode,
            scope,
            scopeLabel,
            integrity,
            folderIntegrity,
            graph: {
                nodeCount: projection?.nodes?.length || 0,
                edgeCount: projection?.edges?.length || 0,
                kindCounts
            },
            topWorkspaces
        };
    }

    function openScopeMap(scope) {
        const mapApi = window.EveConstellationMap;
        if (!mapApi) return false;
        if (!scope || (!scope.workspaceId && !scope.categoryName)) {
            if (typeof mapApi.openAllMap === 'function') {
                mapApi.openAllMap();
                return true;
            }
            return false;
        }
        if (scope.workspaceId && scope.categoryName && typeof mapApi.openCardMap === 'function') {
            mapApi.openCardMap(scope.workspaceId, scope.categoryName);
            return true;
        }
        if (scope.workspaceId && typeof mapApi.openWorkspaceMap === 'function') {
            mapApi.openWorkspaceMap(scope.workspaceId);
            return true;
        }
        return false;
    }

    function renderMiniList(entries) {
        if (!entries.length) return '';
        return '<div class="nx-debug-mini-list">' + entries.map(function (entry) {
            return '<div class="nx-debug-mini-row"><span>' + escHtml(entry[0]) + '</span><span>' + entry[1] + '</span></div>';
        }).join('') + '</div>';
    }

    function renderIssueList(issues, truncatedCount) {
        const rows = (Array.isArray(issues) ? issues : []).slice(0, 8);
        if (!rows.length && !truncatedCount) return '';
        let html = '<div class="nx-debug-mini-list">';
        rows.forEach(function (issue) {
            const label = [
                issue.severity || 'info',
                issue.type || 'result',
                issue.title || 'Untitled'
            ].join(' / ');
            const reason = Array.isArray(issue.reasons) && issue.reasons.length
                ? issue.reasons[0]
                : (issue.pathLabel || issue.workspaceLabel || '');
            html += '<div class="nx-debug-mini-row"><span>' + escHtml(label) + '</span><span>' + escHtml(reason) + '</span></div>';
        });
        if (truncatedCount) {
            html += '<div class="nx-debug-mini-row"><span>more issues</span><span>' + truncatedCount + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    function collectWorkspaceBreakdown() {
        return ns.DebugWorkspace?.collectWorkspaceBreakdown?.() || [];
    }

    async function collectWorkspaceDetail(workspaceId, options = {}) {
        return await ns.DebugWorkspace?.collectWorkspaceDetail?.(workspaceId, options) || null;
    }

    async function renderDebugPanel(container) {
        if (!container) return;
        container.innerHTML = '<div class="nx-debug-placeholder" style="padding:12px; text-align:center; color:rgba(128,128,128,0.6); font-size:0.78rem;">Loading diagnostics...</div>';

        const workspaceDebug = ns.DebugWorkspace || {};
        const workspaceState = workspaceDebug.debugState || (ns.DebugViewState = ns.DebugViewState || { selectedWorkspaceId: '' });
        const overview = collectOverview();
        const wsBreakdown = collectWorkspaceBreakdown();
        const perf = collectPerformanceInfo();
        const spine = await collectDatapackSpineInfo();
        const activeWorkspaceId = text(getConfig().activeWorkspace, 'main');
        const hasSelectedWorkspace = wsBreakdown.some(function (workspace) {
            return workspace.id === workspaceState.selectedWorkspaceId;
        });
        if (!workspaceState.selectedWorkspaceId || !hasSelectedWorkspace) {
            workspaceState.selectedWorkspaceId = wsBreakdown.some(function (workspace) { return workspace.id === activeWorkspaceId; })
                ? activeWorkspaceId
                : text(wsBreakdown[0]?.id, '');
        }
        const selectedWorkspaceDetail = workspaceState.selectedWorkspaceId
            ? await collectWorkspaceDetail(workspaceState.selectedWorkspaceId, {
                snapshot: window.EveOS?.SearchAdvanced?.Index?.getSnapshot?.()
            })
            : null;

        let html = '<div class="nx-debug-panel">';

        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">DATA OVERVIEW</div>';
        html += '<table class="nx-debug-table">';
        html += '<tr><td>Total Links</td><td>' + overview.totalLinks + '</td></tr>';
        html += '<tr><td>Total Workspaces (Tabs)</td><td>' + overview.totalWorkspaces + '</td></tr>';
        html += '<tr><td>Total Categories (Cards)</td><td>' + overview.totalCategories + '</td></tr>';
        html += '<tr><td>Active Workspace</td><td>' + escHtml(overview.activeWorkspace) + '</td></tr>';
        html += '<tr><td>View Mode</td><td>' + escHtml(overview.viewMode) + '</td></tr>';
        html += '<tr><td>Config Keys</td><td>' + overview.configKeys + '</td></tr>';
        if (overview.largestWorkspace) {
            html += '<tr><td>Largest Tab</td><td>' + escHtml(overview.largestWorkspace.id) + ' (' + overview.largestWorkspace.count + ' links)</td></tr>';
        }
        html += '</table></div>';

        if (overview.orphanedLinks > 0) {
            html += '<div class="nx-debug-section nx-debug-alert">';
            html += '<div class="nx-debug-section-title">ORPHANED BOOKMARKS</div>';
            html += '<p>' + overview.orphanedLinks + ' link(s) reference deleted workspaces.</p>';
            html += '<button type="button" class="nx-debug-action-btn" id="nxDebugRescueBtn">Rescue Orphans</button>';
            html += '</div>';
        }

        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">PERFORMANCE</div>';
        html += '<table class="nx-debug-table">';
        html += '<tr><td>Perf Mode</td><td class="' + (perf.perfMode ? 'nx-debug-on' : 'nx-debug-off') + '">' + (perf.perfMode ? 'ACTIVE' : 'OFF') + '</td></tr>';
        html += '<tr><td>Masonry Layout</td><td>' + (perf.masonryDisabled ? 'Disabled (perf)' : 'Active') + '</td></tr>';
        html += '<tr><td>Folder Cache Entries</td><td>' + overview.folderViewCacheSize + '</td></tr>';
        html += '<tr><td>Link Render Cap</td><td>' + perf.linkItemCap + '</td></tr>';
        html += '<tr><td>JS Heap</td><td>' + perf.memoryUsage + '</td></tr>';
        html += '<tr><td>Nexus Indexed Records</td><td>' + perf.nexusIndexedRecords + '</td></tr>';
        html += '<tr><td>Nexus Indexed Cards</td><td>' + perf.nexusIndexedCards + '</td></tr>';
        html += '<tr><td>Nexus Indexed Providers</td><td>' + perf.nexusIndexedProviders + '</td></tr>';
        html += '</table></div>';
        html += ns.DebugDrilldowns?.renderPerformanceHints?.(perf, overview) || '';

        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">DATAPACK SPINE</div>';
        if (spine.integrity) {
            html += '<table class="nx-debug-table">';
            html += '<tr><td>Nexus Scope</td><td>' + escHtml(spine.scopeLabel) + '</td></tr>';
            html += '<tr><td>Records In Scope</td><td>' + spine.integrity.totalRecords + '</td></tr>';
            html += '<tr><td>Hidden / Indirect</td><td>' + spine.integrity.hiddenRecords + ' / ' + spine.integrity.indirectRecords + '</td></tr>';
            html += '<tr><td>Broken / Orphaned</td><td>' + spine.integrity.brokenRecords + ' / ' + spine.integrity.orphanedRecords + '</td></tr>';
            html += '<tr><td>Stale / Aging</td><td>' + spine.integrity.staleRecords + ' / ' + spine.integrity.agingRecords + '</td></tr>';
            html += '<tr><td>Linked Library / Done</td><td>' + spine.integrity.linkedLibraryRecords + ' / ' + spine.integrity.doneRecords + '</td></tr>';
            html += '<tr><td>Issue Details</td><td>' + (spine.integrity.issueCount || 0) + '</td></tr>';
            if (spine.folderIntegrity) {
                html += '<tr><td>Folder Disturbances</td><td>' + (spine.folderIntegrity.issueCount || 0) + '</td></tr>';
                html += '<tr><td>Broken / Unreachable Folders</td><td>' + spine.folderIntegrity.brokenFolderCount + ' / ' + spine.folderIntegrity.unreachableFolderCount + '</td></tr>';
                html += '<tr><td>Missing / Hidden Folder Bookmarks</td><td>' + spine.folderIntegrity.missingFolderBookmarkCount + ' / ' + spine.folderIntegrity.unreachableBookmarkCount + '</td></tr>';
            }
            html += '<tr><td>Graph Nodes / Edges</td><td>' + spine.graph.nodeCount + ' / ' + spine.graph.edgeCount + '</td></tr>';
            html += '<tr><td>Graph Kinds</td><td>' + Object.entries(spine.graph.kindCounts).map(function (entry) {
                return escHtml(entry[0]) + ':' + entry[1];
            }).join(' · ') + '</td></tr>';
            html += '</table>';
            if (ns.DebugDrilldowns?.renderSpineDrilldowns) {
                html += ns.DebugDrilldowns.renderSpineDrilldowns(spine);
            } else {
                html += renderMiniList(spine.topWorkspaces);
                html += renderMiniList(Object.entries(spine.integrity.byReason || {})
                    .sort(function (left, right) {
                        return Number(right[1] || 0) - Number(left[1] || 0);
                    })
                    .slice(0, 5));
                html += renderIssueList(spine.integrity.issues || [], spine.integrity.truncatedIssueCount || 0);
            }
        } else {
            html += '<div style="font-size:0.74rem; color:rgba(140,170,205,0.7);">Nexus index is unavailable.</div>';
        }
        html += '</div>';

        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">WORKSPACE BREAKDOWN</div>';
        if (workspaceDebug.renderWorkspaceBreakdown) {
            html += workspaceDebug.renderWorkspaceBreakdown(wsBreakdown, workspaceState.selectedWorkspaceId);
            html += workspaceDebug.renderWorkspaceDetail
                ? workspaceDebug.renderWorkspaceDetail(selectedWorkspaceDetail)
                : '';
        } else {
            html += renderMiniList(wsBreakdown.map(function (workspace) {
                return [workspace.name || workspace.id, workspace.linkCount || 0];
            }));
        }
        html += '</div>';

        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">ACTIONS</div>';
        html += '<div class="nx-debug-actions">';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugClearFolderCache">Clear Folder Cache</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugForceRender">Force Re-render</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugResetLoading">Reset Loading State</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugReindexNexus">Reindex Nexus</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugRepairFolders">Repair Folder Paths</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugOpenScopeMap">Open Scope Map</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugRefreshDiag">Refresh Diagnostics</button>';
        html += '</div></div>';

        html += '</div>';
        container.innerHTML = html;

        workspaceDebug.bindWorkspaceInteractions?.(container, renderDebugPanel);
        ns.DebugDrilldowns?.bindDrilldownInteractions?.(container, renderDebugPanel);

        const rescueBtn = document.getElementById('nxDebugRescueBtn');
        if (rescueBtn) {
            rescueBtn.onclick = function () {
                const Agg = ns.CacheAggregator;
                if (!Agg?.rescueOrphanedLinks) return;
                const result = Agg.rescueOrphanedLinks();
                if (typeof showToast === 'function') {
                    showToast('Rescued ' + result.rescued + ' links into ' + result.restoredTabs.length + ' tab(s)', 'success');
                }
                renderDebugPanel(container);
            };
        }

        const clearCacheBtn = document.getElementById('nxDebugClearFolderCache');
        if (clearCacheBtn) {
            clearCacheBtn.onclick = function () {
                if (window.EveFolderViewV2?._viewModelCache) window.EveFolderViewV2._viewModelCache = {};
                if (typeof showToast === 'function') showToast('Folder cache cleared', 'info');
                renderDebugPanel(container);
            };
        }

        const forceRenderBtn = document.getElementById('nxDebugForceRender');
        if (forceRenderBtn) {
            forceRenderBtn.onclick = function () {
                if (typeof renderDashboard === 'function') renderDashboard();
                if (typeof showToast === 'function') showToast('Dashboard re-rendered', 'info');
            };
        }

        const resetLoadingBtn = document.getElementById('nxDebugResetLoading');
        if (resetLoadingBtn) {
            resetLoadingBtn.onclick = function () {
                if (window.LoadingIndicator?.forceReset) {
                    window.LoadingIndicator.forceReset();
                    if (typeof showToast === 'function') showToast('Loading state reset', 'info');
                } else if (typeof showToast === 'function') {
                    showToast('LoadingIndicator not available', 'warning');
                }
            };
        }

        const refreshBtn = document.getElementById('nxDebugRefreshDiag');
        if (refreshBtn) {
            refreshBtn.onclick = function () {
                renderDebugPanel(container);
            };
        }

        const openScopeMapBtn = document.getElementById('nxDebugOpenScopeMap');
        if (openScopeMapBtn) {
            openScopeMapBtn.onclick = function () {
                if (openScopeMap(spine.scope)) {
                    if (typeof showToast === 'function') showToast('Opened Constellation Map for ' + spine.scopeLabel, 'info');
                } else if (typeof showToast === 'function') {
                    showToast('Constellation Map is not available', 'warning');
                }
            };
        }

        const reindexBtn = document.getElementById('nxDebugReindexNexus');
        if (reindexBtn) {
            reindexBtn.onclick = async function () {
                await window.EveOS?.SearchAdvanced?.Index?.rebuild?.({ reason: 'debug-panel', force: true });
                if (typeof showToast === 'function') showToast('Nexus index rebuilt', 'info');
                renderDebugPanel(container);
            };
        }

        const repairFoldersBtn = document.getElementById('nxDebugRepairFolders');
        if (repairFoldersBtn) {
            repairFoldersBtn.onclick = async function () {
                const repairApi = window.EveBookmarkFolders?.repairFolderIntegrity;
                if (typeof repairApi !== 'function') {
                    if (typeof showToast === 'function') showToast('Folder repair is not available', 'warning');
                    return;
                }
                const result = repairApi({ scope: spine.scope });
                await window.EveOS?.SearchAdvanced?.Index?.rebuild?.({ reason: 'folder-integrity-repair', force: true });
                if (typeof renderDashboard === 'function') renderDashboard();
                if (typeof showToast === 'function') {
                    showToast('Repaired ' + result.rootedFolders + ' folder paths and moved ' + result.movedBookmarksToRoot + ' orphaned bookmarks to card root', 'success');
                }
                renderDebugPanel(container);
            };
        }
    }

    ns.DebugView = {
        collectOverview,
        collectWorkspaceBreakdown,
        collectWorkspaceDetail,
        collectPerformanceInfo,
        collectDatapackSpineInfo,
        renderDebugPanel
    };
})();
