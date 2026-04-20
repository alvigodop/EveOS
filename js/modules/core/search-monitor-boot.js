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
            setText('#nexusTrace', '—');
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

    function ensureTraceRow(indicator) {
        if (!indicator) return;
        const expanded = indicator.querySelector('.expanded-content');
        if (!expanded || expanded.querySelector('#nexusTraceRow')) return;
        const row = document.createElement('div');
        row.className = 'stats-row';
        row.id = 'nexusTraceRow';
        row.innerHTML = '<span class="stats-label" id="nexusTraceLabel">Trace:</span><span class="stats-value" id="nexusTrace">—</span>';
        expanded.appendChild(row);
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
        ensureTraceRow(indicator);
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
        _nexusSessions: [],
        recordNexusTrace: function (trace) {
            const indicator = getIndicator();
            if (!indicator || !trace?.id) return;
            ensureTraceRow(indicator);
            const summary = trace.summary
                || ('total ' + Number(trace.totalMs || 0) + 'ms');
            const textNode = indicator.querySelector('#nexusTrace');
            if (textNode) textNode.textContent = trace.id + ' · ' + summary;
            indicator.dataset.lastNexusTraceId = String(trace.id);

            const sessions = window.SearchMonitorBoot._nexusSessions || [];
            sessions.unshift(trace);
            window.SearchMonitorBoot._nexusSessions = sessions.slice(0, 20);
        },
        getLatestNexusTrace: function () {
            return (window.SearchMonitorBoot._nexusSessions || [])[0] || null;
        },
        showNexusTrace: function (traceId) {
            const indicator = getIndicator();
            if (!indicator) return;
            ensureTraceRow(indicator);
            const sessions = window.SearchMonitorBoot._nexusSessions || [];
            const targetTrace = sessions.find(function (trace) {
                return String(trace?.id || '') === String(traceId || '');
            }) || sessions[0];
            if (targetTrace) {
                const textNode = indicator.querySelector('#nexusTrace');
                if (textNode) {
                    const summary = targetTrace.summary || ('total ' + Number(targetTrace.totalMs || 0) + 'ms');
                    textNode.textContent = targetTrace.id + ' · ' + summary;
                }
            }
            if (window.LoadingIndicator && typeof window.LoadingIndicator.expand === 'function') {
                window.LoadingIndicator.expand();
                return;
            }
            expandFallback(indicator);
        },
        expand: function () {
            const indicator = getIndicator();
            if (!indicator) return;
            ensureTraceRow(indicator);
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
