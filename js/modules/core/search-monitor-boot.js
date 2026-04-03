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

        indicator.addEventListener('click', handleToggle);
        indicator.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            handleToggle(event);
        });
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
