// --- TAB NAVIGATION HISTORY & SIDEBAR POPOVER ---
// Provides back/forward workspace navigation, breadcrumb path display,
// and hover actions for global sidebar controls.
(function () {
    'use strict';

    var DEFAULT_ICON = '\u{1F4C1}';
    var MAX_HISTORY = 50;
    var history = [];
    var historyIndex = -1;
    var suppressPush = false;
    var popoverEl = null;
    var hideTimeout = null;
    var routePeekEl = null;
    var routePeekHideTimeout = null;
    var searchResultsCache = [];

    function pushHistory(wsId) {
        if (suppressPush) return;
        var id = String(wsId || '').trim();
        if (!id) return;
        if (historyIndex >= 0 && history[historyIndex] === id) return;
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(id);
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;
    }

    function canGoBack() {
        return historyIndex > 0;
    }

    function canGoForward() {
        return historyIndex < history.length - 1;
    }

    function goBack() {
        if (!canGoBack()) return;
        historyIndex -= 1;
        navigateTo(history[historyIndex]);
        updatePopoverState();
    }

    function goForward() {
        if (!canGoForward()) return;
        historyIndex += 1;
        navigateTo(history[historyIndex]);
        updatePopoverState();
    }

    function navigateTo(wsId) {
        suppressPush = true;
        if (typeof window.switchWorkspace === 'function') {
            window.switchWorkspace(wsId);
        }
        suppressPush = false;
    }

    function hookSwitchWorkspace() {
        var originalSwitch = window.switchWorkspace;
        if (!originalSwitch || originalSwitch._tabNavHooked) return;
        window.switchWorkspace = function (id, options) {
            originalSwitch.call(this, id, options);
            pushHistory(String(id || '').trim() || String(config?.workspaces?.[0]?.id || 'main'));
            updatePopoverState();
        };
        window.switchWorkspace._tabNavHooked = true;
        pushHistory(String(config?.activeWorkspace || 'main').trim() || 'main');
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = String(str == null ? '' : str);
        return div.innerHTML;
    }

    function getWorkspaceHelpers() {
        return window.EveWorkspaceHelpers || null;
    }

    function getConfigRef() {
        if (typeof config !== 'undefined' && config) return config;
        return window.config || null;
    }

    function getSidebarGroupsApi() {
        return window.EveSidebarGroups || null;
    }

    function toSuperscriptNumber(value) {
        var digits = String(Math.max(0, Number(value) || 0));
        var superscriptMap = {
            '0': '\u2070',
            '1': '\u00B9',
            '2': '\u00B2',
            '3': '\u00B3',
            '4': '\u2074',
            '5': '\u2075',
            '6': '\u2076',
            '7': '\u2077',
            '8': '\u2078',
            '9': '\u2079'
        };

        return digits.split('').map(function (digit) {
            return superscriptMap[digit] || digit;
        }).join('');
    }

    function getWorkspaceDepthLabelText(depth) {
        var level = Math.max(0, Number(depth) || 0);
        if (level === 0) return 'Tab';
        if (level === 1) return 'Sub-tab';
        return 'Sub' + toSuperscriptNumber(level) + '-tab';
    }

    function buildBreadcrumbPath(wsId) {
        var helpers = getWorkspaceHelpers();
        if (!helpers) return [{ id: wsId, name: wsId, icon: DEFAULT_ICON }];
        var workspaces = config?.workspaces || [];
        var current = helpers.findById(workspaces, wsId);
        if (!current) return [{ id: wsId, name: wsId, icon: DEFAULT_ICON }];

        var path = [{ id: current.id, name: current.name, icon: current.icon || DEFAULT_ICON }];
        var parent = helpers.findParent(workspaces, current.id);
        while (parent) {
            path.unshift({ id: parent.id, name: parent.name, icon: parent.icon || DEFAULT_ICON });
            parent = helpers.findParent(workspaces, parent.id);
        }
        return path;
    }

    function walkWorkspaces(fn) {
        var helpers = getWorkspaceHelpers();
        var workspaces = config?.workspaces || [];
        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk(workspaces, fn);
            return;
        }
        (function walk(list, depth) {
            if (!Array.isArray(list)) return;
            list.forEach(function (ws) {
                if (!ws) return;
                fn(ws, depth);
                if (Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                    walk(ws.subTabs, depth + 1);
                }
            });
        })(workspaces, 0);
    }

    function saveAndRefreshSidebar() {
        if (typeof window.saveConfig === 'function') window.saveConfig({ immediate: true });
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
    }

    function collapseAllTabs() {
        var configRef = getConfigRef();
        if (!configRef) return;
        var collapsedIds = new Set(Array.isArray(configRef.collapsedTabs) ? configRef.collapsedTabs.map(String) : []);
        walkWorkspaces(function (ws) {
            if (Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                collapsedIds.add(String(ws.id));
            }
        });
        configRef.collapsedTabs = Array.from(collapsedIds);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All tabs collapsed', 'info');
        updatePopoverState();
    }

    function expandAllTabs() {
        var configRef = getConfigRef();
        if (!configRef) return;
        configRef.collapsedTabs = [];
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All tabs expanded', 'info');
        updatePopoverState();
    }

    function toggleShowInactiveTabs() {
        var configRef = getConfigRef();
        if (!configRef) return;
        configRef.showInactiveTabs = !configRef.showInactiveTabs;
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(configRef.showInactiveTabs ? 'Showing inactive tabs' : 'Hiding inactive tabs', 'info');
        }
        updatePopoverState();
    }

    function createSidebarGroup() {
        if (typeof window.openSidebarGroupModal === 'function') {
            window.openSidebarGroupModal();
        }
        scheduleHide(120);
    }

    function collapseAllGroups() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        if (!groupsApi.getGroups(configRef).length) {
            if (typeof window.showToast === 'function') window.showToast('No groups to collapse', 'info');
            return;
        }
        groupsApi.collapseAllGroups(configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All groups collapsed', 'info');
        updatePopoverState();
    }

    function expandAllGroups() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        if (!groupsApi.getGroups(configRef).length) {
            if (typeof window.showToast === 'function') window.showToast('No groups to expand', 'info');
            return;
        }
        groupsApi.expandAllGroups(configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All groups expanded', 'info');
        updatePopoverState();
    }

    function toggleShowHiddenGroups() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        groupsApi.setShowHiddenGroups(undefined, configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(configRef.showHiddenSidebarGroups ? 'Showing hidden groups' : 'Hiding hidden groups', 'info');
        }
        updatePopoverState();
    }

    function toggleSidebarOrderMode() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        var nextMode = groupsApi.getSidebarOrderMode(configRef) === 'manual' ? 'auto' : 'manual';
        groupsApi.setSidebarOrderMode(nextMode, configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(
                nextMode === 'manual'
                    ? 'Manual sidebar order enabled. Drag groups, tabs, and sub-tabs to reposition them.'
                    : 'Sidebar order returned to automatic mode',
                'info'
            );
        }
        updatePopoverState();
    }

    function resetManualSidebarOrder() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        groupsApi.setSidebarOrderMode('manual', configRef);
        groupsApi.resetManualOrder(configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast('Manual sidebar layout reset to the automatic baseline', 'info');
        }
        updatePopoverState();
    }

    function updateSidebarActionLabels(pop) {
        if (!pop) return;
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        var inactiveBtn = pop.querySelector('[data-tab-nav-action="toggle-inactive"]');
        if (inactiveBtn) {
            inactiveBtn.innerHTML = configRef?.showInactiveTabs
                ? '&#128065; Hide Inactive Tabs'
                : '&#128065; Show Inactive Tabs';
        }

        var hiddenGroupsBtn = pop.querySelector('[data-tab-nav-action="toggle-hidden-groups"]');
        if (hiddenGroupsBtn) {
            hiddenGroupsBtn.innerHTML = configRef?.showHiddenSidebarGroups
                ? '&#128065; Hide Hidden Groups'
                : '&#128065; Show Hidden Groups';
        }

        if (groupsApi && configRef) {
            groupsApi.ensureConfigDefaults(configRef);

            var orderMode = groupsApi.getSidebarOrderMode(configRef);
            var orderModeBtn = pop.querySelector('[data-tab-nav-action="toggle-order-mode"]');
            if (orderModeBtn) {
                orderModeBtn.innerHTML = orderMode === 'manual'
                    ? '&#8645; Use Automatic Order'
                    : '&#8645; Enable Manual Order';
            }

            var resetOrderBtn = pop.querySelector('[data-tab-nav-action="reset-order"]');
            if (resetOrderBtn) {
                resetOrderBtn.style.display = orderMode === 'manual' ? '' : 'none';
                resetOrderBtn.innerHTML = '&#8635; Reset Manual Layout';
            }
        }
    }

    function getWorkspaceSearchItems() {
        var items = [];
        var configRef = getConfigRef();
        if (!configRef) return items;

        var helpers = getWorkspaceHelpers();
        var groupsApi = getSidebarGroupsApi();
        var groupMap = groupsApi && typeof groupsApi.getGroupMap === 'function'
            ? groupsApi.getGroupMap(configRef)
            : new Map();

        walkWorkspaces(function (ws) {
            if (!ws || !ws.id) return;

            var path = buildBreadcrumbPath(ws.id);
            var depthValue = Math.max(0, path.length - 1);
            var pathNames = path.map(function (segment) {
                return String(segment?.name || '').trim();
            }).filter(Boolean);
            var pathText = pathNames.join(' > ');
            var rootId = path.length ? String(path[0].id || '') : String(ws.id || '');
            var rootWorkspace = helpers && typeof helpers.findById === 'function'
                ? helpers.findById(configRef.workspaces || [], rootId)
                : null;
            var groupId = rootWorkspace ? String(rootWorkspace.groupId || '').trim() : '';
            var groupName = groupId && groupMap.has(groupId)
                ? String(groupMap.get(groupId).name || '').trim()
                : '';

            items.push({
                id: String(ws.id || ''),
                name: String(ws.name || ws.id || 'Untitled'),
                icon: ws.icon || DEFAULT_ICON,
                depth: depthValue,
                depthLabelText: getWorkspaceDepthLabelText(depthValue),
                inactive: groupsApi && typeof groupsApi.isWorkspaceEffectivelyInactive === 'function'
                    ? groupsApi.isWorkspaceEffectivelyInactive(ws, configRef)
                    : !!ws.inactive,
                pathText: pathText,
                pathLower: pathText.toLowerCase(),
                nameLower: String(ws.name || ws.id || '').toLowerCase(),
                groupName: groupName,
                groupLower: groupName.toLowerCase()
            });
        });

        return items;
    }

    function getWorkspaceSearchResults(query) {
        var normalizedQuery = String(query || '').trim().toLowerCase();
        if (!normalizedQuery) return [];

        return getWorkspaceSearchItems()
            .map(function (item) {
                var score = 0;
                if (item.nameLower === normalizedQuery) score += 120;
                else if (item.nameLower.indexOf(normalizedQuery) === 0) score += 80;
                else if (item.nameLower.indexOf(normalizedQuery) !== -1) score += 50;

                if (item.pathLower.indexOf(normalizedQuery) !== -1) score += 24;
                if (item.groupLower && item.groupLower.indexOf(normalizedQuery) !== -1) score += 12;
                if (!score) return null;

                return Object.assign({}, item, { score: score });
            })
            .filter(Boolean)
            .sort(function (a, b) {
                if (b.score !== a.score) return b.score - a.score;
                if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
                if (a.depth !== b.depth) return a.depth - b.depth;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 9);
    }

    function renderWorkspaceSearchResults(pop) {
        if (!pop) return;

        var searchInput = pop.querySelector('#tab-nav-search-input');
        var resultsEl = pop.querySelector('#tab-nav-search-results');
        if (!searchInput || !resultsEl) return;

        var query = String(searchInput.value || '').trim();
        searchResultsCache = getWorkspaceSearchResults(query);

        if (!query) {
            resultsEl.innerHTML = '<div class="tab-nav-search-empty">Type to search tabs and sub-tabs</div>';
            return;
        }

        if (!searchResultsCache.length) {
            resultsEl.innerHTML = '<div class="tab-nav-search-empty">No matching tabs</div>';
            return;
        }

        resultsEl.innerHTML = searchResultsCache.map(function (item) {
            var depthMeta = '<span class="tab-nav-search-result-meta" aria-label="' + escHtml(item.depthLabelText) + '">' + escHtml(item.depthLabelText) + '</span>';
            var inactiveMeta = item.inactive
                ? '<span class="tab-nav-search-result-badge">Inactive</span>'
                : '';
            var groupTag = item.groupName
                ? '<span class="tab-nav-search-result-group">' + escHtml(item.groupName) + '</span>'
                : '';
            var disabledAttr = item.inactive ? ' disabled' : '';
            var disabledClass = item.inactive ? ' tab-nav-search-result--inactive' : '';
            return ''
                + '<button class="tab-nav-search-result' + disabledClass + '" type="button" data-tab-nav-search-ws-id="' + escHtml(item.id) + '" data-tab-nav-search-depth="' + String(item.depth) + '" style="--tab-nav-search-depth:' + String(item.depth) + ';"' + disabledAttr + '>'
                +   '<span class="tab-nav-search-result-main">'
                +       '<span class="tab-nav-search-result-branch" aria-hidden="true"></span>'
                +       '<span class="tab-nav-search-result-icon">' + escHtml(item.icon || DEFAULT_ICON) + '</span>'
                +       '<span class="tab-nav-search-result-copy">'
                +           '<span class="tab-nav-search-result-name">' + escHtml(item.name) + '</span>'
                +           '<span class="tab-nav-search-result-path">' + escHtml(item.pathText) + '</span>'
                +       '</span>'
                +   '</span>'
                +   '<span class="tab-nav-search-result-side">'
                +       groupTag
                +       depthMeta
                +       inactiveMeta
                +   '</span>'
                + '</button>';
        }).join('');
    }

    function ensurePopover() {
        if (popoverEl) return popoverEl;

        popoverEl = document.createElement('div');
        popoverEl.className = 'tab-nav-popover';
        popoverEl.innerHTML = ''
            + '<div class="tab-nav-breadcrumb" id="tab-nav-breadcrumb"></div>'
            + '<div class="tab-nav-search">'
            +   '<div class="tab-nav-sidebar-tools-label">Tab Search</div>'
            +   '<div class="tab-nav-search-shell">'
            +       '<span class="tab-nav-search-icon">&#128269;</span>'
            +       '<input class="tab-nav-search-input" id="tab-nav-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search tabs and sub-tabs">'
            +   '</div>'
            +   '<div class="tab-nav-search-results" id="tab-nav-search-results"></div>'
            + '</div>'
            + '<div class="tab-nav-controls">'
            +   '<button class="tab-nav-btn" id="tab-nav-back" title="Go back (Alt+Left)" disabled>&#9664;</button>'
            +   '<button class="tab-nav-btn" id="tab-nav-forward" title="Go forward (Alt+Right)" disabled>&#9654;</button>'
            +   '<span class="tab-nav-position" id="tab-nav-position"></span>'
            + '</div>'
            + '<div class="tab-nav-sidebar-tools">'
            +   '<div class="tab-nav-sidebar-tools-label">Sidebar</div>'
            +   '<div class="tab-nav-sidebar-tools-grid">'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="collapse-all">&#9660; Collapse All Tabs</button>'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="expand-all">&#9650; Expand All Tabs</button>'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="toggle-inactive"></button>'
            +   '</div>'
            + '</div>'
            + '<div class="tab-nav-sidebar-tools tab-nav-sidebar-tools--groups">'
            +   '<div class="tab-nav-sidebar-tools-label">Groups</div>'
            +   '<div class="tab-nav-sidebar-tools-grid">'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="create-group">&#10133; Create Group</button>'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="collapse-groups">&#9660; Collapse All Groups</button>'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="expand-groups">&#9650; Expand All Groups</button>'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="toggle-hidden-groups"></button>'
            +   '</div>'
            + '</div>'
            + '<div class="tab-nav-sidebar-tools tab-nav-sidebar-tools--order">'
            +   '<div class="tab-nav-sidebar-tools-label">Ordering</div>'
            +   '<div class="tab-nav-sidebar-tools-grid">'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="toggle-order-mode"></button>'
            +       '<button class="tab-nav-sidebar-tool-btn" type="button" data-tab-nav-action="reset-order"></button>'
            +   '</div>'
            + '</div>';
        document.body.appendChild(popoverEl);

        popoverEl.querySelector('#tab-nav-back').addEventListener('click', function (e) {
            e.stopPropagation();
            goBack();
        });
        popoverEl.querySelector('#tab-nav-forward').addEventListener('click', function (e) {
            e.stopPropagation();
            goForward();
        });
        popoverEl.querySelector('#tab-nav-search-input').addEventListener('input', function () {
            renderWorkspaceSearchResults(popoverEl);
        });
        popoverEl.querySelector('#tab-nav-search-input').addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                e.currentTarget.value = '';
                renderWorkspaceSearchResults(popoverEl);
                return;
            }

            if (e.key !== 'Enter') return;
            var firstInteractiveResult = popoverEl.querySelector('.tab-nav-search-result:not([disabled])');
            if (!firstInteractiveResult) return;
            e.preventDefault();
            firstInteractiveResult.click();
        });
        popoverEl.addEventListener('click', function (e) {
            var resultBtn = e.target.closest('[data-tab-nav-search-ws-id]');
            if (resultBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (resultBtn.disabled) return;
                var resultWsId = String(resultBtn.getAttribute('data-tab-nav-search-ws-id') || '').trim();
                var searchInput = popoverEl ? popoverEl.querySelector('#tab-nav-search-input') : null;
                if (searchInput) {
                    searchInput.value = '';
                    renderWorkspaceSearchResults(popoverEl);
                }
                if (resultWsId && typeof window.switchWorkspace === 'function') {
                    window.switchWorkspace(resultWsId);
                    if (popoverEl) popoverEl.classList.remove('is-visible');
                }
                return;
            }

            var actionBtn = e.target.closest('[data-tab-nav-action]');
            if (!actionBtn) return;
            e.preventDefault();
            e.stopPropagation();
            var action = String(actionBtn.getAttribute('data-tab-nav-action') || '');
            if (action === 'collapse-all') {
                collapseAllTabs();
            } else if (action === 'expand-all') {
                expandAllTabs();
            } else if (action === 'toggle-inactive') {
                toggleShowInactiveTabs();
            } else if (action === 'create-group') {
                createSidebarGroup();
            } else if (action === 'collapse-groups') {
                collapseAllGroups();
            } else if (action === 'expand-groups') {
                expandAllGroups();
            } else if (action === 'toggle-hidden-groups') {
                toggleShowHiddenGroups();
            } else if (action === 'toggle-order-mode') {
                toggleSidebarOrderMode();
            } else if (action === 'reset-order') {
                resetManualSidebarOrder();
            }
        });
        popoverEl.addEventListener('mouseenter', function () {
            clearTimeout(hideTimeout);
        });
        popoverEl.addEventListener('mouseleave', function () {
            scheduleHide();
        });

        return popoverEl;
    }

    function updatePopoverState() {
        var pop = ensurePopover();
        var backBtn = pop.querySelector('#tab-nav-back');
        var forwardBtn = pop.querySelector('#tab-nav-forward');
        var positionLabel = pop.querySelector('#tab-nav-position');
        var breadcrumb = pop.querySelector('#tab-nav-breadcrumb');

        backBtn.disabled = !canGoBack();
        forwardBtn.disabled = !canGoForward();
        positionLabel.textContent = history.length > 1 ? (historyIndex + 1) + ' / ' + history.length : '';

        var activeWorkspaceId = String(config?.activeWorkspace || 'main').trim() || 'main';
        var path = buildBreadcrumbPath(activeWorkspaceId);
        breadcrumb.innerHTML = path.map(function (segment, index) {
            var isLast = index === path.length - 1;
            var cls = isLast ? 'tab-nav-crumb tab-nav-crumb--active' : 'tab-nav-crumb';
            return '<button class="' + cls + '" data-ws-id="' + escHtml(segment.id) + '">'
                + escHtml(segment.icon || DEFAULT_ICON) + ' ' + escHtml(segment.name)
                + '</button>'
                + (isLast ? '' : '<span class="tab-nav-sep">&gt;</span>');
        }).join('');

        updateSidebarActionLabels(pop);
        renderWorkspaceSearchResults(pop);

        breadcrumb.querySelectorAll('.tab-nav-crumb').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var wsId = btn.getAttribute('data-ws-id');
                if (wsId && typeof window.switchWorkspace === 'function') {
                    window.switchWorkspace(wsId);
                    scheduleHide(200);
                }
            });
        });
    }

    function showPopover(anchorEl) {
        clearTimeout(hideTimeout);
        var pop = ensurePopover();
        updatePopoverState();
        var rect = anchorEl.getBoundingClientRect();
        pop.style.top = (rect.bottom + 6) + 'px';
        pop.style.left = Math.max(8, rect.left - 4) + 'px';
        pop.classList.add('is-visible');
    }

    function scheduleHide(delay) {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(function () {
            if (popoverEl) popoverEl.classList.remove('is-visible');
        }, delay || 300);
    }

    function attachToButton() {
        var btn = document.getElementById('sidebar-toggle-btn');
        if (!btn || btn._tabNavAttached) return;
        btn._tabNavAttached = true;
        btn.addEventListener('mouseenter', function () {
            showPopover(btn);
        });
        btn.addEventListener('mouseleave', function () {
            scheduleHide();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            goBack();
        } else if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            goForward();
        }
    });

    function init() {
        hookSwitchWorkspace();
        attachToButton();
    }

    if (document.readyState === 'complete') {
        setTimeout(init, 100);
    } else {
        window.addEventListener('load', function () {
            setTimeout(init, 100);
        });
    }

    function ensureRoutePeek() {
        if (routePeekEl) return routePeekEl;
        routePeekEl = document.createElement('div');
        routePeekEl.className = 'source-route-peek';
        document.body.appendChild(routePeekEl);
        routePeekEl.addEventListener('mouseenter', function () {
            clearTimeout(routePeekHideTimeout);
        });
        routePeekEl.addEventListener('mouseleave', function () {
            scheduleRouteHide();
        });
        return routePeekEl;
    }

    function routePathHtml(segments) {
        return segments.map(function (segment, index) {
            var isLast = index === segments.length - 1;
            var html = '<button class="source-route-seg" onclick="event.stopPropagation();if(window.switchWorkspace)window.switchWorkspace(\''
                + escHtml(segment.id) + '\')">'
                + escHtml(segment.icon || DEFAULT_ICON) + ' ' + escHtml(segment.name)
                + '</button>';
            if (!isLast) html += '<span class="source-route-sep">&gt;</span>';
            return html;
        }).join('');
    }

    window.showSourceRoutePeek = function (event, badgeEl) {
        clearTimeout(routePeekHideTimeout);
        var peek = ensureRoutePeek();
        var routesStr = badgeEl.getAttribute('data-source-routes');
        if (!routesStr) return;

        var routes;
        try {
            routes = JSON.parse(routesStr);
        } catch (error) {
            return;
        }

        var pathsToRender = [];
        var uniquePaths = new Set();

        routes.forEach(function (route) {
            var mainPath = route.sourcePath || route.path;
            if (mainPath && mainPath.length > 0) {
                var mainKey = JSON.stringify(mainPath.map(function (segment) { return segment.id; }));
                if (!uniquePaths.has(mainKey)) {
                    uniquePaths.add(mainKey);
                    pathsToRender.push(mainPath);
                }
            }

            if (route.type === 'linked' && route.linkedPath && route.linkedPath.length > 0) {
                var linkedKey = JSON.stringify(route.linkedPath.map(function (segment) { return segment.id; }));
                if (!uniquePaths.has(linkedKey)) {
                    uniquePaths.add(linkedKey);
                    pathsToRender.push(route.linkedPath);
                }
            }
        });

        peek.innerHTML = pathsToRender.map(function (pathArr, index) {
            var isLast = index === pathsToRender.length - 1;
            var borderStyle = isLast ? '' : 'border-bottom: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 4px; padding-bottom: 6px;';
            return '<div class="source-route-path" style="padding: 2px 0; ' + borderStyle + '">'
                + routePathHtml(pathArr)
                + '</div>';
        }).join('');

        var rect = badgeEl.getBoundingClientRect();
        peek.style.top = (rect.bottom + 6) + 'px';
        peek.style.left = Math.max(8, rect.left) + 'px';
        peek.classList.add('active');
    };

    window.moveSourceRoutePeek = function () {};

    window.hideSourceRoutePeek = function () {
        scheduleRouteHide();
    };

    function scheduleRouteHide(delay) {
        clearTimeout(routePeekHideTimeout);
        routePeekHideTimeout = setTimeout(function () {
            if (routePeekEl) routePeekEl.classList.remove('active');
        }, delay || 300);
    }

    window.EveTabNav = {
        goBack: goBack,
        goForward: goForward,
        canGoBack: canGoBack,
        canGoForward: canGoForward,
        collapseAllTabs: collapseAllTabs,
        expandAllTabs: expandAllTabs,
        toggleShowInactiveTabs: toggleShowInactiveTabs,
        refreshPopover: updatePopoverState,
        getHistory: function () {
            return { stack: history.slice(), index: historyIndex };
        }
    };
})();
