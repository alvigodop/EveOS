window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const state = {

        container: null,

        canvas: null,

        ctx: null,

        titleEl: null,

        scopeEl: null,

        statsEl: null,

        infoEl: null,

        findInput: null,

        nodes: [],

        nodeIndex: new Map(),

        edges: [],

        edgeKeys: new Set(),

        scope: null,

        running: false,

        animationFrameId: 0,

        bound: false,

        resizeHandler: null,

        keyHandler: null,

        hovered: null,

        selected: null,

        labelsVisible: true,

        transform: { scale: 1, tx: 0, ty: 0 },

        fitTransform: { scale: 1, tx: 0, ty: 0 },

        pointer: {

            mode: 'idle',

            startX: 0,

            startY: 0,

            baseTx: 0,

            baseTy: 0,

            node: null,

            moved: false,

            forcePan: false,

            canvasX: 0,

            canvasY: 0,

            lastWorldX: 0,

            lastWorldY: 0,

            releaseVx: 0,

            releaseVy: 0

        },

        lastClickAt: 0,

        lastClickNodeId: '',

        searchState: {

            query: '',

            index: -1,

            matches: []

        },

        motionMode: 'web',

        activeWebGlFx: 'none',

        fxExpanded: false,

        fxGridEnabled: false,

        fxScanlineEnabled: false,

        fxTechEnabled: false,

        fxCircuitEnabled: false,
        fxNeuralHudEnabled: false,

        motionAnchors: new Map(),

        lastMotionMode: 'web',

        controlsExpanded: false,

        labelMode: 'auto',

        labelHitBoxes: [],

        infoCollapsed: true,

        infoHovered: false,

        infoHoverStartedAt: 0,

        coverRotationTimer: 0,

        coverPreviewSession: null,

        auraRoots: new Map(),

        kindPolarities: {
            workspace: 'repel',
            category: 'repel',
            folder: 'repel',
            link: 'repel'
        },

        polarityStrength: {
            attract: 0.62,
            repel: 0.76
        },

        motionTuning: {
            repulsion: 1,
            centerPull: 1,
            spring: 1,
            hierarchy: 1,
            folderRecovery: 1,
            damping: 1,
            speed: 1,
            tether: 1,
            frontierReach: 180
        },

        nodePolarities: new Map(),

        staticNodeIds: new Set(),

        staticKinds: new Set(),

        staticBranchRoots: new Map(),

        staticBranchNodeIds: new Set(),

        worldAnchor: { x: 0, y: 0 },

        worldBounds: null,

        worldRadius: 0,

        stableMainNodes: true,

        chainInternalForcesEnabled: true,

        chainExternalForcesEnabled: true,

        chainHierarchyEnabled: true,

        bookmarkHierarchyEnabled: true,
        showPhysicsAuras: true,
        hierarchyAnchors: new Map()
    };

    const MAP_PADDING = 48;

    const MAX_TAG_EDGES_PER_CLUSTER = 12;

    const LINK_LABEL_LIMIT = 90;

    const DOUBLE_CLICK_MS = 320;

    const MAX_VIEW_SCALE = 6;

    const MIN_VIEW_SCALE = 0.02;

    const FIT_MAX_SCALE = 3.2;

    const LABEL_MODE_ORDER = ['auto', 'all', 'focus', 'off'];

    const MOTION_MODE_ORDER = ['smooth', 'slow', 'web', 'free'];

    const FX_MODE_ORDER = ['none', 'grid', 'scanline', 'both'];

    const LABEL_CURSOR_RADIUS = 170;

    const LABEL_FOCUS_LIMIT = 12;

    const KIND_ORDER = Object.freeze(['workspace', 'category', 'folder', 'link']);

    const DEFAULT_KIND_POLARITIES = Object.freeze({
        workspace: 'repel',
        category: 'repel',
        folder: 'repel',
        link: 'repel'
    });

    const MOTION_TUNING_FIELDS = Object.freeze([
        { key: 'repulsion', label: 'Repel Field', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'centerPull', label: 'Center Pull', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'spring', label: 'Spring', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'hierarchy', label: 'Hierarchy', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'folderRecovery', label: 'Folder Settle', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'damping', label: 'Damping', min: 0, max: 2, step: 0.01, defaultValue: 1 },
        { key: 'speed', label: 'Speed', min: 0, max: 2, step: 0.01, defaultValue: 1 },
        { key: 'tether', label: 'World Tether', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'frontierReach', label: 'Frontier Reach', min: 80, max: 800, step: 1, defaultValue: 180 }
    ]);

    const sharedState = ns._sharedState = ns._sharedState || {};

    Object.assign(sharedState, {
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
    });

})(window.EveConstellationMap);
