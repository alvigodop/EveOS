/* Public EveOS and Constellation bridges for the Search Advanced index. */
(function () {
    const index = window.EveOS?.SearchAdvanced?.Index;
    if (!index) {
        console.error('[DatapackIndex] Index bridge loaded before the index runtime.');
        return;
    }

    window.EveOS = window.EveOS || {};
    window.EveOS.DatapackIndex = index;
    window.EveOS.DatapackGraph = Object.assign(window.EveOS.DatapackGraph || {}, {
        getProjection: function (scope) {
            return index.buildGraphProjection({ scope: scope || null });
        },
        getStructureSummary: function () {
            return index.getStructureSummary();
        },
        getIntegrityReport: function (scope) {
            return index.getIntegrityReport({ scope: scope || null });
        }
    });

    window.EveConstellationMap = window.EveConstellationMap || {};
    window.EveConstellationMap.getNexusGraphProjection = function (scope) {
        return index.buildGraphProjection({ scope: scope || null });
    };
})();
