/**
 * Library Initializer for Eve OS
 * Initializes the library system on page load
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    function init() {
        // Load library data from localStorage
        if (window.EveLibrary.Storage) {
            window.EveLibrary.Storage.loadLibrary({ initialOnly: true });
        }
        if (window.EveLibrary.ConnectionsAPI?.loadConnections) {
            // Deferred loading can finish after a restore or remote state apply.
            // Startup hydration must not overwrite newer in-memory connections.
            window.EveLibrary.ConnectionsAPI.loadConnections({ initialOnly: true });
        }
        console.log('EveLibrary initialized');
    }

    // Global function for toggling library panel (called from category cards)
    window.toggleCategoryLibrary = function (categoryName) {
        if (window.EveLibrary.UI) {
            window.EveLibrary.UI.toggleLibraryPanel(categoryName);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
