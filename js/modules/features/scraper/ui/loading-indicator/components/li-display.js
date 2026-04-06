/**
 * Loading Indicator Display Helpers
 */
window.LoadingIndicatorModules = window.LoadingIndicatorModules || {};

(function () {
    window.LoadingIndicatorModules.createDisplayHelpers = function createDisplayHelpers(ctx) {
        const api = ctx?.api || {};

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

            indicator.classList.toggle('searching', isSearching);

            if (!isSearching) {
                // If not searching, we should hide the overall overlay but maybe keep "Idle" if not specifically hidden
                if (statusText) statusText.textContent = 'Idle';
                if (searchStatus) searchStatus.textContent = 'Idle';
                if (wikisSearched) wikisSearched.textContent = '0/0';
                if (resultsFound) resultsFound.textContent = '0';
                if (dot) dot.style.background = '#e0e0e0';

                // Actually hide the overlay unless we have a specific reason to keep it visible
                indicator.classList.remove('visible');
                indicator.style.display = 'none';
                return;
            }

            // If we ARE searching, make sure it is visible
            indicator.classList.add('visible');
            indicator.style.display = '';

            if (isSearching || message === 'Idle') {
                indicator.classList.remove('error');
            }

            if (statusText) {
                const phase = stats.statusPhase || 'search';
                const title = stats.currentResult;
                if (window.LIStats) {
                    statusText.textContent = LIStats.getStatusText(phase, title, message);
                } else {
                    statusText.textContent = title ? `-> ${title}` : message;
                }
            }

            if (searchStatus) searchStatus.textContent = message;
            if (stats.wikisSearched !== undefined && wikisSearched) {
                if (window.LIStats) {
                    wikisSearched.textContent = LIStats.formatWikiProgress(stats.wikisSearched, stats.totalWikis);
                } else {
                    wikisSearched.textContent = `${stats.wikisSearched}/${stats.totalWikis || 0}`;
                }
            }
            if (stats.resultsFound !== undefined && resultsFound) {
                resultsFound.textContent = stats.resultsFound;
            }
            if (dot) dot.style.background = '#9e9e9e';
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

            if (statusText) statusText.textContent = 'Error';
            if (searchStatus) searchStatus.textContent = message;
            api._loadingIndicatorCompact = false;
        }

        function update(showIndicator, message = 'Loading...') {
            updateEnhanced(showIndicator, message);
        }

        return {
            show,
            hide,
            updateEnhanced,
            showErrorInMonitor,
            update
        };
    };
})();
