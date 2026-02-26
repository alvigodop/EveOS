/**
 * Debug Panel Module (Facade)
 * 
 * Manages the error and debug panel UI by coordinating sub-modules:
 * - DPCore: Initialization and events
 * - DPPanel: UI creation
 * - DPLogger: Logging logic
 */

(function () {
    const DebugPanel = {
        name: 'DebugPanel',
        version: '1.0.0',
        _initialized: false,

        /**
         * Initialize the DebugPanel module
         */
        init: function () {
            if (this._initialized) return;

            console.log('DebugPanel (Facade) initializing');

            // Delegate core init to DPCore if available
            if (window.DPCore) {
                DPCore.init();
            } else {
                console.warn('DPCore not found, falling back to local event binding');
                this.setupDebugButton();
            }

            // Initialize DPPanel
            if (window.DPPanel && typeof DPPanel.init === 'function') {
                DPPanel.init();
            }

            this._initialized = true;
        },

        /**
         * Show the error debugging panel
         */
        showErrorPanel: function () {
            console.log("DebugPanel.showErrorPanel called");

            try {
                // Check if panel exists using ID from DPPanel
                const errorPanel = document.getElementById('errorDebugPanel');

                if (!errorPanel) {
                    console.log("Creating new debug panel");

                    if (window.DPPanel) {
                        // Pass 'this' as context so buttons can call refreshErrorLog on the facade
                        const newPanel = DPPanel.createFullDebugPanel(this);
                        if (!newPanel) throw new Error("DPPanel failed to create panel");
                    } else {
                        throw new Error("DPPanel module not found");
                    }
                } else {
                    console.log("Using existing debug panel");
                    errorPanel.style.display = 'block';
                }

                // Refresh content
                this.refreshErrorLog();

            } catch (error) {
                console.error('Error showing full debug panel, falling back to emergency panel:', error);
                this.createEmergencyDebugPanel();
            }
        },

        /**
         * Refresh the error log display
         */
        refreshErrorLog: function () {
            const logContainer = document.getElementById('debugLogContainer');
            if (!logContainer) return;

            if (window.DPLogger) {
                DPLogger.refreshErrorLog(logContainer);
            } else {
                logContainer.innerHTML = '<p style="color:red">DPLogger module not found.</p>';
            }
        },

        /**
         * Create emergency debug panel fallback
         */
        createEmergencyDebugPanel: function () {
            if (window.DPPanel) {
                DPPanel.createEmergencyDebugPanel();
            } else {
                alert('Critical error: DPPanel module missing. Unable to create emergency panel.');
            }
        },

        /**
         * Setup debug button event handler
         * (Delegated to DPCore mostly, but kept for compatibility/standalone use)
         */
        setupDebugButton: function () {
            if (window.DPCore) {
                DPCore.setupDebugButton();
            }
        }
    };

    // Initialize
    window.DebugPanel = DebugPanel;

    // Auto-init only if DPCore isn't handling it, or to ensure facade readiness
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        DebugPanel.init();
    } else {
        document.addEventListener('DOMContentLoaded', () => DebugPanel.init());
    }

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('DebugPanel', DebugPanel);
    }

    // Global alias
    window.showErrorPanel = DebugPanel.showErrorPanel.bind(DebugPanel);

})();
