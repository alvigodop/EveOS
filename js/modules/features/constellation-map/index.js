/**
 * Constellation Map Module Entry Point
 * Orchestrates the constellation map system
 */
window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    // Modular loading state
    ns.ready = false;

    /**
     * Initialize the constellation map module
     */
    ns.init = function() {
        console.log('[ConstellationMap] Initializing module...');
        
        // The core logic already sets ns.ready = true at the end
        // but we can add any explicit initialization steps here if needed.
        
        if (ns.ensureContainer) {
            ns.ensureContainer();
        }
        
        ns.ready = true;
        console.log('[ConstellationMap] Module ready.');
    };

})(window.EveConstellationMap);
