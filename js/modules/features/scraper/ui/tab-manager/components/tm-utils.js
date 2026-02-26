/**
 * Tab Manager Utils Module
 * 
 * Utility functions for Tab Manager.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const TabManagerUtils = {
        /**
         * Verify that all required elements exist
         * @returns {boolean} Whether all required elements are present
         */
        verifyRequiredElements: function () {
            // Required element IDs
            const requiredElements = [
                'wikipediaTab',
                'fandomTab',
                'wikipediaManagement',
                'fandomManagement',
                'globalOptions'
            ];

            // Optional element IDs
            const optionalElements = [
                'layoutSelect',
                'groupBySelect',
                'results'
            ];

            // Check if required elements exist
            let allPresent = true;
            requiredElements.forEach(id => {
                const element = document.getElementById(id);
                if (!element) {
                    // Legacy element #${id} not present in current UI
                    allPresent = false;
                }
            });

            // Check optional elements (logging logic can be added if debug mode)

            return allPresent;
        },

        /**
         * Get the active tab ID
         * @param {string} currentSource 
         * @returns {string}
         */
        getActiveTabId: function (currentSource) {
            return currentSource === 'wikipedia' ? 'wikipediaTab' : 'fandomTab';
        },

        /**
         * Run a self-test to ensure functionality
         * @param {Object} tabManagerInstance - Reference to main facade for callbacks
         * @returns {boolean} Whether the self-test passed
         */
        selfTest: function (tabManagerInstance) {
            try {
                // Test if current source is set
                if (!tabManagerInstance.getCurrentSource()) {
                    console.error('TabManager self-test: currentSource is not set');
                    return false;
                }

                // Test if switchTab works (mocking the context)
                const originalSource = tabManagerInstance.getCurrentSource();
                const testSource = originalSource === 'wikipedia' ? 'fandom' : 'wikipedia';

                // Test tab switching
                try {
                    // Use silent mode (don't actually update UI, just test function)
                    if (typeof tabManagerInstance.switchTab === 'function') {
                        tabManagerInstance.switchTab(testSource, true, true);
                        // Switch back
                        tabManagerInstance.switchTab(originalSource, true, true);
                    }
                } catch (error) {
                    console.error('TabManager self-test: switchTab failed', error);
                    return false;
                }

                return true;
            } catch (error) {
                console.error('TabManager self-test failed:', error);
                return false;
            }
        }
    };

    window.TabManagerUtils = TabManagerUtils;

})();
