window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};
    const physicsAura = ns._physicsAura || {};

    const {

        state,

        MOTION_MODE_ORDER,

        text,

        getMotionTuningValue,

        getPolarityStrengthValue,

        getNodePolarityState,

        isNodeStatic,

        setStaticAnchor

    } = shared;
    const { isNodeMain } = physicsAura;



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



                repulsionScale: 1.42,



                centerPullScale: 0.68,



                springScale: 0.82,



                hierarchyReactionScale: 1.24,



                folderRecoveryScale: 0.62,



                dampingScale: 1.12,



                speedScale: 1.34,



                worldTetherScale: 0.82,



                anchorScaleByKind: { workspace: 0.72, category: 0.78, folder: 0.72, link: 0.7 },



                dampingScaleByKind: { workspace: 1.06, category: 1.05, folder: 1.03, link: 1.02 },



                speedScaleByKind: { workspace: 1.2, category: 1.18, folder: 1.12, link: 1.24 }



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

            baseFactor = sourceKind === 'folder' ? 0.06 : 0.04;

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

        if (isMainTarget && !isMainSource) return 0.04; // Main nodes (Cards) are nearly immovable by folders/links

        if (targetDepth < sourceDepth) {

            const gap = sourceDepth - targetDepth;

            return Math.max(0.02, 0.12 / gap); // Hierarchy authority

        }



        // Default pairwise scales

        if (targetKind === 'folder' && sourceKind === 'folder') return 0.4;

        if (targetKind === 'link' || sourceKind === 'link') return 0.5;



        if ((isMainTarget && sourceKind === 'folder') || (targetKind === 'folder' && isMainSource)) {

            return 0.5;

        }



        if (motionProfile?.mode !== 'web') return 1;



        if (targetKind === 'workspace') {

            if (sourceKind === 'link') return 0.02;

            if (sourceKind === 'folder') return 0.05;

            if (sourceKind === 'category') return 0.16;

        }



        if (targetKind === 'category') {

            if (sourceKind === 'link') return 0.04;

            if (sourceKind === 'folder') return 0.12;

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



function stabilizeNodeMotion(node, anchor, motionProfile) {



        if (!node) return;



        const safeAnchor = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)

            ? anchor

            : (state.worldAnchor || { x: 0, y: 0 });



        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {



            node.x = safeAnchor.x;



            node.y = safeAnchor.y;



            node.vx = 0;



            node.vy = 0;



            return;



        }



        if (!Number.isFinite(node.vx)) node.vx = 0;



        if (!Number.isFinite(node.vy)) node.vy = 0;



        const maxSpeed = getMaxNodeSpeed(node, motionProfile);



        const speed = Math.sqrt((node.vx * node.vx) + (node.vy * node.vy));



        if (speed > maxSpeed && speed > 0.001) {



            const scale = maxSpeed / speed;



            node.vx *= scale;



            node.vy *= scale;



        }



        const anchorDx = node.x - safeAnchor.x;



        const anchorDy = node.y - safeAnchor.y;



        const anchorDist = Math.sqrt((anchorDx * anchorDx) + (anchorDy * anchorDy));



        const maxDist = Math.max(240, Number(state.worldRadius || 0) * 1.12);



        if (anchorDist > maxDist && anchorDist > 0.001) {



            const scale = maxDist / anchorDist;



            node.x = safeAnchor.x + (anchorDx * scale);



            node.y = safeAnchor.y + (anchorDy * scale);



            node.vx *= 0.38;



            node.vy *= 0.38;



        }



    }



function applyMotionModePositioning(node, anchor, motionProfile) {



        if (!node || !anchor || motionProfile?.mode !== 'web' || node?.manualAnchor || isNodeStatic(node)) return;



        if (node.kind === 'workspace') {



            node.x += (anchor.x - node.x) * 0.26;



            node.y += (anchor.y - node.y) * 0.26;



            node.vx *= 0.18;



            node.vy *= 0.18;



            return;



        }



        if (node.kind === 'category') {



            node.x += (anchor.x - node.x) * 0.22;



            node.y += (anchor.y - node.y) * 0.22;



            node.vx *= 0.22;



            node.vy *= 0.22;



            return;



        }



        if (node.kind === 'folder') {



            const dx = anchor.x - node.x;

            const dy = anchor.y - node.y;

            const dist = Math.sqrt(dx * dx + dy * dy);



            // SINGULARITY POSITIONING: No 140px deadzone. 

            // Aggressive 0.25 pull for instant core-docking.

            node.x += dx * 0.25;

            node.y += dy * 0.25;



            node.vx *= 0.88;



            node.vy *= 0.88;



            return;



        }



    }



function setWebMotionAnchor(node, position) {



        if (!node) return;



        const nodeId = String(node.id || '');



        if (!nodeId) return;



        const point = position && typeof position === 'object' ? position : node;



        if (node.kind === 'folder') return;



        state.motionAnchors.set(nodeId, {



            type: 'absolute',



            x: Number(point?.x) || 0,



            y: Number(point?.y) || 0



        });



    }



function syncMotionAnchors(forceCapture) {



        const normalizedMode = MOTION_MODE_ORDER.includes(state.motionMode)

            ? state.motionMode

            : 'web';



        if (normalizedMode !== 'web') {



            state.motionAnchors = new Map();



            state.lastMotionMode = normalizedMode;



            return;



        }



        if (!forceCapture && state.lastMotionMode === 'web' && state.motionAnchors.size) {



            return;



        }



        state.motionAnchors = new Map();



        state.nodes.forEach((node) => {



            if (!node) return;



            if (!isNodeMain(node)) return;



            setWebMotionAnchor(node);



        });



        state.lastMotionMode = 'web';



    }



function getMotionTargetAnchor(node, baseAnchor, motionProfile) {



        if (!node || !baseAnchor || motionProfile?.mode !== 'web') return baseAnchor;



        const lockedAnchor = state.motionAnchors.get(String(node.id || ''));



        if (isNodeMain(node)) {



            if (!Number.isFinite(lockedAnchor?.x) || !Number.isFinite(lockedAnchor?.y)) return baseAnchor;



            return {



                x: lockedAnchor.x,



                y: lockedAnchor.y



            };



        }



        return baseAnchor;



    }



function applySoftWorldTether(node, motionProfile) {



        if (isNodeStatic(node) || node?.manualAnchor) return;



        const anchor = state.worldAnchor || { x: 0, y: 0 };



        const radius = Math.max(Number(state.worldRadius) || 0, 120);



        const dx = node.x - anchor.x;



        const dy = node.y - anchor.y;



        const dist = Math.max(0.001, Math.sqrt((dx * dx) + (dy * dy)));



        const startRadius = radius * 1.18;



        if (dist <= startRadius) return;







        const overflow = dist - startRadius;



        const nx = dx / dist;



        const ny = dy / dist;



        const tetherScale = (Number(motionProfile?.worldTetherScale) || 1) * getMotionTuningValue('tether');



        const pull = overflow * (overflow > radius * 0.6 ? 0.00042 : 0.00018) * tetherScale;



        node.vx -= nx * pull;



        node.vy -= ny * pull;



    }



    const moduleApi = ns._physicsMotion = ns._physicsMotion || {};



    Object.assign(moduleApi, {

        getMotionProfile,

        getHierarchyTargetReactionFactor,

        getPairwiseInfluenceScale,

        getDynamicAnchorPull,

        getDynamicVelocityDamping,

        getReleaseVelocityScale,

        getMaxNodeSpeed,

        stabilizeNodeMotion,

        applyMotionModePositioning,

        setWebMotionAnchor,

        syncMotionAnchors,

        getMotionTargetAnchor,

        applySoftWorldTether

    });



})(window.EveConstellationMap);

