window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, MOTION_MODE_ORDER } = shared;
    const moduleApi = ns._physicsMotionProfilesBase = ns._physicsMotionProfilesBase || {};

function getMotionProfile(nodeCount) {



        const normalizedMode = MOTION_MODE_ORDER.includes(state.motionMode)

            ? state.motionMode

            : 'web';



        if (normalizedMode === 'slow') {

            return {

                mode: normalizedMode,

                repulsionScale: 0.44,

                centerPullScale: 1.18,

                springScale: 0.94,

                hierarchyReactionScale: 0.56,

                folderRecoveryScale: 1.08,

                dampingScale: 0.89,

                speedScale: 0.34,

                worldTetherScale: 1.28,

                anchorScaleByKind: { workspace: 1.42, category: 1.16, folder: 1.02, link: 0.92 },

                dampingScaleByKind: { workspace: 0.9, category: 0.91, folder: 0.93, link: 0.90 }, // Reduced from 0.95

                speedScaleByKind: { workspace: 0.28, category: 0.36, folder: 0.46, link: 1.2 } 

                };

                }

                if (normalizedMode === 'web') {

                return {

                mode: normalizedMode,

                repulsionScale: 0.04,

                centerPullScale: 2.95,

                springScale: 0.38,

                hierarchyReactionScale: 0.02,

                folderRecoveryScale: 3.2,

                dampingScale: 0.8,

                speedScale: 0.2,

                worldTetherScale: 1.42,

                anchorScaleByKind: { workspace: 8.8, category: 6.9, folder: 1.28, link: 1.02 },

                dampingScaleByKind: { workspace: 0.62, category: 0.68, folder: 0.58, link: 0.48 }, // Reduced from 0.52

                speedScaleByKind: { workspace: 0.03, category: 0.06, folder: 0.22, link: 1.1 } 

                };

                }

                if (normalizedMode === 'free') {
                return {
                mode: normalizedMode,
                repulsionScale: 1.15,
                centerPullScale: 0.82,
                springScale: 0.88,
                hierarchyReactionScale: 1.12,
                folderRecoveryScale: 0.82,
                dampingScale: 0.98,
                speedScale: 0.95,
                worldTetherScale: 1.05,
                anchorScaleByKind: { workspace: 0.85, category: 0.88, folder: 0.82, link: 0.75 },
                dampingScaleByKind: { workspace: 1.02, category: 1.02, folder: 1.01, link: 0.92 }, // Reduced from 1.01
                speedScaleByKind: { workspace: 0.95, category: 0.98, folder: 0.92, link: 1.12 }
                };
                }

                return {

                mode: normalizedMode,

                repulsionScale: 0.88,

                centerPullScale: 1.08,

                springScale: 1.02,

                hierarchyReactionScale: 0.74,

                folderRecoveryScale: 1.12,

                dampingScale: 0.95,

                speedScale: 0.74,

                worldTetherScale: 1.12,

                anchorScaleByKind: { workspace: 1.52, category: 1.22, folder: 1.08, link: 0.96 },

                dampingScaleByKind: { workspace: 0.93, category: 0.95, folder: 0.94, link: 0.92 }, // Reduced from 0.98

                speedScaleByKind: { workspace: 0.5, category: 0.6, folder: 0.42, link: 1.2 } 

                };

                }

    Object.assign(moduleApi, { getMotionProfile });
})(window.EveConstellationMap);
