/**
 * Event Manager - Tabs Sub-module
 * Handles tab switching events and logic
 */

window.EventManagerTabs = window.EventManagerTabs || {};

(function (module) {

    /**
     * Set up tab switching event handlers
     */
    module.setupTabSwitching = function () {
        // Set up direct tab switching event handlers regardless of TabManager
        // This ensures tab switching works even if TabManager has issues
        // Tab handlers setup (silent)

        const wikipediaTab = document.getElementById('wikipediaTab');
        const fandomTab = document.getElementById('fandomTab');

        // Skip if handlers already installed
        if (wikipediaTab && wikipediaTab._eventManagerTabHandler) {
            // Tab handlers already installed
            return;
        }

        if (wikipediaTab) {
            wikipediaTab.addEventListener('click', () => {
                this.handleTabSwitch('wikipedia');
            });
            wikipediaTab._eventManagerTabHandler = true;
            // Tab uses source-toggle-btn in current UI
        }

        if (fandomTab) {
            fandomTab.addEventListener('click', () => {
                this.handleTabSwitch('fandom');
            });
            fandomTab._eventManagerTabHandler = true;
            // Fandom tab listener attached
        } else {
            // Tab uses source-toggle-btn in current UI
        }

        // Also listen for the tabChanged event that TabManager might dispatch
        document.addEventListener('tabChanged', (event) => {
            if (event.detail && event.detail.source) {
                // Tab changed event received
            }
        });
    };

    /**
     * Handle tab switching between Wikipedia and Fandom
     * @param {string} tabName - The tab to switch to ('wikipedia' or 'fandom')
     */
    module.handleTabSwitch = function (tabName) {
        console.log(`EventManager directly handling tab switch to ${tabName}`);

        // First try to use TabManager if available
        if (window.TabManager && typeof TabManager.switchTab === 'function') {
            try {
                console.log(`Delegating tab switch to TabManager: ${tabName}`);
                TabManager.switchTab(tabName);
                return;
            } catch (error) {
                console.error('Error in TabManager.switchTab, falling back to direct handling:', error);
            }
        }

        // Direct fallback implementation
        try {
            // Update tabs
            const wikipediaTab = document.getElementById('wikipediaTab');
            const fandomTab = document.getElementById('fandomTab');

            if (wikipediaTab) {
                wikipediaTab.classList.toggle('active', tabName === 'wikipedia');
            }

            if (fandomTab) {
                fandomTab.classList.toggle('active', tabName === 'fandom');
            }

            // Update panels
            const wikipediaOptions = document.getElementById('wikipediaOptions');
            const fandomOptions = document.getElementById('fandomOptions');

            if (wikipediaOptions) {
                wikipediaOptions.style.display = tabName === 'wikipedia' ? 'flex' : 'none';
            }

            if (fandomOptions) {
                fandomOptions.style.display = tabName === 'fandom' ? 'flex' : 'none';
            }

            // Update management panels
            const wikipediaManagement = document.getElementById('wikipediaManagement');
            const fandomManagement = document.getElementById('fandomManagement');

            if (wikipediaManagement) {
                wikipediaManagement.style.display = tabName === 'wikipedia' ? 'block' : 'none';
            }

            if (fandomManagement) {
                fandomManagement.style.display = tabName === 'fandom' ? 'block' : 'none';
            }

            // Store the current source
            window.currentSource = tabName;

            // Clear any search results
            const resultsDiv = document.getElementById('results');
            if (resultsDiv) {
                resultsDiv.innerHTML = '';
            }

            // Make sure application UI is showing
            const loadingElement = document.getElementById('initialLoading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }

            const mainElement = document.querySelector('main');
            if (mainElement) {
                mainElement.style.display = 'block';
            }

            console.log(`Directly switched to ${tabName} tab`);

            // Dispatch a custom event for other modules
            const event = new CustomEvent('tabChanged', {
                detail: {
                    source: tabName
                }
            });
            document.dispatchEvent(event);
        } catch (error) {
            console.error('Error in direct tab switching:', error);
        }
    };

})(window.EventManagerTabs);
