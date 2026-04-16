// --- TAB NAVIGATION HISTORY & BREADCRUMB POPOVER ---
// Provides back/forward workspace navigation and breadcrumb path display
// Activated via hover on the hamburger sidebar toggle button
(function () {
    'use strict';

    // ─── History Stack ───────────────────────────────────────
    var MAX_HISTORY = 50;
    var history = [];      // Array of workspace IDs visited
    var historyIndex = -1; // Current position in history
    var _suppressPush = false;

    function pushHistory(wsId) {
        if (_suppressPush) return;
        var id = String(wsId || '').trim();
        if (!id) return;
        // Don't push duplicate consecutive entries
        if (historyIndex >= 0 && history[historyIndex] === id) return;
        // Trim forward history when navigating to a new tab
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(id);
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;
    }

    function canGoBack() { return historyIndex > 0; }
    function canGoForward() { return historyIndex < history.length - 1; }

    function goBack() {
        if (!canGoBack()) return;
        historyIndex--;
        _navigateTo(history[historyIndex]);
        _updatePopoverState();
    }

    function goForward() {
        if (!canGoForward()) return;
        historyIndex++;
        _navigateTo(history[historyIndex]);
        _updatePopoverState();
    }

    function _navigateTo(wsId) {
        _suppressPush = true;
        if (typeof window.switchWorkspace === 'function') {
            window.switchWorkspace(wsId);
        }
        _suppressPush = false;
    }

    // ─── Hook into switchWorkspace ──────────────────────────
    function hookSwitchWorkspace() {
        var origSwitch = window.switchWorkspace;
        if (!origSwitch || origSwitch._tabNavHooked) return;
        window.switchWorkspace = function (id, options) {
            origSwitch.call(this, id, options);
            pushHistory(String(id || '').trim() || String(config?.workspaces?.[0]?.id || 'main'));
            _updatePopoverState();
        };
        window.switchWorkspace._tabNavHooked = true;
        // Seed initial entry
        var initial = String(config?.activeWorkspace || 'main').trim();
        pushHistory(initial);
    }

    // ─── Breadcrumb Path Builder ────────────────────────────
    function buildBreadcrumbPath(wsId) {
        var helpers = window.EveWorkspaceHelpers;
        if (!helpers) return [{ id: wsId, name: wsId, icon: '📁' }];
        var workspaces = config?.workspaces || [];
        var path = [];
        var current = helpers.findById(workspaces, wsId);
        if (!current) return [{ id: wsId, name: wsId, icon: '📁' }];

        // Build path from target up to root
        path.unshift({ id: current.id, name: current.name, icon: current.icon || '📁' });
        var parent = helpers.findParent(workspaces, current.id);
        while (parent) {
            path.unshift({ id: parent.id, name: parent.name, icon: parent.icon || '📁' });
            parent = helpers.findParent(workspaces, parent.id);
        }
        return path;
    }

    // ─── DOM: Popover Creation ──────────────────────────────
    var popoverEl = null;
    var _hideTimeout = null;

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function ensurePopover() {
        if (popoverEl) return popoverEl;
        popoverEl = document.createElement('div');
        popoverEl.className = 'tab-nav-popover';
        popoverEl.innerHTML = ''
            + '<div class="tab-nav-breadcrumb" id="tab-nav-breadcrumb"></div>'
            + '<div class="tab-nav-controls">'
            +   '<button class="tab-nav-btn" id="tab-nav-back" title="Go back (Alt+←)" disabled>&#9664;</button>'
            +   '<button class="tab-nav-btn" id="tab-nav-forward" title="Go forward (Alt+→)" disabled>&#9654;</button>'
            +   '<span class="tab-nav-position" id="tab-nav-position"></span>'
            + '</div>';
        document.body.appendChild(popoverEl);

        // Wire buttons
        popoverEl.querySelector('#tab-nav-back').addEventListener('click', function (e) {
            e.stopPropagation();
            goBack();
        });
        popoverEl.querySelector('#tab-nav-forward').addEventListener('click', function (e) {
            e.stopPropagation();
            goForward();
        });

        // Keep popover alive when hovering it
        popoverEl.addEventListener('mouseenter', function () {
            clearTimeout(_hideTimeout);
        });
        popoverEl.addEventListener('mouseleave', function () {
            _scheduleHide();
        });

        return popoverEl;
    }

    function _updatePopoverState() {
        var pop = ensurePopover();
        var backBtn = pop.querySelector('#tab-nav-back');
        var fwdBtn = pop.querySelector('#tab-nav-forward');
        var posLabel = pop.querySelector('#tab-nav-position');
        var breadcrumb = pop.querySelector('#tab-nav-breadcrumb');

        backBtn.disabled = !canGoBack();
        fwdBtn.disabled = !canGoForward();
        posLabel.textContent = history.length > 1
            ? (historyIndex + 1) + ' / ' + history.length
            : '';

        // Build breadcrumb
        var activeWs = String(config?.activeWorkspace || 'main').trim();
        var path = buildBreadcrumbPath(activeWs);
        breadcrumb.innerHTML = path.map(function (seg, i) {
            var isLast = i === path.length - 1;
            var cls = isLast ? 'tab-nav-crumb tab-nav-crumb--active' : 'tab-nav-crumb';
            var icon = escHtml(seg.icon);
            var name = escHtml(seg.name);
            return '<button class="' + cls + '" data-ws-id="' + escHtml(seg.id) + '">'
                + icon + ' ' + name
                + '</button>'
                + (isLast ? '' : '<span class="tab-nav-sep">›</span>');
        }).join('');

        // Wire crumb clicks
        breadcrumb.querySelectorAll('.tab-nav-crumb').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var wsId = btn.getAttribute('data-ws-id');
                if (wsId && typeof window.switchWorkspace === 'function') {
                    window.switchWorkspace(wsId);
                    _scheduleHide(200);
                }
            });
        });
    }

    function showPopover(anchorEl) {
        clearTimeout(_hideTimeout);
        var pop = ensurePopover();
        _updatePopoverState();

        // Position below the anchor
        var rect = anchorEl.getBoundingClientRect();
        pop.style.top = (rect.bottom + 6) + 'px';
        pop.style.left = Math.max(8, rect.left - 4) + 'px';
        pop.classList.add('is-visible');
    }

    function _scheduleHide(delay) {
        clearTimeout(_hideTimeout);
        _hideTimeout = setTimeout(function () {
            if (popoverEl) popoverEl.classList.remove('is-visible');
        }, delay || 300);
    }

    // ─── Attach to Hamburger Button ─────────────────────────
    function attachToButton() {
        var btn = document.getElementById('sidebar-toggle-btn');
        if (!btn || btn._tabNavAttached) return;
        btn._tabNavAttached = true;

        btn.addEventListener('mouseenter', function () {
            showPopover(btn);
        });
        btn.addEventListener('mouseleave', function () {
            _scheduleHide();
        });
    }

    // ─── Keyboard Shortcuts ─────────────────────────────────
    document.addEventListener('keydown', function (e) {
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            goBack();
        } else if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            goForward();
        }
    });

    // ─── Init ───────────────────────────────────────────────
    function init() {
        hookSwitchWorkspace();
        attachToButton();
    }

    // Defer init until DOM + app ready
    if (document.readyState === 'complete') {
        setTimeout(init, 100);
    } else {
        window.addEventListener('load', function () { setTimeout(init, 100); });
    }

    // Expose for external use
    window.EveTabNav = {
        goBack: goBack,
        goForward: goForward,
        canGoBack: canGoBack,
        canGoForward: canGoForward,
        getHistory: function () { return { stack: history.slice(), index: historyIndex }; }
    };
})();
