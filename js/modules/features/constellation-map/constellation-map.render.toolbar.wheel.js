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


    const base = ns._renderToolbarBase || {};
    const { getKindLockButtonLabel, setButtonActive, setButtonEnabled, queryAll, clampNumber } = base;
    const runtime = ns._renderToolbarRuntime || {};

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

function renderHeader() {
        if (!state.titleEl || !state.scopeEl || !state.statsEl) return;

        state.titleEl.textContent = 'NEURAL CORE :: CONSTELLATION MAP';
        state.scopeEl.textContent = getScopeText(state.scope);
        state.statsEl.textContent = state.nodes.length + ' nodes - ' + state.edges.length + ' edges';
        runtime.renderToolbarState?.();
    }

    const moduleApi = ns._renderToolbarWheel = ns._renderToolbarWheel || {};
    Object.assign(moduleApi, {
        AURA_EMITTER_LABELS,
        AURA_DEPTH_LABELS,
        renderActionWheel,
        renderHeader
    });
})(window.EveConstellationMap);
