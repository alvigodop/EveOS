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

function getKindLockButtonLabel(kind, locked) {

        const label = getKindDisplayName(kind);

        return (locked ? 'Release ' : 'Freeze ') + label;

    }

function getControlsToggleText() {

        return state.controlsExpanded ? 'Hide Controls' : 'Controls';

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

        const chainInternalButton = state.container.querySelector('[data-map-toolbar="chain-internal"]');
        if (chainInternalButton) {
            chainInternalButton.textContent = state.chainInternalForcesEnabled ? 'Internal Chain: ON' : 'Internal Chain: OFF';
            chainInternalButton.style.borderColor = state.chainInternalForcesEnabled ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.18)';
            chainInternalButton.style.background = state.chainInternalForcesEnabled ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.07)';
        }

        const chainExternalButton = state.container.querySelector('[data-map-toolbar="chain-external"]');
        if (chainExternalButton) {
            chainExternalButton.textContent = state.chainExternalForcesEnabled ? 'External Chain: ON' : 'External Chain: OFF';
            chainExternalButton.style.borderColor = state.chainExternalForcesEnabled ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.18)';
            chainExternalButton.style.background = state.chainExternalForcesEnabled ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.07)';
        }

        const chainHierarchyButton = state.container.querySelector('[data-map-toolbar="chain-hierarchy"]');
        if (chainHierarchyButton) {
            chainHierarchyButton.textContent = state.chainHierarchyEnabled ? 'Hierarchy Order: ON' : 'Hierarchy Order: OFF';
            chainHierarchyButton.style.borderColor = state.chainHierarchyEnabled ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.18)';
            chainHierarchyButton.style.background = state.chainHierarchyEnabled ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.07)';
        }

        const bookmarkHierarchyButton = state.container.querySelector('[data-map-toolbar="bookmark-hierarchy"]');
        if (bookmarkHierarchyButton) {
            bookmarkHierarchyButton.textContent = state.bookmarkHierarchyEnabled ? 'Bookmark Hierarchy: ON' : 'Bookmark Hierarchy: OFF';
            bookmarkHierarchyButton.style.borderColor = state.bookmarkHierarchyEnabled ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.18)';
            bookmarkHierarchyButton.style.background = state.bookmarkHierarchyEnabled ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.07)';
        }

        const physicsAurasButton = state.container.querySelector('[data-map-toolbar="physics-auras"]');
        if (physicsAurasButton) {
            physicsAurasButton.textContent = state.showPhysicsAuras ? 'Physics Auras: ON' : 'Physics Auras: OFF';
            physicsAurasButton.style.borderColor = state.showPhysicsAuras ? 'rgba(122,255,196,0.32)' : 'rgba(255,255,255,0.18)';
            physicsAurasButton.style.background = state.showPhysicsAuras ? 'rgba(122,255,196,0.12)' : 'rgba(255,255,255,0.07)';
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

    const renderToolbarHelpers = ns._renderToolbarHelpers = ns._renderToolbarHelpers || {};
    Object.assign(renderToolbarHelpers, {
        getKindLockButtonLabel,
        getControlsToggleText,
        renderToolbarState,
        renderHeader
    });

})(window.EveConstellationMap);
