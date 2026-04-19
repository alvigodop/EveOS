(function () {
    'use strict';

    var rt = window.EveTabNavRuntime = window.EveTabNavRuntime || {};
    if (rt.popoverReady || !rt.sharedReady) return;

    function renderWorkspaceSearchResults(pop) {
        if (!pop) return;

        var searchInput = pop.querySelector('#tab-nav-search-input');
        var resultsEl = pop.querySelector('#tab-nav-search-results');
        if (!searchInput || !resultsEl) return;

        var query = String(searchInput.value || '').trim();
        rt.state.searchResultsCache = rt.getWorkspaceSearchResults(query);

        if (!query) {
            resultsEl.innerHTML = '<div class="tab-nav-search-empty">Type to search tabs and sub-tabs</div>';
            return;
        }

        if (!rt.state.searchResultsCache.length) {
            resultsEl.innerHTML = '<div class="tab-nav-search-empty">No matching tabs</div>';
            return;
        }

        resultsEl.innerHTML = rt.state.searchResultsCache.map(function (item) {
            var depthMeta = '<span class="tab-nav-search-result-meta" aria-label="' + rt.escHtml(item.depthLabelText) + '">' + rt.escHtml(item.depthLabelText) + '</span>';
            var inactiveMeta = item.inactive
                ? '<span class="tab-nav-search-result-badge">Inactive</span>'
                : '';
            var groupTag = item.groupName
                ? '<span class="tab-nav-search-result-group">' + rt.escHtml(item.groupName) + '</span>'
                : '';
            var disabledAttr = item.inactive ? ' disabled' : '';
            var disabledClass = item.inactive ? ' tab-nav-search-result--inactive' : '';
            return ''
                + '<button class="tab-nav-search-result' + disabledClass + '" type="button" data-tab-nav-search-ws-id="' + rt.escHtml(item.id) + '" data-tab-nav-search-depth="' + String(item.depth) + '" style="--tab-nav-search-depth:' + String(item.depth) + ';"' + disabledAttr + '>'
                +   '<span class="tab-nav-search-result-main">'
                +       '<span class="tab-nav-search-result-branch" aria-hidden="true"></span>'
                +       '<span class="tab-nav-search-result-icon">' + rt.escHtml(item.icon || rt.DEFAULT_ICON) + '</span>'
                +       '<span class="tab-nav-search-result-copy">'
                +           '<span class="tab-nav-search-result-name">' + rt.escHtml(item.name) + '</span>'
                +           '<span class="tab-nav-search-result-path">' + rt.escHtml(item.pathText) + '</span>'
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
        if (rt.state.popoverEl) return rt.state.popoverEl;

        rt.state.popoverEl = document.createElement('div');
        rt.state.popoverEl.className = 'tab-nav-popover';
        rt.state.popoverEl.innerHTML = ''
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
        document.body.appendChild(rt.state.popoverEl);

        rt.state.popoverEl.querySelector('#tab-nav-back').addEventListener('click', function (e) {
            e.stopPropagation();
            rt.goBack();
        });
        rt.state.popoverEl.querySelector('#tab-nav-forward').addEventListener('click', function (e) {
            e.stopPropagation();
            rt.goForward();
        });
        rt.state.popoverEl.querySelector('#tab-nav-search-input').addEventListener('input', function () {
            renderWorkspaceSearchResults(rt.state.popoverEl);
        });
        rt.state.popoverEl.querySelector('#tab-nav-search-input').addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                e.currentTarget.value = '';
                renderWorkspaceSearchResults(rt.state.popoverEl);
                return;
            }

            if (e.key !== 'Enter') return;
            var firstInteractiveResult = rt.state.popoverEl.querySelector('.tab-nav-search-result:not([disabled])');
            if (!firstInteractiveResult) return;
            e.preventDefault();
            firstInteractiveResult.click();
        });
        rt.state.popoverEl.addEventListener('click', function (e) {
            var resultBtn = e.target.closest('[data-tab-nav-search-ws-id]');
            if (resultBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (resultBtn.disabled) return;
                var resultWsId = String(resultBtn.getAttribute('data-tab-nav-search-ws-id') || '').trim();
                var searchInput = rt.state.popoverEl ? rt.state.popoverEl.querySelector('#tab-nav-search-input') : null;
                if (searchInput) {
                    searchInput.value = '';
                    renderWorkspaceSearchResults(rt.state.popoverEl);
                }
                if (resultWsId && typeof window.switchWorkspace === 'function') {
                    window.switchWorkspace(resultWsId);
                    if (rt.state.popoverEl) rt.state.popoverEl.classList.remove('is-visible');
                }
                return;
            }

            var actionBtn = e.target.closest('[data-tab-nav-action]');
            if (!actionBtn) return;
            e.preventDefault();
            e.stopPropagation();
            var action = String(actionBtn.getAttribute('data-tab-nav-action') || '');
            if (action === 'collapse-all') {
                rt.collapseAllTabs();
            } else if (action === 'expand-all') {
                rt.expandAllTabs();
            } else if (action === 'toggle-inactive') {
                rt.toggleShowInactiveTabs();
            } else if (action === 'create-group') {
                rt.createSidebarGroup();
            } else if (action === 'collapse-groups') {
                rt.collapseAllGroups();
            } else if (action === 'expand-groups') {
                rt.expandAllGroups();
            } else if (action === 'toggle-hidden-groups') {
                rt.toggleShowHiddenGroups();
            } else if (action === 'toggle-order-mode') {
                rt.toggleSidebarOrderMode();
            } else if (action === 'reset-order') {
                rt.resetManualSidebarOrder();
            }
        });
        rt.state.popoverEl.addEventListener('mouseenter', function () {
            clearTimeout(rt.state.hideTimeout);
        });
        rt.state.popoverEl.addEventListener('mouseleave', function () {
            scheduleHide();
        });

        return rt.state.popoverEl;
    }

    function updatePopoverState() {
        var pop = ensurePopover();
        var backBtn = pop.querySelector('#tab-nav-back');
        var forwardBtn = pop.querySelector('#tab-nav-forward');
        var positionLabel = pop.querySelector('#tab-nav-position');
        var breadcrumb = pop.querySelector('#tab-nav-breadcrumb');

        backBtn.disabled = !rt.canGoBack();
        forwardBtn.disabled = !rt.canGoForward();
        positionLabel.textContent = rt.state.history.length > 1 ? (rt.state.historyIndex + 1) + ' / ' + rt.state.history.length : '';

        var activeWorkspaceId = String(config?.activeWorkspace || 'main').trim() || 'main';
        var path = rt.buildBreadcrumbPath(activeWorkspaceId);
        breadcrumb.innerHTML = path.map(function (segment, index) {
            var isLast = index === path.length - 1;
            var cls = isLast ? 'tab-nav-crumb tab-nav-crumb--active' : 'tab-nav-crumb';
            return '<button class="' + cls + '" data-ws-id="' + rt.escHtml(segment.id) + '">'
                + rt.escHtml(segment.icon || rt.DEFAULT_ICON) + ' ' + rt.escHtml(segment.name)
                + '</button>'
                + (isLast ? '' : '<span class="tab-nav-sep">&gt;</span>');
        }).join('');

        rt.updateSidebarActionLabels(pop);
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
        clearTimeout(rt.state.hideTimeout);
        var pop = ensurePopover();
        updatePopoverState();
        var rect = anchorEl.getBoundingClientRect();
        pop.style.top = (rect.bottom + 6) + 'px';
        pop.style.left = Math.max(8, rect.left - 4) + 'px';
        pop.classList.add('is-visible');
    }

    function scheduleHide(delay) {
        clearTimeout(rt.state.hideTimeout);
        rt.state.hideTimeout = setTimeout(function () {
            if (rt.state.popoverEl) rt.state.popoverEl.classList.remove('is-visible');
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

    function init() {
        rt.hookSwitchWorkspace();
        attachToButton();
    }

    document.addEventListener('keydown', function (e) {
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            rt.goBack();
        } else if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            rt.goForward();
        }
    });

    if (document.readyState === 'complete') {
        setTimeout(init, 100);
    } else {
        window.addEventListener('load', function () {
            setTimeout(init, 100);
        });
    }

    Object.assign(rt, {
        renderWorkspaceSearchResults: renderWorkspaceSearchResults,
        ensurePopover: ensurePopover,
        updatePopoverState: updatePopoverState,
        showPopover: showPopover,
        scheduleHide: scheduleHide,
        attachToButton: attachToButton
    });

    rt.popoverReady = true;
})();
