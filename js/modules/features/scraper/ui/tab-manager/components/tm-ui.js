/**
 * Tab Manager UI Module
 * 
 * Handles DOM manipulation for Tab Manager.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const TabManagerUI = {
        /**
         * Core logic to switch tabs
         * @param {string} source - 'wikipedia', 'fandom', or 'api'
         * @param {boolean} isInitialLoad 
         * @param {boolean} silent 
         */
        switchTab: function (source, isInitialLoad, silent) {
            try {
                // Check source validity
                if (!['wikipedia', 'fandom', 'api'].includes(source)) {
                    console.error(`Invalid source: ${source}, must be 'wikipedia', 'fandom', or 'api'`);
                    return;
                }

                // Update state via global state object if available
                if (window.TabManagerState) {
                    TabManagerState.setCurrentSource(source);
                }

                // Don't perform UI updates in silent mode
                if (silent) return;

                // Update UI components
                this.updateTabButtons(source);
                this.updatePanels(source, isInitialLoad);

                // Sync layout state
                this.syncLayoutState();

                // Clear results
                this.clearResults(isInitialLoad, source);

            } catch (error) {
                console.error('Error in TabManagerUI.switchTab:', error);

                // Only run fallback if not in silent mode
                if (silent) return;

                this.runFallbackSwitch(source);
            }
        },

        updateTabButtons: function (source) {
            document.querySelectorAll('.source-toggle-btn').forEach(function (button) {
                button.classList.toggle('active', button.dataset.source === source);
            });

            const wikipediaTab = document.getElementById('wikipediaTab');
            const fandomTab = document.getElementById('fandomTab');
            const apiTab = document.getElementById('apiTab');

            if (wikipediaTab) {
                wikipediaTab.classList.toggle('active', source === 'wikipedia');
            }

            if (fandomTab) {
                fandomTab.classList.toggle('active', source === 'fandom');
            }

            if (apiTab) {
                apiTab.classList.toggle('active', source === 'api');
            }
        },

        updatePanels: function (source, isInitialLoad) {
            // Ensure global options are visible
            const globalOptions = document.getElementById('globalOptions');
            if (globalOptions) {
                globalOptions.style.display = 'flex';
            }

            // Update management panels
            const wikipediaManagement = document.getElementById('wikipediaManagement');
            const fandomManagement = document.getElementById('fandomManagement');
            const apiManagement = document.getElementById('apiManagement');

            if (wikipediaManagement) {
                wikipediaManagement.style.display = source === 'wikipedia' ? 'block' : 'none';
            } else if (!isInitialLoad) {
                console.warn('wikipediaManagement element not found');
            }

            if (fandomManagement) {
                fandomManagement.style.display = source === 'fandom' ? 'block' : 'none';
            } else if (!isInitialLoad) {
                console.warn('fandomManagement element not found');
            }

            if (apiManagement) {
                apiManagement.style.display = source === 'api' ? 'block' : 'none';
            } else if (!isInitialLoad) {
                console.warn('apiManagement element not found');
            }
        },

        syncLayoutState: function () {
            // Update layout based on the current source (reading from DOM)
            const layoutSelect = document.getElementById('layoutSelect');
            if (layoutSelect && window.TabManagerState) {
                TabManagerState.setCurrentLayout(layoutSelect.value);
            }
        },

        clearResults: function (isInitialLoad, source) {
            // Clear results after a short delay
            setTimeout(() => {
                const resultsDiv = document.getElementById('results');
                if (resultsDiv) {
                    resultsDiv.innerHTML = '';
                }

                const resultCount = document.getElementById('resultCount');
                if (resultCount) {
                    resultCount.textContent = '0';
                }

                // Dispatch a custom event to notify that tab has changed
                const currentLayout = window.TabManagerState ? TabManagerState.getCurrentLayout() : 'grid';
                const event = new CustomEvent('tabChanged', {
                    detail: {
                        source: source,
                        layout: currentLayout
                    }
                });
                document.dispatchEvent(event);
            }, isInitialLoad ? 0 : 300);

            // Make sure application UI is showing after tab switch
            if (!isInitialLoad && typeof window.forceCompleteLoading === 'function') {
                window.forceCompleteLoading();
            }

            // Make sure the initial loading indicator is hidden
            const loadingElement = document.getElementById('initialLoading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }

            // Make sure the main content is visible
            const mainElement = document.querySelector('main');
            if (mainElement) {
                mainElement.style.display = 'block';
            }
        },

        runFallbackSwitch: function (source) {
            try {
                const wikipediaManagement = document.getElementById('wikipediaManagement');
                const fandomManagement = document.getElementById('fandomManagement');
                const apiManagement = document.getElementById('apiManagement');
                if (wikipediaManagement) wikipediaManagement.style.display = 'none';
                if (fandomManagement) fandomManagement.style.display = 'none';
                if (apiManagement) apiManagement.style.display = 'none';

                if (source === 'wikipedia') {
                    if (wikipediaManagement) wikipediaManagement.style.display = 'block';
                } else if (source === 'api') {
                    if (apiManagement) apiManagement.style.display = 'block';
                } else {
                    if (fandomManagement) fandomManagement.style.display = 'block';
                }

                const mainElement = document.querySelector('main');
                if (mainElement) mainElement.style.display = 'block';

                const loadingElement = document.getElementById('initialLoading');
                if (loadingElement) loadingElement.style.display = 'none';

                const resultsDiv = document.getElementById('results');
                if (resultsDiv) {
                    resultsDiv.innerHTML = '';
                }

                if (window.TabManagerState) {
                    TabManagerState.setCurrentSource(source);
                }
            } catch (fallbackError) {
                console.error('Error in fallback tab switching:', fallbackError);
            }
        },

        handleLayoutChange: function () {
            try {
                const currentLayout = window.TabManagerState ? TabManagerState.getCurrentLayout() : 'grid';
                const currentSource = window.TabManagerState ? TabManagerState.getCurrentSource() : 'wikipedia';

                // Notify result display
                if (window.ResultDisplay && typeof ResultDisplay.updateLayout === 'function') {
                    ResultDisplay.updateLayout(currentLayout);
                }

                // Dispatch custom event
                const event = new CustomEvent('layoutChanged', {
                    detail: {
                        source: currentSource,
                        layout: currentLayout
                    }
                });
                document.dispatchEvent(event);
            } catch (error) {
                console.error('Error in TabManagerUI.handleLayoutChange:', error);
            }
        },

        handleGroupByChange: function () {
            try {
                let groupBy = 'none';
                const groupBySelect = document.getElementById('groupBySelect');
                if (groupBySelect) {
                    groupBy = groupBySelect.value;
                }

                const currentSource = window.TabManagerState ? TabManagerState.getCurrentSource() : 'wikipedia';

                // Notify result display
                if (window.ResultDisplay && typeof ResultDisplay.updateGrouping === 'function') {
                    ResultDisplay.updateGrouping(groupBy);
                }

                // Dispatch custom event
                const event = new CustomEvent('groupingChanged', {
                    detail: {
                        source: currentSource,
                        groupBy: groupBy
                    }
                });
                document.dispatchEvent(event);
            } catch (error) {
                console.error('Error in TabManagerUI.handleGroupByChange:', error);
            }
        }
    };

    window.TabManagerUI = TabManagerUI;

})();
