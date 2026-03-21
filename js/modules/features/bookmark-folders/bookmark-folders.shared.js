window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};
    if (shared.loaded) return;

    ns.buildScopedKey = shared.buildScopedKey;
    ns.getScopedTree = shared.getScopedTree;
    ns.setScopedTree = shared.setScopedTree;
    ns.getScopedNodes = shared.getScopedNodes;
    ns.setScopedNodes = shared.setScopedNodes;
    ns.normalizeClickBehaviorMode = shared.normalizeClickBehaviorMode;
    ns.normalizeTaskMode = shared.normalizeTaskMode;

    shared.loaded = true;
})(window.EveBookmarkFolders);
