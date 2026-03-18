/**
 * Constellation Map Initializer for Eve OS
 */
window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    function init() {
        if (typeof ns.init === 'function') {
            ns.init();
        } else {
            console.warn('[ConstellationMap] ns.init not found, falling back to manual ready state');
            ns.ready = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window.EveConstellationMap);
