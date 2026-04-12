window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;

    function escHtml(v) {
        return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getAllLinks() {
        return Array.isArray(window.eveState?.links) ? window.eveState.links : (typeof window.links !== 'undefined' ? window.links : []);
    }

    function getConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {});
    }

    function getWorkspaces() {
        return getConfig().workspaces || [];
    }

    // --- Diagnostic Data Collectors ---

    function collectOverview() {
        const links = getAllLinks();
        const cfg = getConfig();
        const workspaces = getWorkspaces();
        const helpers = window.EveWorkspaceHelpers;
        const allWsIds = helpers?.flattenIds ? new Set(helpers.flattenIds(workspaces)) : new Set(workspaces.map(w => w?.id).filter(Boolean));
        if (allWsIds.size === 0) allWsIds.add('main');

        const orphanCount = links.filter(l => l && !allWsIds.has(String(l.workspace || 'main').trim())).length;
        const categorySet = new Set();
        const workspaceLinkCounts = {};
        links.forEach(function (l) {
            if (!l) return;
            const ws = String(l.workspace || 'main').trim();
            const cat = String(l.category || 'Unsorted').trim();
            categorySet.add(cat);
            workspaceLinkCounts[ws] = (workspaceLinkCounts[ws] || 0) + 1;
        });

        const largestWs = Object.entries(workspaceLinkCounts).sort((a, b) => b[1] - a[1])[0];

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

    function collectWorkspaceBreakdown() {
        const links = getAllLinks();
        const workspaces = getWorkspaces();
        const helpers = window.EveWorkspaceHelpers;
        const allWsIds = helpers?.flattenIds ? new Set(helpers.flattenIds(workspaces)) : new Set();
        const rows = [];

        // Count links per workspace
        const counts = {};
        links.forEach(function (l) {
            if (!l) return;
            const ws = String(l.workspace || 'main').trim();
            counts[ws] = (counts[ws] || 0) + 1;
        });

        // Known workspaces
        const flat = helpers?.flatten ? helpers.flatten(workspaces) : workspaces;
        flat.forEach(function (ws) {
            if (!ws) return;
            const id = String(ws.id);
            rows.push({
                id: id,
                name: ws.name || id,
                icon: ws.icon || '📁',
                linkCount: counts[id] || 0,
                status: 'active',
                depth: helpers?.getDepth ? helpers.getDepth(workspaces, id) : 0
            });
        });

        // Ghost workspaces (orphaned)
        Object.keys(counts).forEach(function (wsId) {
            if (!allWsIds.has(wsId) && !rows.some(r => r.id === wsId)) {
                rows.push({
                    id: wsId,
                    name: wsId,
                    icon: '👻',
                    linkCount: counts[wsId],
                    status: 'orphaned',
                    depth: 0
                });
            }
        });

        return rows.sort((a, b) => b.linkCount - a.linkCount);
    }

    function collectPerformanceInfo() {
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
                : 'N/A'
        };
    }

    // --- Render ---

    function renderDebugPanel(container) {
        const overview = collectOverview();
        const wsBreakdown = collectWorkspaceBreakdown();
        const perf = collectPerformanceInfo();

        let html = '<div class="nx-debug-panel">';

        // Overview
        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">📊 DATA OVERVIEW</div>';
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

        // Orphan Alert
        if (overview.orphanedLinks > 0) {
            html += '<div class="nx-debug-section nx-debug-alert">';
            html += '<div class="nx-debug-section-title">⚠ ORPHANED BOOKMARKS</div>';
            html += '<p>' + overview.orphanedLinks + ' link(s) reference deleted workspaces.</p>';
            html += '<button type="button" class="nx-debug-action-btn" id="nxDebugRescueBtn">🔄 Rescue Orphans</button>';
            html += '</div>';
        }

        // Performance
        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">⚡ PERFORMANCE</div>';
        html += '<table class="nx-debug-table">';
        html += '<tr><td>Perf Mode</td><td class="' + (perf.perfMode ? 'nx-debug-on' : 'nx-debug-off') + '">' + (perf.perfMode ? 'ACTIVE' : 'OFF') + '</td></tr>';
        html += '<tr><td>Masonry Layout</td><td>' + (perf.masonryDisabled ? 'Disabled (perf)' : 'Active') + '</td></tr>';
        html += '<tr><td>Folder Cache Entries</td><td>' + overview.folderViewCacheSize + '</td></tr>';
        html += '<tr><td>Link Render Cap</td><td>' + perf.linkItemCap + '</td></tr>';
        html += '<tr><td>JS Heap</td><td>' + perf.memoryUsage + '</td></tr>';
        html += '</table></div>';

        // Workspace Breakdown
        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">🗂 WORKSPACE BREAKDOWN</div>';
        html += '<div class="nx-debug-ws-list">';
        wsBreakdown.forEach(function (ws) {
            const depthPad = ws.depth > 0 ? 'style="padding-left:' + (ws.depth * 12) + 'px"' : '';
            const statusClass = ws.status === 'orphaned' ? ' nx-debug-orphan' : '';
            html += '<div class="nx-debug-ws-row' + statusClass + '" ' + depthPad + '>';
            html += '<span class="nx-debug-ws-icon">' + escHtml(ws.icon) + '</span>';
            html += '<span class="nx-debug-ws-name">' + escHtml(ws.name) + '</span>';
            html += '<span class="nx-debug-ws-count">' + ws.linkCount + '</span>';
            if (ws.status === 'orphaned') html += '<span class="nx-debug-ws-badge">ghost</span>';
            html += '</div>';
        });
        html += '</div></div>';

        // Actions
        html += '<div class="nx-debug-section"><div class="nx-debug-section-title">🛠 ACTIONS</div>';
        html += '<div class="nx-debug-actions">';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugClearFolderCache">Clear Folder Cache</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugForceRender">Force Re-render</button>';
        html += '<button type="button" class="nx-debug-action-btn" id="nxDebugRefreshDiag">Refresh Diagnostics</button>';
        html += '</div></div>';

        html += '</div>';
        container.innerHTML = html;

        // Wire up action buttons
        var rescueBtn = document.getElementById('nxDebugRescueBtn');
        if (rescueBtn) {
            rescueBtn.onclick = function () {
                var Agg = ns.CacheAggregator;
                if (Agg?.rescueOrphanedLinks) {
                    var result = Agg.rescueOrphanedLinks();
                    if (typeof showToast === 'function') showToast('Rescued ' + result.rescued + ' links into ' + result.restoredTabs.length + ' tab(s)', 'success');
                    renderDebugPanel(container);
                }
            };
        }

        var clearCacheBtn = document.getElementById('nxDebugClearFolderCache');
        if (clearCacheBtn) {
            clearCacheBtn.onclick = function () {
                if (window.EveFolderViewV2?._viewModelCache) window.EveFolderViewV2._viewModelCache = {};
                if (typeof showToast === 'function') showToast('Folder cache cleared', 'info');
                renderDebugPanel(container);
            };
        }

        var forceRenderBtn = document.getElementById('nxDebugForceRender');
        if (forceRenderBtn) {
            forceRenderBtn.onclick = function () {
                if (typeof renderDashboard === 'function') renderDashboard();
                if (typeof showToast === 'function') showToast('Dashboard re-rendered', 'info');
            };
        }

        var refreshBtn = document.getElementById('nxDebugRefreshDiag');
        if (refreshBtn) {
            refreshBtn.onclick = function () { renderDebugPanel(container); };
        }
    }

    ns.DebugView = {
        collectOverview,
        collectWorkspaceBreakdown,
        collectPerformanceInfo,
        renderDebugPanel
    };
})();
