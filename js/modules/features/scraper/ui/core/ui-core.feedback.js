window.UICoreModules = window.UICoreModules || {};

(function () {
    window.UICoreModules.createFeedbackHelpers = function createFeedbackHelpers() {
        function showError(message) {
            console.log('UI.showError called with: ' + message);
            const errorDisplay = document.getElementById('errorDisplay');
            if (errorDisplay) {
                errorDisplay.textContent = message || 'An error occurred';
                errorDisplay.style.display = 'block';
                setTimeout(function () {
                    errorDisplay.style.display = 'none';
                }, 5000);
                return true;
            }
            return false;
        }

        function stripHtml(html) {
            if (window.HtmlUtils) {
                return HtmlUtils.stripHtml(html);
            }
            if (!html) return '';
            return html.replace(/<\/?[^>]+(>|$)/g, '');
        }

        function cleanHtmlSnippet(html) {
            if (window.HtmlUtils) {
                return HtmlUtils.cleanHtmlSnippet(html);
            }
            if (!html) return '';
            return html.replace(/<\/?[^>]+(>|$)/g, '');
        }

        function showNotification(message, type, duration) {
            const noticeType = type || 'info';
            const noticeDuration = Number(duration) || 3000;

            if (window.ToastNotification && typeof ToastNotification.show === 'function') {
                ToastNotification.show(message, noticeType, { duration: noticeDuration });
                return;
            }

            const existingNotification = document.querySelector('.notification');
            if (existingNotification) {
                document.body.removeChild(existingNotification);
            }

            const notification = document.createElement('div');
            notification.className = `notification ${noticeType}`;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(function () {
                notification.classList.add('show');
            }, 10);

            setTimeout(function () {
                notification.classList.remove('show');
                setTimeout(function () {
                    notification.remove();
                }, 300);
            }, noticeDuration);
        }

        function toggleLoadingIndicator() {
            if (window.LoadingIndicator) {
                LoadingIndicator.toggleCompactMode();
            }
        }

        function updateLoadingIndicatorEnhanced(isSearching, message, stats) {
            if (window.LoadingIndicator) {
                LoadingIndicator.updateEnhanced(isSearching, message || 'Idle', stats || {});
            }
        }

        function showErrorInMonitor(message) {
            if (window.LoadingIndicator) {
                LoadingIndicator.showErrorInMonitor(message);
            }
        }

        function updateLoadingIndicator(show, elementId, message) {
            if (window.LoadingIndicator) {
                LoadingIndicator.update(show, message || 'Loading...');
            }
        }

        function displayDiscoveryResults(results, searchTerm, container) {
            if (window.DiscoveryRenderer) {
                DiscoveryRenderer.displayFandomResults(results, searchTerm, container);
            }
        }

        function displayWikiDiscoveryResults(results, searchTerm, container, existingEntries) {
            if (window.DiscoveryRenderer) {
                DiscoveryRenderer.displayWikiResults(results, searchTerm, container, existingEntries || []);
            }
        }

        return {
            showError,
            stripHtml,
            cleanHtmlSnippet,
            showNotification,
            toggleLoadingIndicator,
            updateLoadingIndicatorEnhanced,
            showErrorInMonitor,
            updateLoadingIndicator,
            displayDiscoveryResults,
            displayWikiDiscoveryResults
        };
    };
})();
