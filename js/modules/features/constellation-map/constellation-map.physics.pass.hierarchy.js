window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const physicsHierarchy = ns._physicsHierarchy || {};
    const {
        buildParentChildren,
        buildRootChildGuides,
        buildWorkspaceChildGuides,
        applyParentDrift,
        maintainHierarchyState,
        finalizeCardFrontVectors,
        updateFolderOrientations,
        buildHierarchyAnchors,
        applyHierarchyAuras
    } = physicsHierarchy;

    function runHierarchyPass(ctx) {
        const { frontierReach } = ctx;
        const parentChildren = buildParentChildren();
        const rootChildGuides = buildRootChildGuides(parentChildren);
        const workspaceChildGuides = buildWorkspaceChildGuides(parentChildren);
        applyParentDrift(parentChildren);
        maintainHierarchyState();
        finalizeCardFrontVectors();
        updateFolderOrientations();
        buildHierarchyAnchors(parentChildren, frontierReach, rootChildGuides, workspaceChildGuides);
        applyHierarchyAuras();
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runHierarchyPass });
})(window.EveConstellationMap);
