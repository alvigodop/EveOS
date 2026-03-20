window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const sharedState = ns._sharedState || {};

    const {
        state,
        KIND_ORDER,
        MAP_PADDING,
        MAX_TAG_EDGES_PER_CLUSTER,
        LINK_LABEL_LIMIT,
        DOUBLE_CLICK_MS,
        MAX_VIEW_SCALE,
        MIN_VIEW_SCALE,
        FIT_MAX_SCALE,
        LABEL_MODE_ORDER,
        MOTION_MODE_ORDER,
        FX_MODE_ORDER,
        DEFAULT_KIND_POLARITIES,
        MOTION_TUNING_FIELDS,
        LABEL_CURSOR_RADIUS,
        LABEL_FOCUS_LIMIT
    } = sharedState;

    const sharedHelpers = ns._sharedHelpers || {};

    const {
        getConfig,
        getAllLinks,
        text,
        escapeHtml,
        clamp,
        getViewportSize,
        getWorkspaceName,
        getScopeText,
        normalizeScope,
        createNode,
        getKindDisplayName,
        placeOnRing,
        getAllWorkspaceIds,
        getScopedLinks,
        getCategoryNames,
        getFolderView,
        collectFolderSubtree
    } = sharedHelpers;

    function getLabelModeText() {

        if (state.labelMode === 'all') return 'Labels: All';

        if (state.labelMode === 'focus') return 'Labels: Focus';

        if (state.labelMode === 'off') return 'Labels: Off';

        return 'Labels: Auto';

    }

    function getMotionModeText() {

        if (state.motionMode === 'slow') return 'Motion: Slow';

        if (state.motionMode === 'web') return 'Motion: Web';

        if (state.motionMode === 'free') return 'Motion: Free';

        return 'Motion: Smooth';

    }

    function getFxModeText() {

        if (state.fxMode === 'grid') return 'FX: Grid';

        if (state.fxMode === 'scanline') return 'FX: Scanline';

        if (state.fxMode === 'both') return 'FX: Max';

        return 'FX: None';

    }

    function getMotionTuningField(key) {

        const normalizedKey = String(key || '').trim();

        return MOTION_TUNING_FIELDS.find((field) => field.key === normalizedKey) || null;

    }

    function normalizeMotionTuningValue(key, value) {

        const field = getMotionTuningField(key);

        if (!field) return 1;

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {

            return clamp(numeric, field.min, field.max);

        }

        return field.defaultValue;

    }

    function getMotionTuningValue(key) {

        const field = getMotionTuningField(key);

        if (!field) return 1;

        return normalizeMotionTuningValue(field.key, state.motionTuning?.[field.key]);

    }

    function setMotionTuningValue(key, value) {

        const field = getMotionTuningField(key);

        if (!field) return 1;

        if (!state.motionTuning || typeof state.motionTuning !== 'object') {

            state.motionTuning = {};

        }

        state.motionTuning[field.key] = normalizeMotionTuningValue(field.key, value);

        return state.motionTuning[field.key];

    }

    function getMotionTuningText(key) {

        return getMotionTuningValue(key).toFixed(2);

    }

    function resetMotionTuning() {

        state.motionTuning = {};

        MOTION_TUNING_FIELDS.forEach((field) => {

            state.motionTuning[field.key] = field.defaultValue;

        });

    }


    function addNode(node) {

        if (!node?.id) return null;

        const existing = state.nodeIndex.get(String(node.id));

        if (existing) return existing;

        state.nodes.push(node);

        state.nodeIndex.set(String(node.id), node);

        return node;

    }

    function addEdge(source, target, type) {

        if (!source || !target || source.id === target.id) return;

        const edgeType = text(type, 'hierarchy');

        const edgeKey = source.id + '|' + target.id + '|' + edgeType;

        if (state.edgeKeys.has(edgeKey)) return;

        state.edgeKeys.add(edgeKey);

        state.edges.push({ source, target, type: edgeType });

    }

    const shared = ns._shared = ns._shared || {};

    Object.assign(shared, {

        state,

        KIND_ORDER,

        MAP_PADDING,

        MAX_TAG_EDGES_PER_CLUSTER,

        LINK_LABEL_LIMIT,

        DOUBLE_CLICK_MS,

        MAX_VIEW_SCALE,

        MIN_VIEW_SCALE,

        FIT_MAX_SCALE,

        LABEL_MODE_ORDER,

        MOTION_MODE_ORDER,

        FX_MODE_ORDER,

        MOTION_TUNING_FIELDS,

        LABEL_CURSOR_RADIUS,

        LABEL_FOCUS_LIMIT,

        getConfig,

        getAllLinks,

        text,

        escapeHtml,

        clamp,

        getViewportSize,

        getWorkspaceName,

        getScopeText,

        normalizeScope,

        createNode,

        getLabelModeText,

        getMotionModeText,

        getFxModeText,

        getMotionTuningField,

        getMotionTuningValue,

        setMotionTuningValue,

        getMotionTuningText,

        resetMotionTuning,

        getKindDisplayName,

        placeOnRing,

        getAllWorkspaceIds,

        getScopedLinks,

        getCategoryNames,

        getFolderView,

        collectFolderSubtree,

        addNode,

        addEdge,
        hashNodeId(node) {
            const value = String(node?.id || '');
            let hash = 0;
            for (let index = 0; index < value.length; index += 1) {
                hash = ((hash * 33) + value.charCodeAt(index)) % 100003;
            }
            return hash;
        },
        getManualAnchorPreset(node) {
            if (node?.kind === 'workspace') {
                return { driftRadius: 22, pullStrength: 0.02, damping: 0.924, speed: 0.00028 };
            }
            if (node?.kind === 'category') {
                return { driftRadius: 16, pullStrength: 0.024, damping: 0.916, speed: 0.00032 };
            }
            if (node?.kind === 'folder') {
                return { driftRadius: 10, pullStrength: 0.03, damping: 0.91, speed: 0.00038 };
            }
            return { driftRadius: 8, pullStrength: 0.032, damping: 0.904, speed: 0.00042 };
        },
        createManualAnchor(node) {
            const preset = shared.getManualAnchorPreset(node);
            const hash = shared.hashNodeId(node);
            return {
                x: Number.isFinite(node?.x) ? node.x : 0,
                y: Number.isFinite(node?.y) ? node.y : 0,
                driftRadius: preset.driftRadius + (hash % 5),
                pullStrength: preset.pullStrength,
                damping: preset.damping,
                speed: preset.speed + ((hash % 7) * 0.00001),
                phase: (hash % 6283) / 1000
            };
        }
    });

})(window.EveConstellationMap);

