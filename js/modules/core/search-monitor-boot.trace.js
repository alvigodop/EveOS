window.SearchMonitorBootTrace = (function () {
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

    return {
        ensureTraceRow,
        ensureTraceDetails,
        renderTraceDetails,
        openNexusSearch,
        ensureNexusLauncher
    };
})();