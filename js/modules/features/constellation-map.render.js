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

    function getManualAnchorTarget(anchor) {

        if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {

            return { x: 0, y: 0 };

        }

        const driftRadius = Math.max(0, Number(anchor.driftRadius) || 0);

        if (!driftRadius) {

            return { x: anchor.x, y: anchor.y };

        }

        const speed = Math.max(0.0001, Number(anchor.speed) || 0.0004);

        const phase = Number(anchor.phase) || 0;

        const now = Date.now();

        return {

            x: anchor.x + (Math.cos((now * speed) + phase) * driftRadius),

            y: anchor.y + (Math.sin((now * speed * 0.87) + (phase * 1.19)) * driftRadius * 0.78)

        };

    }

    function getPrimaryAction(node) {

        if (!node) return null;

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

    function getKindLockButtonLabel(kind, locked) {

        const label = getKindDisplayName(kind);

        return (locked ? 'Release ' : 'Freeze ') + label;

    }

    function getControlsToggleText() {

        return state.controlsExpanded ? 'Hide Controls' : 'Controls';

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


    function renderToolbarState() {
        if (!state.container) return;

        const fxButton = state.container.querySelector('[data-map-toolbar="fx"]');
        const controlsButton = state.container.querySelector('[data-map-toolbar="controls"]');
        const controlsPanel = state.container.querySelector('[data-map-controls-panel]');
        const fxPanel = state.container.querySelector('[data-map-fx-panel]');

        if (fxButton) fxButton.classList.toggle('active', !!state.fxExpanded);
        if (fxPanel) fxPanel.classList.toggle('visible', !!state.fxExpanded);
        
        if (controlsButton) controlsButton.classList.toggle('active', !!state.controlsExpanded);
        if (controlsPanel) controlsPanel.style.display = state.controlsExpanded ? 'flex' : 'none';

        // Update FX Engine buttons
        const engineBtns = state.container.querySelectorAll('[data-fx-engine]');
        engineBtns.forEach(btn => {
            const engineId = btn.dataset.fxEngine;
            btn.classList.toggle('active', engineId === (state.activeWebGlFx || 'none'));
        });

        // Update FX Toggles
        const toggleChips = state.container.querySelectorAll('[data-fx-toggle]');
        toggleChips.forEach(chip => {
            const type = chip.dataset.fxToggle;
            let active = false;
            let label = '';
            if (type === 'grid') { active = state.fxGridEnabled; label = 'Grid'; }
            if (type === 'scanline') { active = state.fxScanlineEnabled; label = 'Scanline'; }
            if (type === 'tech') { active = state.fxTechEnabled; label = 'Tech'; }
            if (type === 'circuit') { active = state.fxCircuitEnabled; label = 'Circuit'; }
            if (type === 'neuralhud') { active = state.fxNeuralHudEnabled; label = 'Neural HUD'; }
            chip.classList.toggle('active', !!active);
            chip.textContent = `${label}: ${active ? 'ON' : 'OFF'}`;
        });

        const nodeButton = state.container.querySelector('[data-map-toolbar="static-node"]');
        const chainButton = state.container.querySelector('[data-map-toolbar="static-chain"]');
        const kindButton = state.container.querySelector('[data-map-toolbar="static-kind"]');
        const labelsButton = state.container.querySelector('[data-map-toolbar="labels"]');
        if (labelsButton) labelsButton.textContent = getLabelModeText();

        const motionButton = state.container.querySelector('[data-map-toolbar="motion"]');
        if (motionButton) motionButton.textContent = getMotionModeText();

        const clearButton = state.container.querySelector('[data-map-toolbar="static-clear"]');
        const stabilityButton = state.container.querySelector('[data-map-toolbar="stability"]');
        const summaryEl = state.container.querySelector('[data-map-static-summary]');
        const polarityNodeButton = state.container.querySelector('[data-map-toolbar="polarity-node"]');
        const polarityKindButton = state.container.querySelector('[data-map-toolbar="polarity-kind"]');
        const polarityClearButton = state.container.querySelector('[data-map-toolbar="polarity-clear"]');
        const polaritySummaryEl = state.container.querySelector('[data-map-polarity-summary]');

        const repelStrengthInput = state.container.querySelector('[data-map-polarity-strength="repel"]');
        const attractStrengthInput = state.container.querySelector('[data-map-polarity-strength="attract"]');
        const repelStrengthNumber = state.container.querySelector('[data-map-polarity-strength-number="repel"]');
        const attractStrengthNumber = state.container.querySelector('[data-map-polarity-strength-number="attract"]');
        const repelStrengthValue = state.container.querySelector('[data-map-polarity-strength-value="repel"]');
        const attractStrengthValue = state.container.querySelector('[data-map-polarity-strength-value="attract"]');

        const motionTuningEntries = MOTION_TUNING_FIELDS.map((field) => ({
            field,
            range: state.container.querySelector('[data-map-motion-tuning="' + field.key + '"]'),
            number: state.container.querySelector('[data-map-motion-tuning-number="' + field.key + '"]'),
            value: state.container.querySelector('[data-map-motion-tuning-value="' + field.key + '"]')
        }));

        const directKindButtons = KIND_ORDER.map((kind) => ({
            kind,
            button: state.container.querySelector('[data-map-static-kind="' + kind + '"]')
        }));

        const fxGridButton = state.container.querySelector('[data-fx-toggle="grid"]');
        const fxScanlineButton = state.container.querySelector('[data-fx-toggle="scanline"]');

        if (!nodeButton || !chainButton || !kindButton || !motionButton || !clearButton || !controlsButton || !controlsPanel || !stabilityButton || !summaryEl || !polarityNodeButton || !polarityKindButton || !polarityClearButton || !polaritySummaryEl || !repelStrengthInput || !attractStrengthInput || !repelStrengthNumber || !attractStrengthNumber || !repelStrengthValue || !attractStrengthValue || motionTuningEntries.some((entry) => !entry.range || !entry.number || !entry.value) || directKindButtons.some((entry) => !entry.button)) return;

        const targetNode = state.selected || state.hovered || null;

        const staticState = getStaticStateForNode(targetNode);

        const polarityState = getNodePolarityState(targetNode);

        const branchLocked = isStaticBranchRoot(targetNode);

        const kindLabel = targetNode ? getKindDisplayName(targetNode.kind) : 'Type';

        const hasTarget = !!targetNode;

        nodeButton.textContent = staticState.nodeLocked ? 'Release Node' : 'Static Node';

        chainButton.textContent = branchLocked ? 'Release Chain' : 'Static Chain';

        kindButton.textContent = hasTarget

            ? (staticState.kindLocked ? ('Release ' + kindLabel) : ('Static ' + kindLabel))

            : 'Static Type';

        motionButton.textContent = getMotionModeText();

        controlsButton.textContent = getControlsToggleText();

        controlsPanel.style.display = state.controlsExpanded ? 'flex' : 'none';

        controlsButton.style.borderColor = state.controlsExpanded ? 'rgba(145,220,255,0.32)' : 'rgba(255,255,255,0.18)';

        controlsButton.style.background = state.controlsExpanded ? 'rgba(145,220,255,0.12)' : 'rgba(255,255,255,0.07)';



        if (fxPanel && fxButton) {

            fxButton.textContent = state.fxExpanded ? 'Hide FX' : 'FX Settings';

            fxPanel.style.display = state.fxExpanded ? 'flex' : 'none';

            fxButton.style.borderColor = state.fxExpanded ? 'rgba(0,255,255,0.32)' : 'rgba(0,255,255,0.26)';

            fxButton.style.background = state.fxExpanded ? 'rgba(0,255,255,0.22)' : 'rgba(0,255,255,0.11)';

        }



        if (fxGridButton) {

            fxGridButton.textContent = state.fxGridEnabled ? 'Grid: ON' : 'Grid: OFF';

            fxGridButton.style.borderColor = state.fxGridEnabled ? 'rgba(0,255,255,0.42)' : 'rgba(255,255,255,0.18)';

            fxGridButton.style.background = state.fxGridEnabled ? 'rgba(0,255,255,0.18)' : 'rgba(255,255,255,0.07)';

        }



        if (fxScanlineButton) {

            fxScanlineButton.textContent = state.fxScanlineEnabled ? 'Scanline: ON' : 'Scanline: OFF';

            fxScanlineButton.style.borderColor = state.fxScanlineEnabled ? 'rgba(0,255,255,0.42)' : 'rgba(255,255,255,0.18)';

            fxScanlineButton.style.background = state.fxScanlineEnabled ? 'rgba(0,255,255,0.18)' : 'rgba(255,255,255,0.07)';

        }



        if (stabilityButton) {
            stabilityButton.textContent = state.stableMainNodes ? 'Stability: ON' : 'Stability: OFF';
            stabilityButton.style.borderColor = state.stableMainNodes ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.18)';
            stabilityButton.style.background = state.stableMainNodes ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.07)';
        }

        [nodeButton, chainButton, kindButton].forEach((button) => {

            button.disabled = !hasTarget;

            button.style.opacity = hasTarget ? '1' : '0.56';

            button.style.cursor = hasTarget ? 'pointer' : 'default';

        });

        nodeButton.style.borderColor = staticState.nodeLocked ? 'rgba(255,214,90,0.42)' : 'rgba(255,255,255,0.18)';

        nodeButton.style.background = staticState.nodeLocked ? 'rgba(255,214,90,0.18)' : 'rgba(255,255,255,0.07)';

        chainButton.style.borderColor = branchLocked ? 'rgba(255,214,90,0.42)' : 'rgba(255,255,255,0.18)';

        chainButton.style.background = branchLocked ? 'rgba(255,214,90,0.18)' : 'rgba(255,255,255,0.07)';

        kindButton.style.borderColor = staticState.kindLocked ? 'rgba(255,214,90,0.42)' : 'rgba(255,255,255,0.18)';

        kindButton.style.background = staticState.kindLocked ? 'rgba(255,214,90,0.18)' : 'rgba(255,255,255,0.07)';

        const summary = getStaticSummary();

        const parts = [];

        if (summary.nodeCount) parts.push(summary.nodeCount + ' node' + (summary.nodeCount === 1 ? '' : 's'));

        if (summary.branchCount) parts.push(summary.branchCount + ' chain' + (summary.branchCount === 1 ? '' : 's'));

        if (summary.kinds.length) parts.push(summary.kinds.length + ' type' + (summary.kinds.length === 1 ? '' : 's'));

        summaryEl.textContent = parts.length ? ('Static: ' + parts.join(' | ')) : 'Static: none';

        clearButton.style.opacity = summary.total ? '1' : '0.6';

        directKindButtons.forEach(({ kind, button }) => {

            const locked = state.staticKinds.has(kind);

            button.textContent = getKindLockButtonLabel(kind, locked);

            button.style.borderColor = locked ? 'rgba(255,214,90,0.42)' : 'rgba(255,255,255,0.18)';

            button.style.background = locked ? 'rgba(255,214,90,0.18)' : 'rgba(255,255,255,0.07)';

        });

        const polarityKindLabel = hasTarget ? getKindDisplayName(targetNode.kind) : 'Type';

        polarityNodeButton.textContent = 'Node: ' + (polarityState.nodeOverride === 'inherit'

            ? 'Inherit'

            : (polarityState.nodeOverride === 'attract' ? 'Pull' : 'Push'));

        polarityKindButton.textContent = hasTarget

            ? (polarityKindLabel + ': ' + (polarityState.kind === 'attract' ? 'Pull' : 'Push'))

            : 'Type: Push';

        [polarityNodeButton, polarityKindButton].forEach((button) => {

            button.disabled = !hasTarget;

            button.style.opacity = hasTarget ? '1' : '0.56';

            button.style.cursor = hasTarget ? 'pointer' : 'default';

        });

        polarityNodeButton.style.borderColor = polarityState.nodeOverride === 'attract'

            ? 'rgba(122,255,196,0.42)'

            : (polarityState.nodeOverride === 'repel' ? 'rgba(255,180,120,0.42)' : 'rgba(255,255,255,0.18)');

        polarityNodeButton.style.background = polarityState.nodeOverride === 'attract'

            ? 'rgba(122,255,196,0.14)'

            : (polarityState.nodeOverride === 'repel' ? 'rgba(255,180,120,0.14)' : 'rgba(255,255,255,0.07)');

        polarityKindButton.style.borderColor = polarityState.kind === 'attract'

            ? 'rgba(122,255,196,0.42)'

            : 'rgba(255,255,255,0.18)';

        polarityKindButton.style.background = polarityState.kind === 'attract'

            ? 'rgba(122,255,196,0.14)'

            : 'rgba(255,255,255,0.07)';

        const polaritySummary = getPolaritySummary();

        const polarityParts = [];

        if (polaritySummary.nodeOverrideCount) polarityParts.push(polaritySummary.nodeOverrideCount + ' node' + (polaritySummary.nodeOverrideCount === 1 ? '' : 's'));

        if (polaritySummary.attractKinds.length) polarityParts.push(polaritySummary.attractKinds.length + ' pull type' + (polaritySummary.attractKinds.length === 1 ? '' : 's'));

        polaritySummaryEl.textContent = polarityParts.length ? ('Flow: ' + polarityParts.join(' | ')) : 'Flow: push default';

        polarityClearButton.style.opacity = polaritySummary.total ? '1' : '0.6';

        repelStrengthInput.value = getPolarityStrengthText('repel');

        attractStrengthInput.value = getPolarityStrengthText('attract');

        repelStrengthNumber.value = getPolarityStrengthText('repel');

        attractStrengthNumber.value = getPolarityStrengthText('attract');

        repelStrengthValue.textContent = getPolarityStrengthText('repel');

        attractStrengthValue.textContent = getPolarityStrengthText('attract');

        motionTuningEntries.forEach(({ field, range, number, value }) => {

            const textValue = getMotionTuningText(field.key);

            range.value = textValue;
            number.value = textValue;
            value.textContent = textValue;

        });

    }

    function renderHeader() {

        if (!state.titleEl || !state.scopeEl || !state.statsEl) return;

        state.titleEl.textContent = 'NEURAL CORE :: CONSTELLATION MAP';

        state.scopeEl.textContent = getScopeText(state.scope);

        state.statsEl.textContent = state.nodes.length + ' nodes - ' + state.edges.length + ' edges';

        renderToolbarState();

    }



    function getNodeAnchor(node) {

        if (node?.manualAnchor && Number.isFinite(node.manualAnchor.x) && Number.isFinite(node.manualAnchor.y)) {

            return getManualAnchorTarget(node.manualAnchor);

        }

        const anchorNodeId = text(node?.data?.anchorNodeId, '');

        if (anchorNodeId) {

            const anchorNode = state.nodeIndex.get(anchorNodeId);

            if (anchorNode) {

                return { x: anchorNode.x, y: anchorNode.y };

            }

        }

        return state.worldAnchor || { x: 0, y: 0 };

    }



    state.renderInspector = renderInspector;

    function getSecondaryActions(node) {

        if (!node) return [];

        const actions = [];

        if (node.kind === 'link') {

            if (text(node?.data?.folderId, '')) actions.push({ label: 'Open Folder', action: 'open-folder' });

            if (text(node?.data?.categoryName, '')) actions.push({ label: 'Open Card', action: 'open-category' });

            return actions;

        }

        if (node.kind === 'folder') {

            actions.push({ label: 'Open Folder', action: 'open-folder' });

            if (text(node?.data?.categoryName, '')) actions.push({ label: 'Open Card', action: 'open-category' });

            return actions;

        }

        if (node.kind === 'category') {

            actions.push({ label: 'Card Settings', action: 'open-category-settings' });

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

                    '<div style="font-size:0.82rem;opacity:0.82;line-height:1.45;margin-top:10px;">' + escapeHtml(targetNode.meta || 'No details') + '</div>',

                    actionRow,

                    secondaryRow

                ].join('')

        ].join('');

        updateInspectorCoverState();

        scheduleInspectorCoverRotation();

        renderToolbarState();

    }



    function requestDraw() {

        if (!state.running) draw();

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

        if (state.pointer.mode === 'pan' || state.pointer.mode === 'node') {

            state.canvas.style.cursor = 'grabbing';

            return;

        }

        state.canvas.style.cursor = state.hovered ? 'pointer' : 'grab';

    }



    function getScreenPoint(node) {

        return {

            x: (node.x * state.transform.scale) + state.transform.tx,

            y: (node.y * state.transform.scale) + state.transform.ty

        };

    }



    function shouldRenderLabel(node, isHovered, isSelected) {

        if (state.labelMode === 'off') return false;

        if (isHovered || isSelected) return true;

        if (node.kind !== 'link') return state.labelMode !== 'off';

        if (state.labelMode === 'focus') return false;

        if (state.labelMode === 'all') return true;

        return true;

    }



    function getAutoLinkLabelBudget() {

        const nodeCount = state.nodes.length;

        const scale = state.transform.scale;

        if (state.labelMode === 'all') return Infinity;

        if (state.labelMode === 'focus') return 0;

        if (nodeCount > 5000) return scale >= 2.8 ? 480 : scale >= 1.85 ? 200 : 90;

        if (nodeCount > 2500) return scale >= 2.6 ? 420 : scale >= 1.7 ? 180 : 80;

        if (nodeCount > 1200) return scale >= 2.4 ? 320 : scale >= 1.55 ? 140 : 60;

        if (nodeCount > 500) return scale >= 2.1 ? 240 : scale >= 1.4 ? 110 : 40;

        if (nodeCount > 220) return scale >= 1.8 ? 170 : scale >= 1.25 ? 90 : 34;

        if (nodeCount > 120) return scale >= 1.45 ? 120 : 56;

        return Infinity;

    }



    function getCursorFocusIds() {

        const focusIds = new Set();

        const pointerX = Number(state.pointer.canvasX);

        const pointerY = Number(state.pointer.canvasY);

        if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return focusIds;



        const ranked = [];

        state.nodes.forEach((node) => {

            const point = getScreenPoint(node);

            const dx = point.x - pointerX;

            const dy = point.y - pointerY;

            const distSq = (dx * dx) + (dy * dy);

            if (distSq > (LABEL_CURSOR_RADIUS * LABEL_CURSOR_RADIUS)) return;

            ranked.push({ node, distSq });

        });



        ranked.sort((left, right) => left.distSq - right.distSq);

        ranked.slice(0, LABEL_FOCUS_LIMIT).forEach((entry) => {

            focusIds.add(entry.node.id);

        });

        return focusIds;

    }



    function getLabelBackdropColor(box) {

        if (box.isSelected) return 'rgba(12, 20, 32, 0.82)';

        if (box.isHovered) return 'rgba(8, 18, 30, 0.76)';

        if (box.node.kind === 'link') return 'rgba(6, 12, 22, 0.52)';

        return 'rgba(6, 12, 22, 0.66)';

    }



    function drawRoundedBackdrop(ctx, box) {

        const width = Math.max(12, box.right - box.left);

        const height = Math.max(12, box.bottom - box.top);

        const radius = Math.min(8, Math.max(5, height * 0.38));

        ctx.beginPath();

        if (typeof ctx.roundRect === 'function') {

            ctx.roundRect(box.left, box.top, width, height, radius);

        } else {

            ctx.moveTo(box.left + radius, box.top);

            ctx.lineTo(box.right - radius, box.top);

            ctx.quadraticCurveTo(box.right, box.top, box.right, box.top + radius);

            ctx.lineTo(box.right, box.bottom - radius);

            ctx.quadraticCurveTo(box.right, box.bottom, box.right - radius, box.bottom);

            ctx.lineTo(box.left + radius, box.bottom);

            ctx.quadraticCurveTo(box.left, box.bottom, box.left, box.bottom - radius);

            ctx.lineTo(box.left, box.top + radius);

            ctx.quadraticCurveTo(box.left, box.top, box.left + radius, box.top);

        }

        ctx.closePath();

        ctx.fillStyle = getLabelBackdropColor(box);

        ctx.fill();

    }



    function renderLabels(ctx) {

        state.labelHitBoxes = [];

        if (state.labelMode === 'off') return;

        const focusIds = getCursorFocusIds();

        const searchMatchIds = new Set((state.searchState.matches || []).map((match) => match.id));

        const autoLinkBudget = getAutoLinkLabelBudget();



        const candidates = state.nodes.map((node) => {

            const isHovered = state.hovered && state.hovered.id === node.id;

            const isSelected = state.selected && state.selected.id === node.id;

            const isPointerFocused = focusIds.has(node.id);

            const isSearchMatch = searchMatchIds.has(node.id);

            if (!shouldRenderLabel(node, isHovered, isSelected)) return null;

            if (

                state.labelMode === 'focus'

                && node.kind === 'link'

                && !isHovered

                && !isSelected

                && !isPointerFocused

                && !isSearchMatch

            ) {

                return null;

            }



            const point = getScreenPoint(node);

            const fontSize = isSelected || isHovered

                ? 13

                : node.kind === 'workspace'

                    ? 12.5

                    : node.kind === 'category' || node.kind === 'folder'

                        ? 12

                        : (state.labelMode === 'all' ? 10.5 : 10);

            const textX = point.x + (node.radius * state.transform.scale) + 8;

            const textY = point.y + (isHovered || isSelected ? 5 : 4);

            ctx.font = `${fontSize}px sans-serif`;

            const textWidth = ctx.measureText(node.label).width;

            const box = {

                node,

                left: textX - 6,

                right: textX + textWidth + 8,

                top: textY - fontSize - 5,

                bottom: textY + 8,

                fontSize,

                textX,

                textY,

                isHovered,

                isSelected,

                isPointerFocused,

                isSearchMatch,

                priority: (isSelected ? 100 : 0)

                    + (isHovered ? 60 : 0)

                    + (isPointerFocused ? 40 : 0)

                    + (isSearchMatch ? 32 : 0)

                    + (node.kind === 'workspace' ? 40 : 0)

                    + (node.kind === 'category' ? 32 : 0)

                    + (node.kind === 'folder' ? 24 : 0)

                    + Math.min(node.radius, 12)

            };

            return box;

        }).filter(Boolean);



        candidates.sort((left, right) => {

            if (right.priority !== left.priority) return right.priority - left.priority;

            if (left.node.kind === 'link' && right.node.kind !== 'link') return 1;

            if (left.node.kind !== 'link' && right.node.kind === 'link') return -1;

            return left.node.label.localeCompare(right.node.label, undefined, { sensitivity: 'base' });

        });



        const occupied = [];

        let renderedLinkLabels = 0;

        candidates.forEach((box) => {

            if (

                state.labelMode === 'auto'

                && box.node.kind === 'link'

                && !box.isHovered

                && !box.isSelected

                && !box.isPointerFocused

                && !box.isSearchMatch

                && autoLinkBudget !== Infinity

                && renderedLinkLabels >= autoLinkBudget

            ) {

                return;

            }

            const allowOverlap = state.labelMode === 'all'

                ? (box.isHovered || box.isSelected)

                : false;

            if (!allowOverlap && state.labelMode === 'auto') {

                const overlaps = occupied.some((taken) => !(

                    box.right < taken.left

                    || box.left > taken.right

                    || box.bottom < taken.top

                    || box.top > taken.bottom

                ));

                if (overlaps && box.node.kind === 'link' && !box.isHovered && !box.isSelected) {

                    return;

                }

            }



            state.labelHitBoxes.push(box);

            occupied.push(box);

            if (box.node.kind === 'link') renderedLinkLabels += 1;



            const labelOpacity = box.isSelected

                ? 0.98

                : box.isHovered

                    ? 0.94

                    : box.isPointerFocused || box.isSearchMatch

                        ? 0.9

                    : box.node.kind === 'link'

                        ? (state.labelMode === 'all' ? 0.62 : 0.78)

                        : 0.88;

            ctx.font = `${box.fontSize}px sans-serif`;

            ctx.lineJoin = 'round';

            drawRoundedBackdrop(ctx, box);

            ctx.strokeStyle = 'rgba(4, 10, 18, 0.82)';

            ctx.lineWidth = box.isSelected || box.isHovered ? 4.4 : 3.2;

            ctx.shadowBlur = box.isHovered || box.isSelected ? 12 : 6;

            ctx.shadowColor = 'rgba(0,0,0,0.5)';

            ctx.strokeText(box.node.label, box.textX, box.textY);

            ctx.shadowBlur = 0;

            ctx.fillStyle = `rgba(255,255,255,${labelOpacity})`;

            ctx.fillText(box.node.label, box.textX, box.textY);

        });

    }



    function draw() {

        if (!state.ctx || !state.canvas) return;

        const ctx = state.ctx;

        ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

        ctx.save();

        ctx.translate(state.transform.tx, state.transform.ty);

        ctx.scale(state.transform.scale, state.transform.scale);



        state.edges.forEach((edge) => {

            ctx.beginPath();

            ctx.moveTo(edge.source.x, edge.source.y);

            ctx.lineTo(edge.target.x, edge.target.y);

            ctx.strokeStyle = edge.type === 'tag' ? 'rgba(0, 212, 255, 0.12)' : 'rgba(0, 212, 255, 0.28)';

            ctx.lineWidth = edge.type === 'tag' ? (0.9 / state.transform.scale) : (1.5 / state.transform.scale);

            ctx.stroke();

        });



        state.nodes.forEach((node) => {
            const isHovered = state.hovered && state.hovered.id === node.id;
            const isSelected = state.selected && state.selected.id === node.id;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            ctx.shadowBlur = (isHovered || isSelected ? 20 : 10) / state.transform.scale;
            ctx.shadowColor = node.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (node.kind === 'folder' && node.data && typeof node.data.depth === 'number' && node.data.depth > 0) {
                const maxRings = Math.min(node.data.depth, 4);
                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));
                for (let i = 1; i <= maxRings; i++) {
                    const ringRadius = node.radius - (gap * i);
                    if (ringRadius > 0.5) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.lineWidth = 1 / state.transform.scale;
                        ctx.stroke();
                    }
                }
            }

            if (isHovered || isSelected) {
                ctx.lineWidth = 2 / state.transform.scale;
                ctx.strokeStyle = 'rgba(255,255,255,0.92)';
                if (getStaticStateForNode(node).isStatic) {
                    ctx.strokeStyle = 'rgba(255,214,90,0.98)';
                }
                ctx.stroke();
            }

            if (getStaticStateForNode(node).isStatic) {

                ctx.beginPath();

                ctx.arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);

                ctx.lineWidth = 1.6 / state.transform.scale;

                ctx.strokeStyle = 'rgba(255,214,90,0.74)';

                ctx.stroke();

            }

        });



        ctx.restore();

        renderLabels(ctx);

        updateCursor();

    }


    ns._render = ns._render || {};

    Object.assign(ns._render, {

        requestDraw,

        renderHeader,

        renderInspector,

        renderToolbarState,

        updateInspectorCoverState,

        updateCursor,

        getScreenPoint,

        getNodeAnchor,

        draw

    });

})(window.EveConstellationMap);
