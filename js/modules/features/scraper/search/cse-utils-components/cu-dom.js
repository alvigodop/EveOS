/**
 * Google CSE Utilities - DOM Component
 * 
 * Handles DOM manipulation, container management, and cleanup for Google CSE.
 * 
 * @version 1.0.0
 */

const CUDOM = {
    /**
     * Ensure that the search and results containers exist
     * @param {Object} containerIds - Configured container IDs
     */
    ensureContainersExist: function (containerIds) {
        try {
            // Check for search box container
            let searchBox = document.getElementById(containerIds.searchBoxId);
            if (!searchBox) {
                // console.log(`CSEUtils: Creating search box container ${containerIds.searchBoxId}`);
                searchBox = document.createElement('div');
                searchBox.id = containerIds.searchBoxId;
                searchBox.style.cssText = 'width: 100%; max-width: 600px; margin: 20px auto; display: none;'; // Hidden by default
                document.body.appendChild(searchBox);
            }

            // Check for results container
            let resultsContainer = document.getElementById(containerIds.resultsContainerId);
            if (!resultsContainer) {
                // console.log(`CSEUtils: Creating results container ${containerIds.resultsContainerId}`);
                resultsContainer = document.createElement('div');
                resultsContainer.id = containerIds.resultsContainerId;
                resultsContainer.style.cssText = 'width: 100%; margin: 20px auto; min-height: 200px; display: none;'; // Hidden by default
                document.body.appendChild(resultsContainer);
            }

            return true;
        } catch (error) {
            console.error('CUDOM: Error ensuring containers exist:', error);
            return false;
        }
    },

    /**
     * Cleanup Google CSE elements from the page
     * @param {Object} containerIds - Configured container IDs
     */
    cleanup: function (containerIds) {
        try {
            console.log('CUDOM: Cleaning up Google CSE elements');

            // Remove Google CSE script
            const cseScripts = document.querySelectorAll('script[src*="cse.google.com"]');
            cseScripts.forEach(script => {
                if (script.parentNode) script.parentNode.removeChild(script);
            });

            // Remove Google CSE stylesheet
            const cseStyles = document.querySelectorAll('link[href*="cse.google.com"], link[href*="www.google.com/cse"]');
            cseStyles.forEach(style => {
                if (style.parentNode) style.parentNode.removeChild(style);
            });

            // Remove Google CSE elements and ads
            const cseSelectors = [
                '.gsc-control-cse',
                '.gstl_50',
                '.gssb_c',
                '.gsc-results-wrapper-overlay',
                '.gsc-modal-background-image',
                '.gcse-searchbox',
                '.gcse-searchresults',
                'iframe[name^="google_cse"]',
                '.google-auto-placed'
            ];

            const cseElements = document.querySelectorAll(cseSelectors.join(', '));
            cseElements.forEach(element => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });

            // Clear the containers
            if (containerIds) {
                const searchBox = document.getElementById(containerIds.searchBoxId);
                const resultsContainer = document.getElementById(containerIds.resultsContainerId);

                if (searchBox) searchBox.innerHTML = '';
                if (resultsContainer) resultsContainer.innerHTML = '';
            }

            // Remove any global callbacks
            if (window.google && window.google.search && window.google.search.cse) {
                try {
                    // Attempt to clean up internal google state if possible/safe
                    // Often we can't delete window.google entirely as other scripts might use it
                } catch (e) { /* ignore */ }
            }

        } catch (error) {
            console.error('CUDOM: Error during cleanup:', error);
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CUDOM', CUDOM);
}

window.CUDOM = CUDOM;
