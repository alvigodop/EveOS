window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { text } = shared;

    ns._detached = ns._detached || {};
    Object.assign(ns._detached, {
        text,
        STORAGE_KEY: 'eveV22ConstellationDetached',
        PARKING_CATEGORY_NAME: 'Detached Nodes'
    });
})(window.EveConstellationMap);
