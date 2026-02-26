/**
 * Direct Renderer (Facade)
 * Fallback rendering logic for lists and UI elements
 * 
 * Delegates to:
 * - DREvents: Button event handlers
 * - DRTabs: Tab switching logic
 * 
 * @version 1.1.0-facade
 */

const DirectRenderer = {
    version: '1.1.0-facade',
    _initialized: false,

    init: function () {
        if (this._initialized) return;
        console.log('DirectRenderer initialized');
        if (window.DREvents && typeof DREvents.init === 'function') {
            DREvents.init();
            DREvents._initialized = true;
        }
        if (window.DRTabs && typeof DRTabs.init === 'function') {
            DRTabs.init();
            DRTabs._initialized = true;
        }
        this._initialized = true;
    },

    /**
     * Performs auto-repair by rendering lists and ensuring UI visibility
     */
    performAutoRepair: function () {
        if (window.EmergencyFallbacks) {
            EmergencyFallbacks.ensureCriticalFunctionality();
        }

        this.verifyUIVisibility();
        this.setupDirectEventHandlers();
    },

    /**
     * Verify and fix UI visibility issues
     */
    verifyUIVisibility: function () {
        // Hide loading element
        const loadingElement = document.getElementById('initialLoading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }

        // Show main content
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.style.display = 'block';
        }

        // Show tabs if they exist
        const tabs = document.querySelector('.tabs');
        if (tabs) {
            tabs.style.display = 'flex';
        }
    },

    /**
     * Setup direct event handlers - delegates to DREvents
     */
    setupDirectEventHandlers: function () {
        if (window.DREvents) {
            DREvents.setupDirectEventHandlers();
        } else {
            console.warn('DirectRenderer: DREvents not available');
        }

        // Tab buttons
        this.setupDirectTabSwitching();
    },

    /**
     * Setup direct tab switching - delegates to DRTabs
     */
    setupDirectTabSwitching: function () {
        if (window.DRTabs) {
            DRTabs.setupDirectTabSwitching();
        } else {
            console.warn('DirectRenderer: DRTabs not available');
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('DirectRenderer', DirectRenderer);
}

// Make globally available
window.DirectRenderer = DirectRenderer;
