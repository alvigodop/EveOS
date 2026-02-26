/**
 * Tab Manager Module (Facade)
 * 
 * Orchestrates switching between tabs and maintaining tab state by delegating to sub-components.
 * 
 * @version 1.0.3
 */

(function () {
    // Create namespace if it doesn't exist
    window.TabManager = window.TabManager || {};
    const TabManager = window.TabManager;

    // Add version and installation status flags
    TabManager.version = '1.0.3';
    TabManager.installed = true;
    TabManager._functional = true;

    // Define properties to delegate state
    Object.defineProperty(TabManager, 'currentSource', {
        get: function () { return window.TabManagerState ? TabManagerState.getCurrentSource() : 'wikipedia'; },
        set: function (val) { if (window.TabManagerState) TabManagerState.setCurrentSource(val); }
    });

    Object.defineProperty(TabManager, 'currentLayout', {
        get: function () { return window.TabManagerState ? TabManagerState.getCurrentLayout() : 'grid'; },
        set: function (val) { if (window.TabManagerState) TabManagerState.setCurrentLayout(val); }
    });

    /**
     * Initialize the tab manager
     */
    TabManager.init = function () {
        try {
            // Initialize components if they have an init method
            if (window.TabManagerState && typeof TabManagerState.init === 'function') {
                TabManagerState.init();
            }

            // Verify the UI elements
            if (window.TabManagerUtils && !TabManagerUtils.verifyRequiredElements()) {
                // Logic handled in verifyRequiredElements
            }

            // Set up initial tab state
            this.switchTab(this.currentSource, true);

            // Add event listeners for tab buttons
            const wikipediaTab = document.getElementById('wikipediaTab');
            const fandomTab = document.getElementById('fandomTab');

            if (wikipediaTab) {
                wikipediaTab.onclick = () => this.switchTab('wikipedia');
            }

            if (fandomTab) {
                fandomTab.onclick = () => this.switchTab('fandom');
            }

            // Add layout change listeners
            const layoutSelect = document.getElementById('layoutSelect');
            if (layoutSelect) {
                layoutSelect.onchange = (e) => {
                    this.currentLayout = e.target.value;
                    this.handleLayoutChange();
                };
            }

            // Add group by change listeners
            const groupBySelect = document.getElementById('groupBySelect');
            if (groupBySelect) {
                groupBySelect.onchange = () => {
                    this.handleGroupByChange();
                };
            }

            // Run a self-test
            this.selfTest();

            // Mark as initialized
            this._initialized = true;

            return this;
        } catch (error) {
            console.error('Error initializing TabManager:', error);
            this._functional = false;
            return this;
        }
    };

    /**
     * Verify that all required elements exist
     */
    TabManager.verifyRequiredElements = function () {
        return window.TabManagerUtils ? TabManagerUtils.verifyRequiredElements() : false;
    };

    /**
     * Run a self-test to ensure functionality
     */
    TabManager.selfTest = function () {
        if (window.TabManagerUtils) {
            const result = TabManagerUtils.selfTest(this);
            this._functional = result;
            return result;
        }
        return false;
    };

    /**
     * Switch between Wikipedia and Fandom tabs
     */
    TabManager.switchTab = function (source, isInitialLoad, silent) {
        if (window.TabManagerUI) {
            TabManagerUI.switchTab(source, isInitialLoad, silent);
        }
    };

    /**
     * Handle layout change
     */
    TabManager.handleLayoutChange = function () {
        if (window.TabManagerUI) {
            TabManagerUI.handleLayoutChange();
        }
    };

    /**
     * Handle group by change
     */
    TabManager.handleGroupByChange = function () {
        if (window.TabManagerUI) {
            TabManagerUI.handleGroupByChange();
        }
    };

    /**
     * Get the current tab source
     */
    TabManager.getCurrentSource = function () {
        return this.currentSource;
    };

    /**
     * Get the current layout
     */
    TabManager.getCurrentLayout = function () {
        return this.currentLayout;
    };

    /**
     * Get the current group by value
     */
    TabManager.getCurrentGroupBy = function () {
        const groupBySelect = document.getElementById('groupBySelect');
        return groupBySelect ? groupBySelect.value : 'none';
    };

    /**
     * Get the active tab ID
     */
    TabManager.getActiveTabId = function () {
        return window.TabManagerUtils ? TabManagerUtils.getActiveTabId(this.currentSource) : (this.currentSource === 'wikipedia' ? 'wikipediaTab' : 'fandomTab');
    };

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('TabManager', TabManager);
    }

    // Auto-initialize when the DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TabManager.init());
    } else {
        setTimeout(() => TabManager.init(), 0);
    }

})();