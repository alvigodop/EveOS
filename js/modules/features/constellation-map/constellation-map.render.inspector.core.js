window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const {

        state,

        KIND_ORDER,

        LABEL_CURSOR_RADIUS,

        LABEL_FOCUS_LIMIT,

        getScopeText,

        getLabelModeText,

        getMotionModeText,

        MOTION_TUNING_FIELDS,

        getKindDisplayName,

        getNodePolarityState,

        getPolaritySummary,

        getPolarityStrengthValue,

        getPolarityStrengthText,

        getMotionTuningText,

        getNodeCoverUrl,

        scheduleInspectorCoverRotation,

        getStaticStateForNode,

        isStaticBranchRoot,

        getStaticSummary,

        escapeHtml,

        text

    } = shared;



    const renderToolbarHelpers = ns._renderToolbarHelpers || {};

    const { renderToolbarState } = renderToolbarHelpers;


function getPrimaryAction(node) {



        if (!node) return null;



        if (node.data?.detached && node.data?.detachedRoot) {



            return { label: 'Reattach Chain', action: 'arm-rewire' };



        }



        if (node.kind === 'link') {



            return { label: 'Open Bookmark', action: 'open-link' };



        }



        if (node.kind === 'workspace') {



            return { label: 'Open Tab', action: 'open-workspace' };



        }



        if (node.kind === 'category') {



            return { label: 'Open Card', action: 'open-category' };



        }



        if (node.kind === 'folder') {



            return { label: 'Open Folder', action: 'open-folder' };



        }



        return { label: 'Center Node', action: 'center-node' };



    }



function applyInspectorShellStyle(isCollapsed) {



        if (!state.infoEl) return;



        if (isCollapsed) {



            state.infoEl.style.maxWidth = 'none';

            state.infoEl.style.minWidth = '0';

            state.infoEl.style.width = '78px';

            state.infoEl.style.height = '78px';

            state.infoEl.style.padding = '0';

            state.infoEl.style.borderRadius = '999px';

            state.infoEl.style.display = 'flex';

            state.infoEl.style.alignItems = 'center';

            state.infoEl.style.justifyContent = 'center';



            return;



        }



        state.infoEl.style.maxWidth = 'min(360px,calc(100vw - 200px))';

        state.infoEl.style.minWidth = '260px';

        state.infoEl.style.width = 'auto';

        state.infoEl.style.height = 'auto';

        state.infoEl.style.padding = '14px 16px';

        state.infoEl.style.borderRadius = '16px';

        state.infoEl.style.display = 'block';

        state.infoEl.style.alignItems = '';

        state.infoEl.style.justifyContent = '';



    }



    function getSecondaryActions(node) {

        if (!node) return [];

        const actions = [];
        const isRewireSource = text(state.rewire?.sourceNodeId, '') === text(node?.id, '');
        const canRewire = typeof ns._canConstellationRewireNode === 'function' && ns._canConstellationRewireNode(node);
        const canDetach = !!ns._coreRewire?.canDetachNodeToRoot?.(node);
        const canDetachToParking = !!ns._coreRewire?.canDetachNodeToParking?.(node);
        const hasArmedSource = !!ns._coreRewire?.hasArmedSource?.();

        if (node.data?.detached && node.data?.detachedRoot) {
            return actions;

        }

        if (node.kind === 'link') {

            if (text(node?.data?.folderId, '')) actions.push({ label: 'Open Folder', action: 'open-folder' });

            if (text(node?.data?.categoryName, '')) actions.push({ label: 'Open Card', action: 'open-category' });

            if (canRewire) actions.push({ label: isRewireSource ? 'Cancel Move' : 'Chain Move', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire' });

            if (canDetach) actions.push({ label: 'Move to Card Root', action: 'detach-to-root' });

            if (canDetachToParking) actions.push({ label: 'Detach to Parking', action: 'detach-to-parking' });

            return actions;

        }

        if (node.kind === 'folder') {

            if (hasArmedSource && !isRewireSource) actions.push({ label: 'Attach Here', action: 'attach-here' });

            actions.push({ label: hasArmedSource ? 'New Folder + Attach' : 'New Folder', action: 'create-folder' });

            if (canRewire) actions.push({ label: isRewireSource ? 'Cancel Move' : 'Chain Move', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire' });

            if (canDetach) actions.push({ label: 'Move to Card Root', action: 'detach-to-root' });

            if (canDetachToParking) actions.push({ label: 'Detach to Parking', action: 'detach-to-parking' });

            return actions;

        }

        if (node.kind === 'category') {

            actions.push({ label: 'Card Settings', action: 'open-category-settings' });

            if (hasArmedSource) actions.push({ label: 'Attach Here', action: 'attach-here' });

            actions.push({ label: hasArmedSource ? 'New Folder + Attach' : 'New Folder', action: 'create-folder' });

            return actions;

        }

        if (node.kind === 'workspace') {

            actions.push({ label: 'New Card + Attach', action: 'create-card-attach' });

            return actions;

        }

        return actions;

    }



    const renderInspectorCore = ns._renderInspectorCore = ns._renderInspectorCore || {};

    Object.assign(renderInspectorCore, {
        getPrimaryAction,
        applyInspectorShellStyle,
        getSecondaryActions
    });

})(window.EveConstellationMap);
