/**
 * Debug Panel Core Module
 * Handles initialization, global registration, and event binding.
 */
(function () {
    const DPCore = {
        name: 'DPCore',
        version: '1.0.0',
        _initialized: false,

        init: function () {
            if (this._initialized) return true;
            console.log('DPCore initializing');

            this.bindEvents();

            this._initialized = true;
            return true;
        },

        bindEvents: function () {
            // Setup debug button
            this.setupDebugButton();

            // Global keyboard shortcut
            document.addEventListener('keydown', (e) => {
                if (e.altKey && e.key === 'e') {
                    console.log('Alt+E pressed, showing debug panel');
                    // Delegate to facade/panel
                    if (window.DebugPanel && window.DebugPanel.showErrorPanel) {
                        window.DebugPanel.showErrorPanel();
                    }
                    e.preventDefault();
                }
            });
        },

        setupDebugButton: function () {
            console.log('Setting up debug button event handler');
            const debugBtn = document.getElementById('debugBtn');

            if (debugBtn) {
                const showPanel = (e) => {
                    if (e) e.preventDefault();
                    if (window.DebugPanel && window.DebugPanel.showErrorPanel) {
                        window.DebugPanel.showErrorPanel();
                    }
                    return false;
                };

                debugBtn.onclick = showPanel;
                debugBtn.addEventListener('click', showPanel);
                console.log('Added direct event listener to Debug button');
            }
        }
    };

    window.DPCore = DPCore;

    // Self-init if ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        DPCore.init();
    } else {
        document.addEventListener('DOMContentLoaded', () => DPCore.init());
    }
})();
