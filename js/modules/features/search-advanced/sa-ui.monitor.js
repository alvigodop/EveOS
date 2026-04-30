window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
function syncSearchMonitor(state) {
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) return;

        const setText = function (selector, value) {
            const node = indicator.querySelector(selector);
            if (node) node.textContent = String(value || '');
        };

        indicator.classList.toggle('searching', !!state?.isSearching);
        indicator.classList.remove('error');
        setText('#searchStatusLabel', 'Nexus:');
        setText('#wikisSearchedLabel', 'Vectors:');
        setText('#resultsFoundLabel', 'Results:');
        setText('.status-text', state?.statusText || 'Nexus Search');
        setText('#searchStatus', state?.scopeLabel || 'Scoped');
        setText('#wikisSearched', state?.vectorStatus || '0');
        setText('#resultsFound', state?.resultsFound || '0');
        setText('#nexusTrace', state?.traceSummary || state?.traceId || '—');

        const dot = indicator.querySelector('.dot');
        if (dot) {
            dot.style.background = state?.isSearching ? '#6ee7ff' : '#9fd7e6';
        }

        if (state?.trace && window.SearchMonitorBoot?.recordNexusTrace) {
            window.SearchMonitorBoot.recordNexusTrace(state.trace);
        }
    }

    

function buildCommandTrace(command, summary) {
        const stamp = Date.now();
        return {
            id: 'CMD-' + stamp.toString(36).toUpperCase(),
            startedAt: stamp,
            endedAt: stamp,
            totalMs: 0,
            command: command,
            summary: summary,
            vectors: {}
        };
    }

    

function countSatisfiedVectors(stats, settings) {
        const active = settings?.activeVectors || {};
        let count = 0;
        if (active.bookmarks && ((stats?.bookmarks || 0) > 0 || (stats?.cards || 0) > 0 || (stats?.library || 0) > 0)) count += 1;
        if (active.knowledge && (stats?.knowledge || 0) > 0) count += 1;
        if (active.cachedResults && (stats?.cached || 0) > 0) count += 1;
        if (active.google && (stats?.google || 0) > 0) count += 1;
        return count;
    }

    

    window.EveOS.SearchAdvanced.Modules.UiMonitor = { syncSearchMonitor, buildCommandTrace, countSatisfiedVectors };
})();
