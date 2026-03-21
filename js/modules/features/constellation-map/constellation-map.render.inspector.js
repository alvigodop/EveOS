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

            if (canRewire) actions.push({ label: isRewireSource ? 'Cancel Reattach' : 'Reattach Chain', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire' });

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

        if (node.data?.detached && node.data?.detachedRoot) {

            if (canRewire) actions.push({ label: isRewireSource ? 'Cancel Reattach' : 'Reattach Chain', action: isRewireSource ? 'cancel-rewire' : 'arm-rewire' });

            return actions;

        }

        return actions;

    }


function getCompactInspectorMarkup(headerLabel, headerKindLabel) {



        const shortLabel = text(headerLabel, 'Info').slice(0, 14);



        return [



            '<button type="button" data-map-info-toggle="1" title="Expand inspector" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:78px;height:78px;border:1px solid rgba(255,255,255,0.14);background:radial-gradient(circle at 30% 25%, rgba(16,32,54,0.94), rgba(3,10,20,0.94));color:#fff;border-radius:999px;cursor:pointer;box-shadow:0 16px 32px rgba(0,0,0,0.28);padding:10px;gap:4px;">',



            '<span style="font-size:0.6rem;opacity:0.72;letter-spacing:0.08em;text-transform:uppercase;line-height:1;">' + escapeHtml(headerKindLabel) + '</span>',



            '<span style="font-size:0.7rem;font-weight:700;line-height:1.15;max-width:100%;white-space:normal;word-break:break-word;">' + escapeHtml(shortLabel) + '</span>',



            '</button>'



        ].join('');



    }



function renderInspector() {



        if (!state.infoEl) return;



        const targetNode = state.selected || state.hovered;



        const headerLabel = targetNode ? targetNode.label : 'Map Inspector';



        const headerKindLabel = targetNode ? getKindDisplayName(targetNode.kind) : 'Overview';



        const staticState = getStaticStateForNode(targetNode);



        const polarityState = getNodePolarityState(targetNode);



        const coverUrl = getNodeCoverUrl(targetNode);



        const toggleLabel = state.infoCollapsed ? 'Expand' : 'Collapse';



        applyInspectorShellStyle(state.infoCollapsed);



        const header = [



            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">',



            '<div style="min-width:0;flex:1;">',



            '<div style="font-size:0.96rem;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(headerLabel) + '</div>',



            '<div style="font-size:0.72rem;opacity:0.72;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">' + escapeHtml(headerKindLabel) + '</div>',



            '</div>',



            '<button type="button" data-map-info-toggle="1" style="border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#fff;border-radius:9px;padding:6px 10px;cursor:pointer;white-space:nowrap;">' + escapeHtml(toggleLabel) + '</button>',



            '</div>'



        ].join('');



        const coverPanel = coverUrl



            ? '<div data-map-info-cover style="position:absolute;right:0;bottom:calc(100% + 14px);width:132px;height:182px;border:1px solid rgba(255,255,255,0.18);background:rgba(7,14,24,0.96);border-radius:18px;overflow:hidden;box-shadow:0 18px 38px rgba(0,0,0,0.34);opacity:0;transform:translateY(8px) scale(0.985);transition:opacity 140ms ease, transform 140ms ease;pointer-events:none;">'



                + '<img src="' + escapeHtml(coverUrl) + '" alt="" style="display:block;width:100%;height:100%;object-fit:cover;">'



                + '</div>'



            : '';



        if (!targetNode) {



            state.infoEl.innerHTML = [



                coverPanel,



                state.infoCollapsed ? getCompactInspectorMarkup('Map', 'Overview') : header,



                state.infoCollapsed ? '' : '<div style="font-size:0.82rem;opacity:0.78;line-height:1.45;margin-top:10px;">Select a node to inspect it and use map actions.</div>'



            ].join('');



            updateInspectorCoverState();



            scheduleInspectorCoverRotation();



            renderToolbarState();



            return;



        }



        const primaryAction = getPrimaryAction(targetNode);

        const secondaryActions = getSecondaryActions(targetNode);
        const rewireSummary = typeof ns._getConstellationRewireSummary === 'function'
            ? text(ns._getConstellationRewireSummary(), '')
            : '';


        const actionRow = primaryAction



            ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'



                + '<button type="button" data-map-action="primary" style="border:1px solid rgba(0,212,255,0.32);background:rgba(0,212,255,0.12);color:#eafcff;border-radius:10px;padding:8px 12px;cursor:pointer;">' + escapeHtml(primaryAction.label) + '</button>'



                + '<button type="button" data-map-action="center" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Center</button>'



                + '</div>'



            : '';



        const secondaryRow = secondaryActions.length



            ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'



                + secondaryActions.map((entry) => '<button type="button" data-map-action="' + escapeHtml(entry.action) + '" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">' + escapeHtml(entry.label) + '</button>').join('')



                + '</div>'



            : '';



        state.infoEl.innerHTML = [



            coverPanel,



            state.infoCollapsed ? getCompactInspectorMarkup(headerLabel, headerKindLabel) : header,



            state.infoCollapsed



                ? ''



                : [



                    '<div style="font-size:0.74rem;opacity:0.68;margin-top:8px;">' + escapeHtml(getScopeText(state.scope)) + '</div>',



                    staticState.isStatic

                        ? '<div style="font-size:0.72rem;color:#ffd65a;opacity:0.92;margin-top:7px;">Static ' + escapeHtml(staticState.source === 'kind' ? ('Type Lock | ' + headerKindLabel) : (staticState.source === 'branch' ? 'Chain Lock' : 'Node Lock')) + '</div>'

                        : '',



                    '<div style="font-size:0.72rem;color:' + escapeHtml(polarityState.effective === 'attract' ? '#7affc4' : '#ffc37d') + ';opacity:0.92;margin-top:7px;">Flow ' + escapeHtml(polarityState.effective === 'attract' ? 'Pull' : 'Push') + ' | ' + escapeHtml(polarityState.source === 'node' ? 'Node Override' : (polarityState.source === 'kind' ? 'Type Rule' : 'Default')) + '</div>',

                    rewireSummary
                        ? '<div style="font-size:0.72rem;color:#9edbff;opacity:0.94;margin-top:7px;">Chain Surgery | ' + escapeHtml(rewireSummary) + '</div>'
                        : '',

                    '<div style="font-size:0.82rem;opacity:0.82;line-height:1.45;margin-top:10px;">' + escapeHtml(targetNode.meta || 'No details') + '</div>',


                    actionRow,



                    secondaryRow



                ].join('')



        ].join('');



        updateInspectorCoverState();



        scheduleInspectorCoverRotation();



        renderToolbarState();



    }



function updateInspectorCoverState() {



        if (!state.infoEl) return;



        const cover = state.infoEl.querySelector('[data-map-info-cover]');



        if (!cover) return;



        if (state.infoHovered) {



            cover.style.opacity = '1';



            cover.style.transform = 'translateY(0) scale(1)';



        } else {



            cover.style.opacity = '0';



            cover.style.transform = 'translateY(8px) scale(0.985)';



        }



    }



    function updateCursor() {

        if (!state.canvas) return;

        if (state.pointer.mode === 'pan' || state.pointer.mode === 'node' || state.pointer.mode === 'rewire') {

            state.canvas.style.cursor = 'grabbing';

            return;

        }

        if (state.rewire?.enabled) {
            const hoveredIsRewirable = typeof ns._canConstellationRewireNode === 'function' && ns._canConstellationRewireNode(state.hovered);
            if (hoveredIsRewirable) {
                state.canvas.style.cursor = 'alias';
                return;
            }
            if (text(state.rewire?.targetNodeId, '')) {
                state.canvas.style.cursor = 'copy';
                return;
            }
            state.canvas.style.cursor = state.hovered ? 'pointer' : 'crosshair';
            return;
        }

        state.canvas.style.cursor = state.hovered ? 'pointer' : 'grab';

    }


    const renderInspectorHelpers = ns._renderInspectorHelpers = ns._renderInspectorHelpers || {};

    Object.assign(renderInspectorHelpers, {

        getPrimaryAction,

        applyInspectorShellStyle,

        getSecondaryActions,

        getCompactInspectorMarkup,

        renderInspector,

        updateInspectorCoverState,

        updateCursor

    });



})(window.EveConstellationMap);

