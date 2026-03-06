window.UICoreModules = window.UICoreModules || {};

(function () {
    window.UICoreModules.createDisplayHelpers = function createDisplayHelpers() {
        function showResultsContainer() {
            console.log('UI.showResultsContainer called');
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection) {
                resultsSection.style.display = 'block';
                return true;
            }
            return false;
        }

        function hideResultsContainer() {
            console.log('UI.hideResultsContainer called');
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection) {
                resultsSection.style.display = 'none';
                return true;
            }
            return false;
        }

        function showLoading(message) {
            if (window.LoadingIndicator) {
                return LoadingIndicator.show(message);
            }
            console.warn('LoadingIndicator module not loaded, using fallback');
            const loading = document.getElementById('loading');
            if (loading) {
                loading.style.display = 'flex';
                const textElement = loading.querySelector('p');
                if (textElement && message) textElement.textContent = message;
                return true;
            }
            return false;
        }

        function hideLoading() {
            if (window.LoadingIndicator) {
                return LoadingIndicator.hide();
            }
            const loading = document.getElementById('loading');
            if (loading) {
                loading.style.display = 'none';
                return true;
            }
            return false;
        }

        function createLoadingIndicator() {
            if (window.LoadingIndicator) {
                LoadingIndicator.createLoadingIndicator();
            }
        }

        function updatePageTitle(title) {
            document.title = title;
        }

        function closeAllPopups() {
            const popups = document.querySelectorAll('.popup');
            popups.forEach(function (popup) {
                popup.style.display = 'none';
            });
        }

        return {
            showResultsContainer,
            hideResultsContainer,
            showLoading,
            hideLoading,
            createLoadingIndicator,
            updatePageTitle,
            closeAllPopups
        };
    };
})();
