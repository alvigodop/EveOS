/**
 * Google CSE Utilities Module (Facade)
 * 
 * Handles DOM manipulation, container management, and cleanup.
 * Delegates to CUDOM and CUFallback.
 * 
 * @version 1.0.1 (Modularized)
 */

const CSEUtils = (function () {
    // Check for submodules
    const checkComponents = () => {
        if (!window.CUDOM) console.warn('CSEUtils: CUDOM not found');
        if (!window.CUFallback) console.warn('CSEUtils: CUFallback not found');
    };

    return {
        /**
         * Ensure that the search and results containers exist
         * @param {Object} containerIds - Configured container IDs
         */
        ensureContainersExist: function (containerIds) {
            if (window.CUDOM) {
                return CUDOM.ensureContainersExist(containerIds);
            }
            console.error('CSEUtils: CUDOM missing, cannot ensure containers');
            return false;
        },

        /**
         * Cleanup Google CSE elements from the page
         * @param {Object} containerIds - Configured container IDs
         */
        cleanup: function (containerIds) {
            if (window.CUDOM) {
                CUDOM.cleanup(containerIds);
            } else {
                console.error('CSEUtils: CUDOM missing, cannot cleanup');
            }
        },

        /**
         * Create fallback search UI
         * @param {Object} config - CSE Configuration
         * @param {string} reason - Error reason
         * @param {Function} retryCallback - Function to call on retry
         */
        createFallbackSearch: function (config, reason, retryCallback) {
            checkComponents();
            if (window.CUFallback) {
                // Pass CUDOM as dependency if available
                CUFallback.createFallbackSearch(config, reason, retryCallback, window.CUDOM);
            } else {
                console.error('CSEUtils: CUFallback missing, cannot create fallback UI');
            }
        }
    };
})();

if (typeof ModuleRegistry !== 'undefined') {
    ModuleRegistry.register('CSEUtils', CSEUtils);
}
window.CSEUtils = CSEUtils;
