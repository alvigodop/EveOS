(function () {
    function getIndicator() {
        return document.getElementById('loadingIndicator');
    }

    function isCompact(indicator) {
        return !!indicator && indicator.classList.contains('compact');
    }

    function ensureVisible(indicator) {
        if (!indicator) return;
        indicator.classList.add('visible');
        indicator.style.display = '';
    }

    function openNexusSearch() {
        const indicator = getIndicator();
        if (indicator) {
            const setText = function (selector, value) {
                const node = indicator.querySelector(selector);
                if (node) node.textContent = String(value || '');
            };
            setText('#searchStatusLabel', 'Nexus:');
            setText('#wikisSearchedLabel', 'Vectors:');
            setText('#resultsFoundLabel', 'Results:');
            setText('.status-text', 'Nexus Search');
            setText('#searchStatus', 'Ready');
            setText('#wikisSearched', '0');
            setText('#resultsFound', '0');
        }
        const query = document.getElementById('search')?.value || '';
        if (typeof window.openExpandedSearchModal === 'function') {
            window.openExpandedSearchModal({ query: query });
            return true;
        }
        if (typeof window.openExpandedSearchFromMain === 'function') {
            window.openExpandedSearchFromMain(!!String(query || '').trim());
            return true;
        }
        return false;
    }

    function ensureNexusLauncher(indicator) {
        if (!indicator || indicator.querySelector('.monitor-nexus-toggle')) return;
        const content = indicator.querySelector('.indicator-content');
        const title = indicator.querySelector('.indicator-title');
        if (!content || !title) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'monitor-nexus-toggle';
        button.setAttribute('aria-label', 'Open Nexus Search');
        button.title = 'Open Nexus Search';
        button.textContent = 'Nexus';
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openNexusSearch();
        });

        if (title.nextSibling) {
            content.insertBefore(button, title.nextSibling);
        } else {
            content.appendChild(button);
        }
    }

    function shouldIgnoreToggleEvent(event, indicator) {
        if (!event || !indicator) return false;
        const target = event.target;
        if (!target || target === indicator) return false;
        if (typeof target.closest !== 'function') return false;
        const interactive = target.closest('button, a, input, textarea, select, summary, [role="button"], [contenteditable="true"]');
        return !!interactive && indicator.contains(interactive);
    }

    function expandFallback(indicator) {
        if (!indicator) return;
        ensureVisible(indicator);
        indicator.classList.remove('compact');
        document.addEventListener('click', handleOutsideClick, true);
    }

    function collapseFallback(indicator) {
        if (!indicator) return;
        indicator.classList.add('compact');
        document.removeEventListener('click', handleOutsideClick, true);
    }

    function toggleViaModule(event) {
        const indicator = getIndicator();
        if (!indicator || !window.LoadingIndicator) {
            return false;
        }

        const canExpand = typeof window.LoadingIndicator.expand === 'function';
        const canCollapse = typeof window.LoadingIndicator.collapse === 'function';
        if (!canExpand || !canCollapse) {
            return false;
        }

        if (isCompact(indicator)) {
            window.LoadingIndicator.expand();
        } else {
            window.LoadingIndicator.collapse();
        }

        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
        return true;
    }

    function handleOutsideClick(event) {
        const indicator = getIndicator();
        if (!indicator || indicator.contains(event.target)) {
            return;
        }

        if (window.LoadingIndicator && typeof window.LoadingIndicator.collapse === 'function') {
            window.LoadingIndicator.collapse();
            return;
        }

        collapseFallback(indicator);
    }

    function handleToggle(event) {
        const indicator = getIndicator();
        if (!indicator) return;
        if (shouldIgnoreToggleEvent(event, indicator)) return;

        if (toggleViaModule(event)) {
            return;
        }

        if (isCompact(indicator)) {
            expandFallback(indicator);
            if (event) event.stopPropagation();
            return;
        }

        collapseFallback(indicator);
        if (event) event.stopPropagation();
    }

    function bind() {
        const indicator = getIndicator();
        if (!indicator || indicator.dataset.searchMonitorBootBound === '1') {
            return;
        }

        indicator.dataset.searchMonitorBootBound = '1';
        indicator.tabIndex = indicator.tabIndex >= 0 ? indicator.tabIndex : 0;
        indicator.setAttribute('role', 'button');
        indicator.setAttribute('aria-label', 'Toggle Search Monitor');
        ensureNexusLauncher(indicator);

        indicator.addEventListener('click', handleToggle);
        indicator.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            // Don't intercept keyboard events on interactive children (inputs, textareas, etc.)
            const tag = event.target && event.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                (event.target && event.target.isContentEditable)) return;
            if (shouldIgnoreToggleEvent(event, indicator)) return;
            event.preventDefault();
            handleToggle(event);
        });

        if (!window.__nexusShortcutBound) {
            window.__nexusShortcutBound = true;
            document.addEventListener('keydown', function (event) {
                const isShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && String(event.key || '').toLowerCase() === 'k';
                if (!isShortcut) return;
                const target = event.target;
                const tag = target?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
                event.preventDefault();
                openNexusSearch();
            });
        }
    }

    window.SearchMonitorBoot = {
        bind,
        handleToggle,
        expand: function () {
            const indicator = getIndicator();
            if (!indicator) return;
            if (window.LoadingIndicator && typeof window.LoadingIndicator.expand === 'function') {
                window.LoadingIndicator.expand();
                return;
            }
            expandFallback(indicator);
        },
        collapse: function () {
            const indicator = getIndicator();
            if (!indicator) return;
            if (window.LoadingIndicator && typeof window.LoadingIndicator.collapse === 'function') {
                window.LoadingIndicator.collapse();
                return;
            }
            collapseFallback(indicator);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
})();
