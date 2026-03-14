window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};

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

    const render = ns._render || {};

    const { getNodeAnchor } = render;

    function getMotionProfile(nodeCount) {

        const normalizedMode = MOTION_MODE_ORDER.includes(state.motionMode)
            ? state.motionMode
            : 'web';

        if (normalizedMode === 'slow') {

            return {

                mode: normalizedMode,

                repulsionScale: 0.62,

                centerPullScale: 1.34,

                springScale: 1.12,

                hierarchyReactionScale: 0.74,

                folderRecoveryScale: 1.38,

                dampingScale: 0.94,

                speedScale: 0.58,

                worldTetherScale: 1.14,

                anchorScaleByKind: { workspace: 2.2, category: 1.72, folder: 1.46, link: 1 },

                dampingScaleByKind: { workspace: 0.94, category: 0.95, folder: 0.95, link: 1 },

                speedScaleByKind: { workspace: 0.44, category: 0.56, folder: 0.7, link: 0.9 }

            };

        }

        if (normalizedMode === 'web') {

            return {

                mode: normalizedMode,

                repulsionScale: nodeCount > 220 ? 0.54 : 0.48,

                centerPullScale: 2.05,

                springScale: 1.4,

                hierarchyReactionScale: 0.4,

                folderRecoveryScale: 1.96,

                dampingScale: 0.9,

                speedScale: 0.34,

                worldTetherScale: 1.2,

                anchorScaleByKind: { workspace: 5.4, category: 4.1, folder: 1.12, link: 1.08 },

                dampingScaleByKind: { workspace: 0.76, category: 0.82, folder: 0.92, link: 0.98 },

                speedScaleByKind: { workspace: 0.08, category: 0.14, folder: 0.54, link: 0.86 }

            };

        }

        if (normalizedMode === 'free') {

            return {

                mode: normalizedMode,

                repulsionScale: 1.08,

                centerPullScale: 0.95,

                springScale: 1,

                hierarchyReactionScale: 1,

                folderRecoveryScale: 0.92,

                dampingScale: 1.02,

                speedScale: 1.08,

                worldTetherScale: 0.96,

                anchorScaleByKind: { workspace: 1, category: 1, folder: 1, link: 1 },

                dampingScaleByKind: { workspace: 1, category: 1, folder: 1, link: 1 },

                speedScaleByKind: { workspace: 1, category: 1, folder: 1, link: 1 }

            };

        }

        return {

            mode: normalizedMode,

            repulsionScale: 0.78,

            centerPullScale: 1.22,

            springScale: 1.08,

            hierarchyReactionScale: 0.82,

            folderRecoveryScale: 1.18,

            dampingScale: 0.965,

            speedScale: 0.82,

            worldTetherScale: 1.08,

            anchorScaleByKind: { workspace: 1.7, category: 1.38, folder: 1.24, link: 1 },

            dampingScaleByKind: { workspace: 0.95, category: 0.96, folder: 0.95, link: 1 },

            speedScaleByKind: { workspace: 0.64, category: 0.72, folder: 0.8, link: 0.92 }

        };

    }



    function getHierarchyTargetReactionFactor(edge, motionProfile) {

        if (edge?.type !== 'hierarchy') return 1;

        const targetKind = text(edge?.target?.kind, '');

        const sourceKind = text(edge?.source?.kind, '');

        let baseFactor = 1;

        if (targetKind === 'folder') {

            baseFactor = sourceKind === 'link' ? 0.16 : 0.3;

        } else if (targetKind === 'category') {

            baseFactor = sourceKind === 'folder' ? 0.42 : 0.24;

        } else if (targetKind === 'workspace') {

            baseFactor = 0.34;

        }

        return Math.max(0, baseFactor * (motionProfile?.hierarchyReactionScale || 1) * getMotionTuningValue('hierarchy'));

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

        const base = node?.kind === 'folder' ? 0.84 : 0.88;

        const modeScale = Number(profile.dampingScale) || 1;

        const kindScale = Number(profile.dampingScaleByKind?.[String(node?.kind || '')]) || 1;

        return Math.min(0.985, Math.max(0, base * modeScale * kindScale * getMotionTuningValue('damping')));

    }



    function applyFolderRecovery(node, anchor, motionProfile) {

        if (!node || node.kind !== 'folder' || !anchor) return;

        const dx = anchor.x - node.x;

        const dy = anchor.y - node.y;

        const dist = Math.sqrt((dx * dx) + (dy * dy));

        if (!Number.isFinite(dist) || dist <= 110) return;

        const recoveryScale = (Number(motionProfile?.folderRecoveryScale) || 1) * getMotionTuningValue('folderRecovery');

        const recovery = Math.min(0.03, (dist - 110) * 0.00012 * recoveryScale);

        node.vx += dx * recovery;

        node.vy += dy * recovery;

    }



    function getReleaseVelocityScale(node) {

        if (!node) return 0.9;

        if (node.kind === 'folder') return 0.42;

        return 0.9;

    }



    function getMaxNodeSpeed(node, motionProfile) {

        if (!node) return 18;

        let base = 10;

        if (node.kind === 'link') base = 16;

        else if (node.kind === 'folder') base = 9.5;

        else if (node.kind === 'category') base = 8;

        else if (node.kind === 'workspace') base = 7;

        const profile = motionProfile || getMotionProfile(state.nodes.length);

        const modeScale = Number(profile.speedScale) || 1;

        const kindScale = Number(profile.speedScaleByKind?.[String(node.kind || '')]) || 1;

        return Math.max(0.05, base * modeScale * kindScale * getMotionTuningValue('speed'));

    }



    function getPolarityDirection(node) {

        return getNodePolarityState(node).effective === 'attract' ? 1 : -1;

    }



    function getPolarityStrength(node, motionProfile) {

        const polarity = getNodePolarityState(node).effective;

        if (polarity !== 'attract') {

            return getPolarityStrengthValue('repel');

        }

        if (motionProfile?.mode === 'web') {

            return getPolarityStrengthValue('attract') * (node?.kind === 'link' ? 0.82 : 0.74);

        }

        return getPolarityStrengthValue('attract') * (node?.kind === 'link' ? 0.88 : 0.8);

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

            node.x += (anchor.x - node.x) * 0.18;

            node.y += (anchor.y - node.y) * 0.18;

            node.vx *= 0.26;

            node.vy *= 0.26;

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

            if (node.kind !== 'workspace' && node.kind !== 'category') return;

            setWebMotionAnchor(node);

        });

        state.lastMotionMode = 'web';

    }



    function getMotionTargetAnchor(node, baseAnchor, motionProfile) {

        if (!node || !baseAnchor || motionProfile?.mode !== 'web') return baseAnchor;

        const lockedAnchor = state.motionAnchors.get(String(node.id || ''));

        if (node.kind === 'workspace' || node.kind === 'category') {

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



    function tickPhysics() {

        if (!state.nodes.length || !state.canvas) return;

        const nodeCount = state.nodes.length;

        const motionProfile = getMotionProfile(nodeCount);

        syncMotionAnchors(false);

        const repulsion = (nodeCount > 400 ? 900 : nodeCount > 220 ? 1200 : nodeCount > 120 ? 1600 : nodeCount > 70 ? 2200 : 3200)
            * (motionProfile.repulsionScale || 1)
            * getMotionTuningValue('repulsion');

        const centerPull = (nodeCount > 400 ? 0.00038 : nodeCount > 220 ? 0.0005 : nodeCount > 120 ? 0.0007 : 0.0011)
            * getMotionTuningValue('centerPull');

        const springStrength = (nodeCount > 120 ? 0.0024 : 0.0032)
            * (motionProfile.springScale || 1)
            * getMotionTuningValue('spring');

        const polarityCache = state.nodes.map((node) => ({
            direction: getPolarityDirection(node),
            strength: getPolarityStrength(node, motionProfile)
        }));



        for (let index = 0; index < state.nodes.length; index += 1) {

            const node = state.nodes[index];

            const nodePolarity = polarityCache[index];

            const nodeIsStatic = isNodeStatic(node);

            if (state.pointer.mode === 'node' && state.pointer.node && state.pointer.node.id === node.id) {

                node.vx = 0;

                node.vy = 0;

                continue;

            }



            for (let inner = index + 1; inner < state.nodes.length; inner += 1) {

                const other = state.nodes[inner];

                const otherPolarity = polarityCache[inner];

                const otherIsStatic = isNodeStatic(other);

                const dx = other.x - node.x;

                const dy = other.y - node.y;

                const distSq = Math.max(36, (dx * dx) + (dy * dy));

                const force = repulsion / distSq;

                const dist = Math.sqrt(distSq);

                const nx = dx / dist;

                const ny = dy / dist;

                if (!nodeIsStatic) {

                    node.vx += nx * force * otherPolarity.direction * otherPolarity.strength;

                    node.vy += ny * force * otherPolarity.direction * otherPolarity.strength;

                }

                if (!otherIsStatic) {

                    other.vx -= nx * force * nodePolarity.direction * nodePolarity.strength;

                    other.vy -= ny * force * nodePolarity.direction * nodePolarity.strength;

                }

            }

        }



        state.edges.forEach((edge) => {

            const dx = edge.target.x - edge.source.x;

            const dy = edge.target.y - edge.source.y;

            const dist = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));

            const desired = edge.type === 'tag' ? 120 : 78;

            const stretch = dist - desired;

            const nx = dx / dist;

            const ny = dy / dist;

            const force = stretch * springStrength;

            const targetReactionFactor = getHierarchyTargetReactionFactor(edge, motionProfile);

            const sourceStatic = isNodeStatic(edge.source);

            const targetStatic = isNodeStatic(edge.target);

            if (!(state.pointer.mode === 'node' && state.pointer.node?.id === edge.source.id) && !sourceStatic) {

                edge.source.vx += nx * force;

                edge.source.vy += ny * force;

            }

            if (!(state.pointer.mode === 'node' && state.pointer.node?.id === edge.target.id) && !targetStatic) {

                edge.target.vx -= nx * force * targetReactionFactor;

                edge.target.vy -= ny * force * targetReactionFactor;

            }

        });



        state.nodes.forEach((node) => {

            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;

            if (isNodeStatic(node)) {

                if (!node.staticAnchor) {

                    setStaticAnchor(node);

                }

                node.x = Number(node.staticAnchor?.x) || node.x;

                node.y = Number(node.staticAnchor?.y) || node.y;

                node.vx = 0;

                node.vy = 0;

                return;

            }

            const anchor = getMotionTargetAnchor(node, getNodeAnchor(node), motionProfile);

            const anchorPull = getDynamicAnchorPull(node, centerPull, motionProfile);

            node.vx += (anchor.x - node.x) * anchorPull;

            node.vy += (anchor.y - node.y) * anchorPull;

            applyFolderRecovery(node, anchor, motionProfile);

            const velocityDamping = getDynamicVelocityDamping(node, motionProfile);

            node.vx *= velocityDamping;

            node.vy *= velocityDamping;

            stabilizeNodeMotion(node, anchor, motionProfile);

            node.x += node.vx;

            node.y += node.vy;

            applyMotionModePositioning(node, anchor, motionProfile);

            applySoftWorldTether(node, motionProfile);

            stabilizeNodeMotion(node, anchor, motionProfile);

        });

    }




    const physics = ns._physics = ns._physics || {};

    Object.assign(physics, {

        syncMotionAnchors,

        setWebMotionAnchor,

        getReleaseVelocityScale,

        tickPhysics

    });

})(window.EveConstellationMap);
