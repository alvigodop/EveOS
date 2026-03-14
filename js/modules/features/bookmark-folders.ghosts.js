window.EveBookmarkFolders = window.EveBookmarkFolders || {};
(function (ns) {
const ghostSensors = ns._ghostSensors || {};
const ghostRecursion = ns._ghostRecursion || {};
const { buildGhostSensorState } = ghostSensors;
const { populateGhostHierarchy } = ghostRecursion;

function buildGhostAugmentedScope(context) {
const sensorState = typeof buildGhostSensorState === 'function'
    ? buildGhostSensorState(context)
    : { scopedNodes: Array.isArray(context?.scopedNodes) ? context.scopedNodes.slice() : [], activeLinks: Array.isArray(context?.cardLinks) ? context.cardLinks.slice() : [], ghostFolders: [], ghostCategories: {}, activeSubGhosts: [], masterGhostId: '__ghost_master__' };

if (typeof populateGhostHierarchy === 'function') {
populateGhostHierarchy(sensorState);
}

let anyMasterEnabled = false;
Object.values(sensorState.ghostCategories || {}).forEach((category) => {
if (!category?._hasActiveChildren) return;
anyMasterEnabled = true;
sensorState.ghostFolders.push({
id: category.id,
name: category.name,
parentId: sensorState.masterGhostId,
isGhost: true,
_ghostLinks: [],
_ghostScopeRootId: sensorState.activeRealFolderId || null
});
});

if (anyMasterEnabled) {
sensorState.ghostFolders.unshift({
id: sensorState.masterGhostId,
name: '[ System Views ]',
parentId: sensorState.activeRealFolderId || null,
isGhost: true,
isMasterGhost: true,
_ghostLinks: [],
_ghostScopeRootId: sensorState.activeRealFolderId || null
});
sensorState.ghostFolders.push(...sensorState.activeSubGhosts);
}

const scopedNodes = [...sensorState.ghostFolders, ...(Array.isArray(sensorState.scopedNodes) ? sensorState.scopedNodes : [])];
return { scopedNodes, activeLinks: sensorState.activeLinks, ghostFolders: sensorState.ghostFolders };
}

ns._ghosts = ns._ghosts || {};
ns._ghosts.buildGhostAugmentedScope = buildGhostAugmentedScope;
})(window.EveBookmarkFolders);
