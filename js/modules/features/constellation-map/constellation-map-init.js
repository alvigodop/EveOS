/**
 * Constellation Map Initializer for Eve OS
 * Initializes the constellation map system
 */
window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    function init() {
        // Any specific initialization logic if needed in the future
        console.log('ConstellationMap initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window.EveConstellationMap);
