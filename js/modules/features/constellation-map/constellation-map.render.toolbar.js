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
        FX_TUNING_FIELDS,
        MOTION_TUNING_FIELDS,
        AURA_TUNING_FIELDS,
        AURA_PRESETS,
        AURA_DEPTH_ORDER,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,
        getKindDisplayName,
        ensureAuraControls,
        getNodePolarityState,
        getPolaritySummary,
        getPolarityStrengthText,
        getMotionTuningText,
        ensureFxControls,
        getFxTuningText,
        getAuraTuningText,
        getAuraPresetText,
        ensureMapThemeControls,
        getMapThemeTuningText,
        getMapThemeColorValue,
        getMapThemeSummaryText,
        applyMapTheme,
        text,
        getStaticStateForNode,
        isStaticBranchRoot,
        getStaticSummary
    } = shared;

    const AURA_EMITTER_LABELS = {
        workspace: 'Tab Auras',
        category: 'Card Auras',
        folder: 'Folder Auras'
    };

    const AURA_DEPTH_LABELS = {
        root: 'Root Layer',
        layer1: 'Layer 1',
        layer2: 'Layer 2',
        layer3plus: 'Layer 3+'
    };

    function getKindLockButtonLabel(kind, locked) {
        const label = getKindDisplayName(kind);
        return (locked ? 'Release ' : 'Freeze ') + label;
    }

    function getControlsToggleText() {
        return state.controlsExpanded ? 'Hide Control Center' : 'Control Center';
    }

    function setButtonActive(button, active, options) {
        if (!button) return;
        const opts = options || {};
        button.classList.toggle('active', !!active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.style.borderColor = active
            ? (opts.activeBorder || 'color-mix(in srgb, var(--map-theme-accent) 48%, transparent)')
            : (opts.inactiveBorder || 'color-mix(in srgb, var(--map-theme-border-base) 76%, transparent)');
        button.style.background = active
            ? (opts.activeBackground || 'color-mix(in srgb, var(--map-theme-accent) 16%, transparent)')
            : (opts.inactiveBackground || 'color-mix(in srgb, var(--map-theme-button-base) var(--map-theme-button-fill), transparent)');
        button.style.color = opts.color || 'var(--map-theme-text)';
        button.style.boxShadow = active
            ? (opts.activeShadow || '')
            : (opts.inactiveShadow || '');
        button.style.textShadow = active
            ? (opts.activeTextShadow || '')
            : (opts.inactiveTextShadow || '');
    }

    function setButtonEnabled(button, enabled) {
        if (!button) return;
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.56';
        button.style.cursor = enabled ? 'pointer' : 'default';
    }

    function queryAll(selector) {
        return Array.from(state.container?.querySelectorAll(selector) || []);
    }

    function clampNumber(value, min, max) {
        return Math.min(Math.max(Number(value) || 0, min), max);
    }

    function renderActionWheel(wheelEl) {
        if (!wheelEl) return;

        const wheelState = state.actionWheel || {};
        const nodeId = text(wheelState.nodeId, '');
        const items = Array.isArray(wheelState.items) ? wheelState.items : [];
        const node = nodeId ? (state.nodes.find((entry) => entry.id === nodeId) || null) : null;
        if (!wheelState.visible || !node || !items.length) {
            wheelEl.classList.remove('is-visible');
            wheelEl.innerHTML = '';
            return;
        }

        const bounds = state.container?.getBoundingClientRect?.();
        const width = Number(bounds?.width) || Number(state.canvas?.width) || window.innerWidth || 1280;
        const height = Number(bounds?.height) || Number(state.canvas?.height) || window.innerHeight || 720;
        const radius = 104 + (Math.max(items.length - 5, 0) * 10);
        const padding = Math.max(138, radius + 24);
        const centerX = clampNumber(Number(wheelState.clientX) - Number(bounds?.left || 0), padding, Math.max(padding, width - padding));
        const centerY = clampNumber(Number(wheelState.clientY) - Number(bounds?.top || 0), padding, Math.max(padding, height - padding));
        const startAngle = -Math.PI / 2;

        wheelEl.classList.add('is-visible');
        wheelEl.innerHTML = [
            '<div class="map-action-wheel-center" style="left:' + centerX + 'px;top:' + centerY + 'px;">' + escapeHtml(text(node.label, 'Node').slice(0, 32)) + '</div>',
            items.map((item, index) => {
                const angle = startAngle + ((Math.PI * 2 * index) / Math.max(items.length, 1));
                const itemX = centerX + (Math.cos(angle) * radius);
                const itemY = centerY + (Math.sin(angle) * radius);
                const accentClass = item?.accent ? ' is-accent' : '';
                return '<button type="button" data-map-wheel-action="' + escapeHtml(text(item?.action, '')) + '" class="map-action-wheel-item' + accentClass + '" style="left:' + itemX.toFixed(1) + 'px;top:' + itemY.toFixed(1) + 'px;">' + escapeHtml(text(item?.label, 'Action')) + '</button>';
            }).join('')
        ].join('');
    }

    function renderToolbarState() {
        if (!state.container) return;

        applyMapTheme(state.container);

        const controls = ensureAuraControls();
        const fxControls = ensureFxControls();
        const themeControls = ensureMapThemeControls();
        const fxButton = state.container.querySelector('[data-map-toolbar="fx"]');
        const controlsButton = state.container.querySelector('[data-map-toolbar="controls"]');
        const controlsPanel = state.container.querySelector('[data-map-controls-panel]');
        const fxPanel = state.container.querySelector('[data-map-fx-panel]');
        const actionWheel = state.container.querySelector('[data-map-action-wheel]');

        if (fxButton) {
            fxButton.textContent = 'Background FX';
            setButtonActive(fxButton, !!state.fxExpanded, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 54%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 18%, transparent)'
            });
        }
        if (fxPanel) {
            fxPanel.style.display = 'flex';
            fxPanel.classList.add('visible');
        }

        if (controlsButton) {
            controlsButton.textContent = getControlsToggleText();
            controlsButton.setAttribute('aria-expanded', state.controlsExpanded ? 'true' : 'false');
            setButtonActive(controlsButton, !!state.controlsExpanded, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-accent) 48%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-accent) 14%, transparent)'
            });
        }
        if (controlsPanel) {
            controlsPanel.style.display = state.controlsExpanded ? 'flex' : 'none';
        }

        queryAll('[data-map-toolbar="labels"]').forEach((button) => {
            button.textContent = getLabelModeText();
        });

        queryAll('[data-map-toolbar="motion"]').forEach((button) => {
            button.textContent = getMotionModeText();
        });

        queryAll('[data-fx-engine]').forEach((button) => {
            const active = button.dataset.fxEngine === (state.activeWebGlFx || 'none');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 58%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 18%, transparent)'
            });
        });

        queryAll('[data-fx-toggle]').forEach((chip) => {
            const type = chip.dataset.fxToggle;
            let active = false;
            let label = '';
            if (type === 'grid') { active = !!state.fxGridEnabled; label = 'Grid'; }
            if (type === 'scanline') { active = !!state.fxScanlineEnabled; label = 'Scanline'; }
            if (type === 'tech') { active = !!state.fxTechEnabled; label = 'Tech'; }
            if (type === 'circuit') { active = !!state.fxCircuitEnabled; label = 'Circuit'; }
            if (type === 'neuralhud') { active = !!state.fxNeuralHudEnabled; label = 'Neural HUD'; }
            chip.textContent = label + ': ' + (active ? 'ON' : 'OFF');
            setButtonActive(chip, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 58%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 16%, transparent)'
            });
        });

        queryAll('[data-map-fx-flag]').forEach((button) => {
            const key = button.dataset.mapFxFlag;
            const active = fxControls?.[key] !== false;
            button.textContent = (key === 'parallaxEnabled' ? 'Camera Parallax' : 'Pointer Reactive') + ': ' + (active ? 'ON' : 'OFF');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 54%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 14%, transparent)'
            });
        });

        queryAll('[data-map-toolbar="theme-follow-site"]').forEach((button) => {
            const active = themeControls.followSiteTheme !== false;
            button.textContent = 'Follow Site Theme: ' + (active ? 'ON' : 'OFF');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-accent) 52%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-accent) 16%, transparent)',
                activeShadow: '0 0 0 1px color-mix(in srgb, var(--map-theme-accent) 18%, transparent), 0 0 26px color-mix(in srgb, var(--map-theme-accent) 18%, transparent)'
            });
        });

        queryAll('[data-map-toolbar="open-site-theme"]').forEach((button) => {
            setButtonActive(button, false, {
                inactiveBorder: 'color-mix(in srgb, var(--map-theme-border-base) 76%, transparent)',
                inactiveBackground: 'color-mix(in srgb, var(--map-theme-button-base) var(--map-theme-button-fill), transparent)'
            });
        });

        queryAll('[data-map-toolbar="theme-reset"]').forEach((button) => {
            setButtonActive(button, false, {
                inactiveBorder: 'color-mix(in srgb, var(--map-theme-border-base) 76%, transparent)',
                inactiveBackground: 'color-mix(in srgb, var(--map-theme-button-base) var(--map-theme-button-fill), transparent)'
            });
        });

        queryAll('[data-map-theme-summary]').forEach((el) => {
            el.textContent = getMapThemeSummaryText();
        });

        queryAll('[data-map-toolbar="stability"]').forEach((button) => {
            button.textContent = state.stableMainNodes ? 'Hold Main Nodes: ON' : 'Hold Main Nodes: OFF';
            setButtonActive(button, !!state.stableMainNodes);
        });

        queryAll('[data-map-toolbar="chain-internal"]').forEach((button) => {
            button.textContent = state.chainInternalForcesEnabled ? 'Same-Chain Forces: ON' : 'Same-Chain Forces: OFF';
            setButtonActive(button, !!state.chainInternalForcesEnabled);
        });

        queryAll('[data-map-toolbar="chain-external"]').forEach((button) => {
            button.textContent = state.chainExternalForcesEnabled ? 'Cross-Chain Forces: ON' : 'Cross-Chain Forces: OFF';
            setButtonActive(button, !!state.chainExternalForcesEnabled);
        });

        queryAll('[data-map-toolbar="chain-hierarchy"]').forEach((button) => {
            button.textContent = state.chainHierarchyEnabled ? 'Enforce Folder Layers: ON' : 'Enforce Folder Layers: OFF';
            setButtonActive(button, !!state.chainHierarchyEnabled);
        });

        queryAll('[data-map-toolbar="bookmark-hierarchy"]').forEach((button) => {
            button.textContent = state.bookmarkHierarchyEnabled ? 'Keep Bookmark Lanes: ON' : 'Keep Bookmark Lanes: OFF';
            setButtonActive(button, !!state.bookmarkHierarchyEnabled);
        });

        queryAll('[data-map-toolbar="rewire-mode"]').forEach((button) => {
            button.textContent = state.rewire?.enabled ? 'Chain Surgery: ON' : 'Chain Surgery: OFF';
            setButtonActive(button, !!state.rewire?.enabled, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-accent) 54%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-accent) 16%, transparent)'
            });
        });

        queryAll('[data-map-toolbar="rewire-cancel"]').forEach((button) => {
            const canCancel = !!text(state.rewire?.sourceNodeId, '') || !!state.rewire?.dragging;
            setButtonEnabled(button, canCancel);
        });

        queryAll('[data-map-rewire-summary]').forEach((el) => {
            const summary = typeof ns._getConstellationRewireSummary === 'function'
                ? ns._getConstellationRewireSummary()
                : 'Drag or click a bookmark or folder to arm it, then drop or click a card or folder target. In Unidex or workspace scope, target another card to transfer chains across cards.';
            el.textContent = summary;
        });

        queryAll('[data-map-aura-toggle]').forEach((button) => {
            const mode = button.dataset.mapAuraToggle;
            const active = mode === 'effects' ? controls.effectsEnabled !== false : controls.visualsEnabled !== false;
            const label = mode === 'effects' ? 'Aura Forces' : 'Aura Volumes';
            button.textContent = label + ': ' + (active ? 'ON' : 'OFF');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-aura) 54%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-aura) 16%, transparent)',
                activeShadow: '0 0 0 1px color-mix(in srgb, var(--map-theme-aura) 18%, transparent), 0 0 30px color-mix(in srgb, var(--map-theme-aura) 20%, transparent)',
                activeTextShadow: '0 0 14px color-mix(in srgb, var(--map-theme-aura) 28%, transparent)'
            });
        });

        queryAll('[data-map-aura-emitter]').forEach((button) => {
            const kind = button.dataset.mapAuraEmitter;
            const active = controls.emitters?.[kind] !== false;
            const label = AURA_EMITTER_LABELS[kind] || kind;
            button.textContent = label + ': ' + (active ? 'ON' : 'OFF');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-aura) 48%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-aura) 15%, transparent)',
                activeShadow: '0 0 0 1px color-mix(in srgb, var(--map-theme-aura) 16%, transparent), 0 0 24px color-mix(in srgb, var(--map-theme-aura) 16%, transparent)'
            });
        });

        queryAll('[data-map-aura-depth]').forEach((button) => {
            const depthKey = button.dataset.mapAuraDepth;
            const active = controls.depths?.[depthKey] !== false;
            const label = AURA_DEPTH_LABELS[depthKey] || depthKey;
            button.textContent = label + ': ' + (active ? 'ON' : 'OFF');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 42%, var(--map-theme-accent) 18%)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 12%, transparent)',
                activeShadow: '0 0 0 1px color-mix(in srgb, var(--map-theme-fx) 14%, transparent), 0 0 24px color-mix(in srgb, var(--map-theme-aura) 10%, transparent)'
            });
        });

        queryAll('[data-map-aura-preset]').forEach((button) => {
            const active = button.dataset.mapAuraPreset === state.auraPreset;
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-aura) 56%, var(--map-theme-fx) 20%)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-aura) 14%, transparent)',
                activeShadow: '0 0 0 1px color-mix(in srgb, var(--map-theme-aura) 16%, transparent), 0 0 26px color-mix(in srgb, var(--map-theme-fx) 14%, transparent)'
            });
        });

        const auraPresetSummary = state.container.querySelector('[data-map-aura-preset-summary]');
        if (auraPresetSummary) {
            auraPresetSummary.textContent = getAuraPresetText();
        }

        MOTION_TUNING_FIELDS.forEach((field) => {
            const textValue = getMotionTuningText(field.key);
            queryAll('[data-map-motion-tuning="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-motion-tuning-number="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-motion-tuning-value="' + field.key + '"]').forEach((el) => { el.textContent = textValue; });
        });

        FX_TUNING_FIELDS.forEach((field) => {
            const textValue = getFxTuningText(field.key);
            queryAll('[data-map-fx-tuning="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-fx-tuning-number="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-fx-tuning-value="' + field.key + '"]').forEach((el) => { el.textContent = textValue; });
        });

        AURA_TUNING_FIELDS.forEach((field) => {
            const textValue = getAuraTuningText(field.key);
            queryAll('[data-map-aura-tuning="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-aura-tuning-number="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-aura-tuning-value="' + field.key + '"]').forEach((el) => { el.textContent = textValue; });
        });

        MAP_THEME_TUNING_FIELDS.forEach((field) => {
            const textValue = getMapThemeTuningText(field.key);
            queryAll('[data-map-theme-tuning="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-theme-tuning-number="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-theme-tuning-value="' + field.key + '"]').forEach((el) => { el.textContent = textValue; });
        });

        MAP_THEME_COLOR_FIELDS.forEach((field) => {
            const value = getMapThemeColorValue(field.key);
            queryAll('[data-map-theme-color="' + field.key + '"]').forEach((input) => { input.value = value; });
            queryAll('[data-map-theme-color-value="' + field.key + '"]').forEach((el) => { el.textContent = value.toUpperCase(); });
        });

        const targetNode = state.selected || state.hovered || null;
        const staticState = getStaticStateForNode(targetNode);
        const branchLocked = isStaticBranchRoot(targetNode);
        const hasTarget = !!targetNode;
        const kindLabel = hasTarget ? getKindDisplayName(targetNode.kind) : 'Type';

        queryAll('[data-map-toolbar="static-node"]').forEach((button) => {
            button.textContent = staticState.nodeLocked ? 'Release Node' : 'Static Node';
            setButtonEnabled(button, hasTarget);
            setButtonActive(button, staticState.nodeLocked, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 46%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 16%, transparent)'
            });
        });

        queryAll('[data-map-toolbar="static-chain"]').forEach((button) => {
            button.textContent = branchLocked ? 'Release Chain' : 'Static Chain';
            setButtonEnabled(button, hasTarget);
            setButtonActive(button, branchLocked, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 46%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 16%, transparent)'
            });
        });

        queryAll('[data-map-toolbar="static-kind"]').forEach((button) => {
            button.textContent = hasTarget
                ? (staticState.kindLocked ? ('Release ' + kindLabel) : ('Static ' + kindLabel))
                : 'Static Type';
            setButtonEnabled(button, hasTarget);
            setButtonActive(button, staticState.kindLocked, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 46%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 16%, transparent)'
            });
        });

        const staticSummary = getStaticSummary();
        const staticParts = [];
        if (staticSummary.nodeCount) staticParts.push(staticSummary.nodeCount + ' node' + (staticSummary.nodeCount === 1 ? '' : 's'));
        if (staticSummary.branchCount) staticParts.push(staticSummary.branchCount + ' chain' + (staticSummary.branchCount === 1 ? '' : 's'));
        if (staticSummary.kinds.length) staticParts.push(staticSummary.kinds.length + ' type' + (staticSummary.kinds.length === 1 ? '' : 's'));
        queryAll('[data-map-static-summary]').forEach((el) => {
            el.textContent = staticParts.length ? ('Static: ' + staticParts.join(' | ')) : 'Static: none';
        });

        queryAll('[data-map-toolbar="static-clear"]').forEach((button) => {
            setButtonEnabled(button, staticSummary.total > 0);
        });

        KIND_ORDER.forEach((kind) => {
            queryAll('[data-map-static-kind="' + kind + '"]').forEach((button) => {
                const locked = state.staticKinds.has(kind);
                button.textContent = getKindLockButtonLabel(kind, locked);
                setButtonActive(button, locked, {
                    activeBorder: 'color-mix(in srgb, var(--map-theme-fx) 46%, transparent)',
                    activeBackground: 'color-mix(in srgb, var(--map-theme-fx) 16%, transparent)'
                });
            });
        });

        const polarityState = getNodePolarityState(targetNode);
        const polarityKindLabel = hasTarget ? getKindDisplayName(targetNode.kind) : 'Type';

        queryAll('[data-map-toolbar="polarity-node"]').forEach((button) => {
            const textValue = polarityState.nodeOverride === 'inherit'
                ? 'Inherit'
                : (polarityState.nodeOverride === 'attract' ? 'Pull' : 'Push');
            button.textContent = 'Node: ' + textValue;
            setButtonEnabled(button, hasTarget);
            const active = polarityState.nodeOverride !== 'inherit';
            const accent = polarityState.nodeOverride === 'attract'
                ? { activeBorder: 'color-mix(in srgb, var(--map-theme-aura) 52%, transparent)', activeBackground: 'color-mix(in srgb, var(--map-theme-aura) 14%, transparent)' }
                : { activeBorder: 'color-mix(in srgb, var(--map-theme-danger) 44%, transparent)', activeBackground: 'color-mix(in srgb, var(--map-theme-danger) 12%, transparent)' };
            setButtonActive(button, active, accent);
        });

        queryAll('[data-map-toolbar="polarity-kind"]').forEach((button) => {
            button.textContent = hasTarget
                ? (polarityKindLabel + ': ' + (polarityState.kind === 'attract' ? 'Pull' : 'Push'))
                : 'Type: Push';
            setButtonEnabled(button, hasTarget);
            setButtonActive(button, polarityState.kind === 'attract', {
                activeBorder: 'color-mix(in srgb, var(--map-theme-aura) 52%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-aura) 14%, transparent)'
            });
        });

        const polaritySummary = getPolaritySummary();
        const polarityParts = [];
        if (polaritySummary.nodeOverrideCount) polarityParts.push(polaritySummary.nodeOverrideCount + ' node' + (polaritySummary.nodeOverrideCount === 1 ? '' : 's'));
        if (polaritySummary.attractKinds.length) polarityParts.push(polaritySummary.attractKinds.length + ' pull type' + (polaritySummary.attractKinds.length === 1 ? '' : 's'));
        queryAll('[data-map-polarity-summary]').forEach((el) => {
            el.textContent = polarityParts.length ? ('Flow: ' + polarityParts.join(' | ')) : 'Flow: push default';
        });
        queryAll('[data-map-toolbar="polarity-clear"]').forEach((button) => {
            setButtonEnabled(button, polaritySummary.total > 0);
        });

        queryAll('[data-map-polarity-strength="repel"]').forEach((input) => { input.value = getPolarityStrengthText('repel'); });
        queryAll('[data-map-polarity-strength-number="repel"]').forEach((input) => { input.value = getPolarityStrengthText('repel'); });
        queryAll('[data-map-polarity-strength-value="repel"]').forEach((el) => { el.textContent = getPolarityStrengthText('repel'); });
        queryAll('[data-map-polarity-strength="attract"]').forEach((input) => { input.value = getPolarityStrengthText('attract'); });
        queryAll('[data-map-polarity-strength-number="attract"]').forEach((input) => { input.value = getPolarityStrengthText('attract'); });
        queryAll('[data-map-polarity-strength-value="attract"]').forEach((el) => { el.textContent = getPolarityStrengthText('attract'); });

        renderActionWheel(actionWheel);
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
