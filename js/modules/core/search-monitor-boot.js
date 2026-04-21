(function () {
    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback == null ? '' : fallback).trim();
    }

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

    function ensureTraceRow(indicator) {
        if (!indicator) return;
        const expanded = indicator.querySelector('.expanded-content');
        if (!expanded || expanded.querySelector('#nexusTraceRow')) return;
        const row = document.createElement('div');
        row.className = 'stats-row';
        row.id = 'nexusTraceRow';
        row.innerHTML = '<span class="stats-label" id="nexusTraceLabel">Trace:</span><span class="stats-value" id="nexusTrace">-</span>';
        expanded.appendChild(row);
    }

    function ensureTraceDetails(indicator) {
        if (!indicator) return null;
        const expanded = indicator.querySelector('.expanded-content');
        if (!expanded) return null;
        let details = expanded.querySelector('#nexusTraceDetails');
        if (!details) {
            details = document.createElement('div');
            details.id = 'nexusTraceDetails';
            details.className = 'nexus-trace-details';
            details.hidden = true;
            expanded.appendChild(details);
        }
        return details;
    }

    function clearTraceDetails(indicator) {
        const details = ensureTraceDetails(indicator);
        if (!details) return;
        details.hidden = true;
        details.innerHTML = '';
    }

    function formatTraceScope(trace) {
        const scope = trace?.scope || {};
        const scopeMode = text(scope.scopeMode, '');
        if (scopeMode === 'all') return 'All Tabs';
        if (scopeMode === 'current') return 'Current Scope';
        if (scope?.scope === 'all') return 'All Tabs';
        const parts = [];
        if (scope?.workspaceId) parts.push(scope.workspaceId);
        if (scope?.categoryName) parts.push(scope.categoryName);
        return parts.length ? parts.join(' / ') : 'Current Scope';
    }

    function buildVectorTraceLine(label, vector) {
        if (!vector) return '';
        const status = text(vector.status, 'unknown');
        const resultCount = Number(vector.resultCount || 0);
        const duration = Number(vector.durationMs || 0);
        const statusClass = status === 'error'
            ? 'nexus-trace-chip-error'
            : status === 'disabled'
                ? 'nexus-trace-chip-disabled'
                : status === 'skipped'
                    ? 'nexus-trace-chip-warn'
                    : 'nexus-trace-chip-ok';
        const errorText = text(vector.error, '');
        return '<div class="nexus-trace-vector-row">'
            + '<span class="nexus-trace-vector-label">' + label + '</span>'
            + '<span class="nexus-trace-chip ' + statusClass + '">' + status + '</span>'
            + '<span class="nexus-trace-vector-metrics">' + resultCount + ' · ' + duration + 'ms</span>'
            + (errorText ? '<span class="nexus-trace-vector-error">' + errorText + '</span>' : '')
            + '</div>';
    }

    function renderTraceDetails(indicator, trace) {
        const details = ensureTraceDetails(indicator);
        if (!details) return;
        if (!trace || !trace.id) {
            clearTraceDetails(indicator);
            return;
        }

        const vectorOrder = [
            ['localIndex', 'Index'],
            ['bookmarks', 'Local'],
            ['knowledge', 'Knowledge'],
            ['cached', 'API Cache'],
            ['google', 'Google']
        ];

        details.innerHTML = '<div class="nexus-trace-summary-grid">'
            + '<div class="nexus-trace-summary-cell"><span class="nexus-trace-summary-label">ID</span><span class="nexus-trace-summary-value">' + text(trace.id, '-') + '</span></div>'
            + '<div class="nexus-trace-summary-cell"><span class="nexus-trace-summary-label">Mode</span><span class="nexus-trace-summary-value">' + text(trace.mode, 'segmented') + '</span></div>'
            + '<div class="nexus-trace-summary-cell"><span class="nexus-trace-summary-label">Scope</span><span class="nexus-trace-summary-value">' + formatTraceScope(trace) + '</span></div>'
            + '<div class="nexus-trace-summary-cell"><span class="nexus-trace-summary-label">Total</span><span class="nexus-trace-summary-value">' + Number(trace.totalMs || 0) + 'ms</span></div>'
            + '</div>'
            + '<div class="nexus-trace-query-row"><span class="nexus-trace-summary-label">Query</span><span class="nexus-trace-summary-value">' + text(trace.query, '-') + '</span></div>'
            + '<div class="nexus-trace-vectors">'
            + vectorOrder.map(function (entry) {
                return buildVectorTraceLine(entry[1], trace?.vectors?.[entry[0]]);
            }).filter(Boolean).join('')
            + '</div>';
        details.hidden = false;
    }

    function openNexusSearch(options) {
        const scopeMode = options?.scopeMode === 'all' ? 'all' : 'current';
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
            setText('#nexusTrace', '-');
            clearTraceDetails(indicator);
        }
        const query = document.getElementById('search')?.value || '';
        if (typeof window.openExpandedSearchModal === 'function') {
            window.openExpandedSearchModal({
                query: query,
                scopeMode: scopeMode,
                scope: scopeMode === 'all' ? {} : null
            });
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
            openNexusSearch({ scopeMode: 'current' });
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
        ensureTraceDetails(indicator);
        ensureNexusLauncher(indicator);

        indicator.addEventListener('click', handleToggle);
        indicator.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const tag = event.target && event.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                || (event.target && event.target.isContentEditable)) return;
            if (shouldIgnoreToggleEvent(event, indicator)) return;
            event.preventDefault();
            handleToggle(event);
        });

        if (!window.__nexusShortcutBound) {
            window.__nexusShortcutBound = true;
            document.addEventListener('keydown', function (event) {
                const key = String(event.key || '').toLowerCase();
                const isCurrentShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && key === 'k';
                const isAllTabsShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.altKey && key === 'k';
                if (!isCurrentShortcut && !isAllTabsShortcut) return;
                const target = event.target;
                const tag = target?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
                event.preventDefault();
                openNexusSearch({ scopeMode: isAllTabsShortcut ? 'all' : 'current' });
            });
        }
    }

    window.SearchMonitorBoot = {
        bind,
        handleToggle,
        openNexusSearch: function () {
            return openNexusSearch({ scopeMode: 'current' });
        },
        openNexusAllTabs: function () {
            return openNexusSearch({ scopeMode: 'all' });
        },
        _nexusSessions: [],
        recordNexusTrace: function (trace) {
            const indicator = getIndicator();
            if (!indicator || !trace?.id) return;
            ensureTraceRow(indicator);
            ensureTraceDetails(indicator);
            const summary = trace.summary || ('total ' + Number(trace.totalMs || 0) + 'ms');
            const textNode = indicator.querySelector('#nexusTrace');
            if (textNode) textNode.textContent = trace.id + ' · ' + summary;
            indicator.dataset.lastNexusTraceId = String(trace.id);
            renderTraceDetails(indicator, trace);

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
            ensureTraceDetails(indicator);
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
                renderTraceDetails(indicator, targetTrace);
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
            ensureTraceDetails(indicator);
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
