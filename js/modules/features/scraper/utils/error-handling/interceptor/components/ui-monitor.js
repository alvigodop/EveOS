/**
 * Module Error Interceptor - UI Monitor Component
 * 
 * Handles monitoring of UI elements like Force Reload button.
 */

(function () {
    'use strict';

    if (!window.ModuleErrorInterceptor) window.ModuleErrorInterceptor = {};
    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Monitor the Force Reload button to enable error interception proactively
     */
    ModuleErrorInterceptor.monitorForceReloadButton = function () {
        document.addEventListener('DOMContentLoaded', () => {
            const forceReloadBtn = document.getElementById('forceReloadBtn');
            if (forceReloadBtn) {
                // Listen for mousedown (before click) to enable interception early
                forceReloadBtn.addEventListener('mousedown', () => {
                    console.log('ModuleErrorInterceptor: Force Reload button pressed, activating interception');
                    this._activeInterception = true;

                    if (typeof this.blockNativeErrorDialogs === 'function') {
                        this.blockNativeErrorDialogs();
                    }

                    // Keep interception active for a longer period
                    setTimeout(() => {
                        console.log('ModuleErrorInterceptor: Deactivating interception');
                        this._activeInterception = false;
                    }, 3000); // Longer timeout to cover the whole reload process
                });
            }
        });
    };

    // Register submodule
    ModuleErrorInterceptor.uiMonitor = true;
    console.log('Module Error Interceptor - UI Monitor loaded');

})();
