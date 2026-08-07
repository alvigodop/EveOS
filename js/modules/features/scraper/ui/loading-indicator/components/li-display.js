/**
 * Loading Indicator Display Helpers
 */
window.LoadingIndicatorModules = window.LoadingIndicatorModules || {};

(function () {
    window.LoadingIndicatorModules.createDisplayHelpers = function createDisplayHelpers(ctx) {
        const api = ctx?.api || {};

        // Safety timeout to auto-dismiss stuck searching state
        let _searchSafetyTimer = null;
        const SAFETY_TIMEOUT_MS = 45000;
        const DEFAULT_MONITOR_LABELS = Object.freeze({
            status: 'Status',
            progress: 'Wikis Searched',
            results: 'Results Found'
        });

        function applyMonitorLabels(indicator, labels = {}) {
            if (!indicator) return;
            const statusLabel = indicator.querySelector('#searchStatusLabel');
            const progressLabel = indicator.querySelector('#wikisSearchedLabel');
            const resultsLabel = indicator.querySelector('#resultsFoundLabel');
            if (statusLabel) statusLabel.textContent = `${labels.status || DEFAULT_MONITOR_LABELS.status}:`;
            if (progressLabel) progressLabel.textContent = `${labels.progress || DEFAULT_MONITOR_LABELS.progress}:`;
            if (resultsLabel) resultsLabel.textContent = `${labels.results || DEFAULT_MONITOR_LABELS.results}:`;
        }

        function clearSafetyTimer() {
            if (_searchSafetyTimer) {
                clearTimeout(_searchSafetyTimer);
                _searchSafetyTimer = null;
            }
        }

        function startSafetyTimer() {
            clearSafetyTimer();
            _searchSafetyTimer = setTimeout(function () {
                console.warn('[LoadingIndicator] Safety timeout — auto-dismissing stuck searching state');
                updateEnhanced(false, 'Idle');
            }, SAFETY_TIMEOUT_MS);
        }

        function show(message) {
            api._ensureTopLevel();
            const loading = document.getElementById('loadingIndicator');
            if (!loading) return false;

            loading.classList.add('visible');
            loading.style.display = '';

            const statusText = loading.querySelector('.status-text');
            if (statusText && message) {
                statusText.textContent = message;
            }
            return true;
        }

        function hide() {
            const loading = document.getElementById('loadingIndicator');
            if (!loading) return false;
            loading.classList.remove('visible');
            loading.style.display = 'none';
            return true;
        }

        function updateEnhanced(isSearching, message = 'Idle', stats = {}) {
            api._ensureTopLevel();
            const indicator = document.getElementById('loadingIndicator');
            if (!indicator) return;

            const statusText = indicator.querySelector('.status-text');
            const searchStatus = indicator.querySelector('#searchStatus');
            const wikisSearched = indicator.querySelector('#wikisSearched');
            const resultsFound = indicator.querySelector('#resultsFound');
            const dot = indicator.querySelector('.dot');
            const monitorLabels = stats.monitorLabels || {};

            indicator.classList.toggle('searching', isSearching);

            if (!isSearching) {
                // A finished search must retire its own watchdog. Only forceReset() used to clear it,
                // so every completed search left a live 45s timer behind -- and when that timer fired
                // it did not check whether a NEW search had started in the meantime. Run two searches
                // inside 45 seconds and the first one's timer tore down the second one mid-flight.
                clearSafetyTimer();
                // If not searching, we should hide the overall overlay but maybe keep "Idle" if not specifically hidden
                indicator.classList.remove('searching');
                applyMonitorLabels(indicator, DEFAULT_MONITOR_LABELS);
                if (statusText) statusText.textContent = 'Idle';
                if (searchStatus) searchStatus.textContent = 'Idle';
                if (wikisSearched) wikisSearched.textContent = '0/0';
                if (resultsFound) resultsFound.textContent = '0';
                if (dot) dot.style.background = '#e0e0e0';

                // Actually hide the overlay unless we have a specific reason to keep it visible
                indicator.classList.remove('visible');
                indicator.style.display = 'none';
                
                // Clear any stored stats in the monitor UI if it exists
                const monitorStatus = document.querySelector('.gemini-monitor-status-text');
                if (monitorStatus && monitorStatus.textContent.includes('Searching')) {
                    monitorStatus.textContent = 'Search complete. Standing by.';
                }
                
                return;
            }

            // If we ARE searching, make sure it is visible + start safety timer
            indicator.classList.add('visible');
            indicator.style.display = '';
            startSafetyTimer();
            applyMonitorLabels(indicator, monitorLabels);

            if (isSearching || message === 'Idle') {
                indicator.classList.remove('error');
            }

            if (statusText) {
                const phase = stats.statusPhase || 'search';
                const title = stats.currentResult;
                if (typeof stats.statusText === 'string' && stats.statusText.trim()) {
                    statusText.textContent = stats.statusText;
                } else if (window.LIStats) {
                    statusText.textContent = LIStats.getStatusText(phase, title, message);
                } else {
                    statusText.textContent = title ? `-> ${title}` : message;
                }
            }

            if (searchStatus) {
                searchStatus.textContent = stats.searchStatusText !== undefined
                    ? String(stats.searchStatusText)
                    : message;
            }
            if (wikisSearched) {
                if (stats.wikisSearchedDisplay !== undefined) {
                    wikisSearched.textContent = String(stats.wikisSearchedDisplay);
                } else if (stats.wikisSearched !== undefined) {
                    if (window.LIStats) {
                        wikisSearched.textContent = LIStats.formatWikiProgress(stats.wikisSearched, stats.totalWikis);
                    } else {
                        wikisSearched.textContent = `${stats.wikisSearched}/${stats.totalWikis || 0}`;
                    }
                }
            }
            if (resultsFound) {
                if (stats.resultsFoundDisplay !== undefined) {
                    resultsFound.textContent = String(stats.resultsFoundDisplay);
                } else if (stats.resultsFound !== undefined) {
                    resultsFound.textContent = stats.resultsFound;
                }
            }
            if (stats.dotColor && dot) {
                dot.style.background = String(stats.dotColor);
            } else if (dot) {
                dot.style.background = '#9e9e9e';
            }
        }

        function showErrorInMonitor(message) {
            const indicator = document.getElementById('loadingIndicator');
            if (!indicator) return;

            const statusText = indicator.querySelector('.status-text');
            const searchStatus = indicator.querySelector('#searchStatus');

            indicator.classList.add('visible');
            indicator.classList.remove('compact');
            indicator.classList.remove('searching');
            indicator.classList.add('error');
            indicator.classList.remove('details-collapsed'); // Auto-expand panel on error so detail is visible
            applyMonitorLabels(indicator, DEFAULT_MONITOR_LABELS);

            if (statusText) statusText.textContent = 'Error';
            if (searchStatus) searchStatus.textContent = message;
            api._loadingIndicatorCompact = false;
        }

        function update(showIndicator, message = 'Loading...') {
            updateEnhanced(showIndicator, message);
        }

        function forceReset() {
            clearSafetyTimer();
            const indicator = document.getElementById('loadingIndicator');
            if (!indicator) return;
            indicator.classList.remove('searching', 'error', 'visible');
            indicator.style.display = 'none';
            applyMonitorLabels(indicator, DEFAULT_MONITOR_LABELS);
            const statusText = indicator.querySelector('.status-text');
            if (statusText) statusText.textContent = 'Idle';
            const dot = indicator.querySelector('.dot');
            if (dot) dot.style.background = '#e0e0e0';
            api._loadingIndicatorCompact = true;
        }

        return {
            show,
            hide,
            updateEnhanced,
            showErrorInMonitor,
            update,
            forceReset
        };
    };
})();
