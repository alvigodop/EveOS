/**
 * Connectivity Status Updater Module
 * 
 * Updates other modules (DirectSearch, SearchManager, etc.) based on
 * current connectivity status.
 * 
 * @version 1.0.0
 */

const ConnectivityStatusUpdater = {
    /**
     * Update external modules based on connectivity status
     * @param {Object} connectionStatus - The status object from ConnectivityCore
     */
    updateModules: function (connectionStatus) {
        if (!connectionStatus) return;

        // Update DirectSearch
        if (window.DirectSearch) {
            try {
                const wasOfflineMode = DirectSearch._offlineMode;

                // Determine offline mode logic
                DirectSearch._offlineMode = !(connectionStatus.canAccessWikipedia ||
                    (connectionStatus.needsCorsProxy && window.CORSProxyManager && CORSProxyManager._functional));

                DirectSearch._functional = true;

                if (wasOfflineMode !== DirectSearch._offlineMode) {
                    console.log(`DirectSearch mode changed: ${wasOfflineMode ? 'offline' : 'online'} -> ${DirectSearch._offlineMode ? 'offline' : 'online'}`);
                }
            } catch (error) {
                console.warn("Could not update DirectSearch status:", error.message);
                if (typeof DirectSearch.setupFallbackMethods === 'function') {
                    DirectSearch._offlineMode = true;
                    DirectSearch._functional = true;
                    DirectSearch.setupFallbackMethods();
                }
            }
        }

        // Update SearchManager
        if (window.SearchManager) {
            try {
                SearchManager._functional = connectionStatus.canAccessWikipedia ||
                    connectionStatus.canAccessFandom ||
                    (window.CORSProxyManager && CORSProxyManager._functional);

                console.log(`Updated SearchManager._functional to ${SearchManager._functional}`);
            } catch (error) {
                console.warn("Could not update SearchManager status:", error.message);
            }
        }

        // Update TabManager
        if (window.TabManager) {
            try {
                TabManager._functional = true;
            } catch (error) {
                console.warn("Could not update TabManager status:", error.message);
            }
        }
    }
};

if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ConnectivityStatusUpdater', ConnectivityStatusUpdater);
}
