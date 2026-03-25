window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const physicsAura = ns._physicsAura || {};
    const physicsMotionProfiles = ns._physicsMotionProfiles || {};

    const {

        state,

        MOTION_MODE_ORDER,

        getMotionTuningValue,

        isNodeStatic,

        setStaticAnchor

    } = shared;
    const { isNodeMain } = physicsAura;
    const { getMotionProfile, getMaxNodeSpeed } = physicsMotionProfiles;

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



        const speedSq = (node.vx * node.vx) + (node.vy * node.vy);

        const speed = Math.sqrt(speedSq);



        // 1. DYNAMIC SPEED LIMITING: Smoother clamping
        if (speed > maxSpeed && speed > 0.001) {

            const scale = maxSpeed / speed;

            node.vx *= scale;

            node.vy *= scale;

        }

        // 2. LOW-ENERGY SETTLE: Aggressive damping for near-stationary nodes
        // Prevents endless micro-oscillations (jitter)
        const settleThreshold = 0.02;
        if (speed < settleThreshold && speed > 0) {
            const settleFactor = Math.max(0, (speed / settleThreshold));
            node.vx *= settleFactor;
            node.vy *= settleFactor;
            
            // Absolute Zeroing (Noise floor)
            if (speed < 0.001) {
                node.vx = 0;
                node.vy = 0;
            }
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

    const moduleApi = ns._physicsMotionAnchors = ns._physicsMotionAnchors || {};

    Object.assign(moduleApi, {

        stabilizeNodeMotion,

        applyMotionModePositioning,

        setWebMotionAnchor,

        syncMotionAnchors,

        getMotionTargetAnchor,

        applySoftWorldTether

    });

})(window.EveConstellationMap);
