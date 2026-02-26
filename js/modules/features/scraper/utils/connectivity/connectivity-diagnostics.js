/**
 * Connectivity Diagnostics Module
 * 
 * Provides diagnostic tools and recommendations based on connection status.
 * 
 * @version 1.0.0
 */

const ConnectivityDiagnostics = {
    /**
     * Run a diagnostic test
     * @returns {Object} Diagnostic results
     */
    diagnose: async function () {
        if (!window.ConnectivityCore) {
            console.error('ConnectivityDiagnostics: ConnectivityCore not available');
            return null;
        }

        // Refresh connection status via Core
        await ConnectivityCore.runTests();
        const status = ConnectivityCore.getStatus();

        const diagnosis = {
            connectionStatus: status,
            corsProxyStatus: window.CORSProxyManager ? CORSProxyManager.getProxyStatus() : null,
            recommendations: []
        };

        // Generate recommendations
        if (!status.online) {
            diagnosis.recommendations.push('You appear to be offline. Connect to the internet to use this application.');
        }

        if (!status.canAccessWikipedia && !status.canAccessFandom) {
            diagnosis.recommendations.push('Unable to access Wikipedia or Fandom directly. Try using a CORS proxy or check your firewall settings.');
        }

        if (status.needsCorsProxy) {
            if (!window.CORSProxyManager || !CORSProxyManager._functional) {
                diagnosis.recommendations.push('CORS proxy is required but no working proxies are available.');
            } else {
                const workingProxies = diagnosis.corsProxyStatus.filter(p => p.working).length;
                if (workingProxies === 0) {
                    diagnosis.recommendations.push('No working CORS proxies found. Consider refreshing the page.');
                } else {
                    diagnosis.recommendations.push(`Using ${workingProxies} working CORS proxies.`);
                }
            }
        }

        // Log results
        console.log('=== Connectivity Diagnosis ===');
        console.log('Connection Status:', diagnosis.connectionStatus);
        if (diagnosis.recommendations.length > 0) {
            console.log('=== Recommendations ===');
            diagnosis.recommendations.forEach((rec, i) => console.log(`${i + 1}. ${rec}`));
        }

        return diagnosis;
    }
};

if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ConnectivityDiagnostics', ConnectivityDiagnostics);
}
