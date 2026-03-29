window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const repulsion = ns._physicsAuraRepulsion || {};
    const recovery = ns._physicsAuraRecovery || {};

    const moduleApi = ns._physicsAura = ns._physicsAura || {};

    Object.assign(moduleApi, {
        isNodeMain: repulsion.isNodeMain,
        applyFolderAura: repulsion.applyFolderAura,
        applyCardAuraRepulsion: repulsion.applyCardAuraRepulsion,
        applyWorkspaceAuraRepulsion: repulsion.applyWorkspaceAuraRepulsion,
        applyFolderRecovery: recovery.applyFolderRecovery,
        applyBookmarkAwayBias: recovery.applyBookmarkAwayBias,
        stabilizeDirectCardBookmarkClearance: recovery.stabilizeDirectCardBookmarkClearance
    });
})(window.EveConstellationMap);
