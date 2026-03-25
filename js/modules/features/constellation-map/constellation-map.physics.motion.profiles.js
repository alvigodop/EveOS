window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};

    const {

        state,

        MOTION_MODE_ORDER,

        text,

        getMotionTuningValue

    } = shared;

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



                dampingScaleByKind: { workspace: 0.9, category: 0.91, folder: 0.93, link: 0.95 },



                speedScaleByKind: { workspace: 0.28, category: 0.36, folder: 0.46, link: 0.6 }



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



                dampingScaleByKind: { workspace: 0.62, category: 0.68, folder: 0.58, link: 0.52 },



                speedScaleByKind: { workspace: 0.03, category: 0.06, folder: 0.22, link: 0.32 }



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
                dampingScaleByKind: { workspace: 1.02, category: 1.02, folder: 1.01, link: 1.01 },
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



            dampingScaleByKind: { workspace: 0.93, category: 0.95, folder: 0.94, link: 0.98 },



            speedScaleByKind: { workspace: 0.5, category: 0.6, folder: 0.42, link: 0.88 }



        };



    }


function getHierarchyTargetReactionFactor(edge, motionProfile) {



        if (edge?.type !== 'hierarchy') return 1;



        const targetKind = text(edge?.target?.kind, '');



        const sourceKind = text(edge?.source?.kind, '');



        let baseFactor = 1;



        if (targetKind === 'folder') {

            baseFactor = sourceKind === 'link' ? 0.08 : (sourceKind === 'folder' ? 0.12 : 0.48);

        } else if (targetKind === 'link') {

            baseFactor = 0.28;

        } else if (targetKind === 'category') {

            baseFactor = sourceKind === 'folder' ? 0.06 : 0.01;

        } else if (targetKind === 'workspace') {

            baseFactor = 0.02;

        }



        return Math.max(0, baseFactor * (motionProfile?.hierarchyReactionScale || 1) * getMotionTuningValue('hierarchy'));



    }


function getPairwiseInfluenceScale(targetNode, sourceNode, motionProfile) {



        const targetKind = text(targetNode?.kind, '');

        const sourceKind = text(sourceNode?.kind, '');



        const targetDepth = (targetNode?.data && typeof targetNode.data.depth === 'number') ? targetNode.data.depth : (targetKind === 'link' ? 3 : 0);

        const sourceDepth = (sourceNode?.data && typeof sourceNode.data.depth === 'number') ? sourceNode.data.depth : (sourceKind === 'link' ? 3 : 0);



        const isMainTarget = targetKind === 'workspace' || targetKind === 'category';

        const isMainSource = sourceKind === 'workspace' || sourceKind === 'category';



        // ASYMMETRIC AUTHORITY: Higher levels are harder to push

        if (isMainTarget && !isMainSource) {
            // Bookmarks get an even heavier discount — they massively outnumber folders
            if (sourceKind === 'link') return 0.005;
            return 0.02; // Folders still get a small influence
        }

        if (targetDepth < sourceDepth) {

            const gap = sourceDepth - targetDepth;
            const isSourceLink = sourceKind === 'link';
            return Math.max(isSourceLink ? 0.005 : 0.02, (isSourceLink ? 0.04 : 0.12) / gap); // Hierarchy authority

        }



        // Default pairwise scales

        if (targetKind === 'folder' && sourceKind === 'folder') return 0.4;

        if (targetKind === 'link' || sourceKind === 'link') return 0.5;



        if ((isMainTarget && sourceKind === 'folder') || (targetKind === 'folder' && isMainSource)) {

            return 0.5;

        }



        if (motionProfile?.mode !== 'web') return 1;



        if (targetKind === 'workspace') {

            if (sourceKind === 'link') return 0.005;

            if (sourceKind === 'folder') return 0.03;

            if (sourceKind === 'category') return 0.16;

        }



        if (targetKind === 'category') {

            if (sourceKind === 'link') return 0.008;

            if (sourceKind === 'folder') return 0.06;

            if (sourceKind === 'workspace') return 0.24;

        }



        if (targetKind === 'folder') {

            if (sourceKind === 'link') return 0.22;

            if (sourceKind === 'category') return 0.48;

        }



        return 1;

    }


function getDynamicAnchorPull(node, baseCenterPull, motionProfile) {



        if (node?.manualAnchor) {



            return Math.max(0.004, Number(node.manualAnchor.pullStrength) || 0.014);



        }



        const profile = motionProfile || getMotionProfile(state.nodes.length);



        const modeScaledBase = baseCenterPull * (profile.centerPullScale || 1);



        if (node?.kind === 'folder') {



            const kindScale = Number(profile.anchorScaleByKind?.folder) || 1;



            if (profile.mode === 'web') {



                return modeScaledBase * kindScale;



            }



            return Math.max(0.0036, modeScaledBase * 5.5 * kindScale);



        }



        const kindScale = Number(profile.anchorScaleByKind?.[String(node?.kind || '')]) || 1;



        return modeScaledBase * kindScale;



    }


function getDynamicVelocityDamping(node, motionProfile) {



        if (node?.manualAnchor) {



            return Math.min(0.97, Math.max(0.82, Number(node.manualAnchor.damping) || 0.9));



        }



        const profile = motionProfile || getMotionProfile(state.nodes.length);



        const base = node?.kind === 'folder' ? 0.76 : (node?.kind === 'link' ? 0.88 : 0.86);



        const profileScale = Number(profile.dampingScale) || 1;



        const kindScale = Number(profile.dampingScaleByKind?.[String(node.kind || '')]) || 1;



        return Math.min(0.99, Math.max(0.1, base * profileScale * kindScale * getMotionTuningValue('damping')));



    }


function getReleaseVelocityScale(node) {



        if (!node) return 0.9;



        if (node.kind === 'folder') return 0.42;



        return 0.9;



    }


function getMaxNodeSpeed(node, motionProfile) {



        if (!node) return 18;



        let base = 10;



        if (node.kind === 'link') base = 6;



        else if (node.kind === 'folder') base = 3.5;



        else if (node.kind === 'category') base = 8;



        else if (node.kind === 'workspace') base = 7;



        const profile = motionProfile || getMotionProfile(state.nodes.length);



        const modeScale = Number(profile.speedScale) || 1;



        const kindScale = Number(profile.speedScaleByKind?.[String(node.kind || '')]) || 1;



        return Math.max(0.05, base * modeScale * kindScale * getMotionTuningValue('speed'));



    }

    const moduleApi = ns._physicsMotionProfiles = ns._physicsMotionProfiles || {};

    Object.assign(moduleApi, {

        getMotionProfile,

        getHierarchyTargetReactionFactor,

        getPairwiseInfluenceScale,

        getDynamicAnchorPull,

        getDynamicVelocityDamping,

        getReleaseVelocityScale,

        getMaxNodeSpeed

    });

})(window.EveConstellationMap);
