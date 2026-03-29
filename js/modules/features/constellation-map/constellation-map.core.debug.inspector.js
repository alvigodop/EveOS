window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const render = ns._render || {};

    const physics = ns._physics || {};

    const events = ns._events || {};



    const {

        state,

        MAP_PADDING,

        MOTION_TUNING_FIELDS,

        getViewportSize,

        getNodePolarityState,

        getPolarityStrengthValue,

        getNodeCoverCandidates,

        getNodeCoverRotationInterval,

        getNodeCoverUrl,

        isNodeStatic,

        getStaticStateForNode,

        getPolaritySummary,

        getMotionTuningValue

    } = shared;

    const { requestDraw, renderInspector } = render;

    const { getMotionProfile } = physics;

    const { setSelectedNode } = events;



    function __debugGetInspectorCoverState() {



        const targetNode = state.selected || state.hovered || null;



        return {



            targetNode: targetNode ? {



                id: targetNode.id,



                kind: targetNode.kind,



                label: targetNode.label



            } : null,



            now: Date.now(),



            infoHovered: !!state.infoHovered,



            infoHoverStartedAt: state.infoHoverStartedAt || 0,



            interval: getNodeCoverRotationInterval(targetNode),



            candidates: getNodeCoverCandidates(targetNode),



            current: getNodeCoverUrl(targetNode),



            session: state.coverPreviewSession ? {



                key: state.coverPreviewSession.key,



                startedAt: state.coverPreviewSession.startedAt,



                elapsedMs: state.coverPreviewSession.elapsedMs,



                covers: state.coverPreviewSession.covers.slice()



            } : null



        };



    }



    function __debugSelectNode(nodeId) {



        const node = state.nodeIndex.get(String(nodeId || '')) || null;



        if (!node) return false;



        setSelectedNode(node);



        requestDraw();



        return true;



    }



    function __debugShiftInspectorHover(deltaMs) {



        const amount = Number(deltaMs) || 0;



        if (!state.infoHoverStartedAt) {



            state.infoHoverStartedAt = Date.now();



        }



        state.infoHoverStartedAt -= amount;



        if (state.coverPreviewSession?.startedAt) {



            state.coverPreviewSession.startedAt -= amount;



        } else if (state.coverPreviewSession) {



            state.coverPreviewSession.elapsedMs = Math.max(0, Number(state.coverPreviewSession.elapsedMs || 0) + amount);



        }



        renderInspector();



        return state.infoHoverStartedAt;



    };

    const coreDebugInspector = ns._coreDebugInspector = ns._coreDebugInspector || {};

    Object.assign(coreDebugInspector, {
        __debugGetInspectorCoverState,
        __debugSelectNode,
        __debugShiftInspectorHover
    });

})(window.EveConstellationMap);
