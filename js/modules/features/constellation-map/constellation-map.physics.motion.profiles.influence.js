window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { text, getMotionTuningValue } = shared;
    const moduleApi = ns._physicsMotionProfilesInfluence = ns._physicsMotionProfilesInfluence || {};

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

    Object.assign(moduleApi, {
        getHierarchyTargetReactionFactor,
        getPairwiseInfluenceScale
    });
})(window.EveConstellationMap);
