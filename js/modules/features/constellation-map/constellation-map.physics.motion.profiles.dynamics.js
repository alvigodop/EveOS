window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, getMotionTuningValue } = shared;
    const base = ns._physicsMotionProfilesBase || {};
    const { getMotionProfile } = base;
    const moduleApi = ns._physicsMotionProfilesDynamics = ns._physicsMotionProfilesDynamics || {};

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



        const base = node?.kind === 'folder' ? 0.76 : (node?.kind === 'link' ? 0.82 : 0.86); // Reduced from 0.88



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

        if (node.kind === 'link') base = 12; // Doubled from 6

        else if (node.kind === 'folder') base = 3.5;

        else if (node.kind === 'category') base = 8;

        else if (node.kind === 'workspace') base = 7;



        const profile = motionProfile || getMotionProfile(state.nodes.length);



        const modeScale = Number(profile.speedScale) || 1;



        const kindScale = Number(profile.speedScaleByKind?.[String(node.kind || '')]) || 1;



        return Math.max(0.05, base * modeScale * kindScale * getMotionTuningValue('speed'));



    }

    Object.assign(moduleApi, {
        getDynamicAnchorPull,
        getDynamicVelocityDamping,
        getReleaseVelocityScale,
        getMaxNodeSpeed
    });
})(window.EveConstellationMap);
