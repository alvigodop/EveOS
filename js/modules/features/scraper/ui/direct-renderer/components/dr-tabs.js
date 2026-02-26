/**
 * Direct Renderer - Tabs
 * Direct tab switching functionality as fallback for TabManager
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DRTabs = {
        version: '1.0.0',

        init: function () {
            console.log('DRTabs initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Setup direct tab switching functionality
         * NOTE: Only used as fallback if TabManager is not available
         */
        setupDirectTabSwitching: function () {
            // Skip if TabManager is available and initialized
            if (window.TabManager && TabManager._initialized) {
                return;
            }

            const wikipediaTab = document.getElementById('wikipediaTab');
            const fandomTab = document.getElementById('fandomTab');

            // Skip if handlers already installed
            if (wikipediaTab && wikipediaTab._moduleUtilitiesTabHandler) {
                return;
            }

            if (wikipediaTab) {
                wikipediaTab.onclick = function () {
                    wikipediaTab.classList.add('active');
                    if (fandomTab) fandomTab.classList.remove('active');

                    const wikipediaManagement = document.getElementById('wikipediaManagement');
                    const wikipediaOptions = document.getElementById('wikipediaOptions');
                    const fandomManagement = document.getElementById('fandomManagement');
                    const fandomOptions = document.getElementById('fandomOptions');

                    if (wikipediaManagement) wikipediaManagement.style.display = 'block';
                    if (wikipediaOptions) wikipediaOptions.style.display = 'flex';
                    if (fandomManagement) fandomManagement.style.display = 'none';
                    if (fandomOptions) fandomOptions.style.display = 'none';

                    if (window.TabManager && typeof TabManager.switchTab === 'function') {
                        TabManager.switchTab('wikipedia');
                    }
                };
                wikipediaTab._moduleUtilitiesTabHandler = true;
            }

            if (fandomTab) {
                fandomTab.onclick = function () {
                    fandomTab.classList.add('active');
                    if (wikipediaTab) wikipediaTab.classList.remove('active');

                    const wikipediaManagement = document.getElementById('wikipediaManagement');
                    const wikipediaOptions = document.getElementById('wikipediaOptions');
                    const fandomManagement = document.getElementById('fandomManagement');
                    const fandomOptions = document.getElementById('fandomOptions');

                    if (wikipediaManagement) wikipediaManagement.style.display = 'none';
                    if (wikipediaOptions) wikipediaOptions.style.display = 'none';
                    if (fandomManagement) fandomManagement.style.display = 'block';
                    if (fandomOptions) fandomOptions.style.display = 'flex';

                    if (window.TabManager && typeof TabManager.switchTab === 'function') {
                        TabManager.switchTab('fandom');
                    }
                };
                fandomTab._moduleUtilitiesTabHandler = true;
            }
        }
    };

    // Expose globally
    window.DRTabs = DRTabs;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('DRTabs', DRTabs);
    }
})();
