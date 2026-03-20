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

    const moduleApi = ns._physicsPolarity = ns._physicsPolarity || {};

    Object.assign(moduleApi, {
        getPolarityDirection,
        getPolarityStrength
    });

})(window.EveConstellationMap);
