window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedStateCore = ns._sharedStateCore = ns._sharedStateCore || {};

    const state = {

        container: null,

        canvas: null,

        ctx: null,

        themeObserver: null,

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

        selectionIds: new Set(),

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

        motionMode: 'free',

        activeWebGlFx: 'none',

        fxExpanded: false,

        fxGridEnabled: false,

        fxScanlineEnabled: false,

        fxTechEnabled: false,

        fxCircuitEnabled: false,
        fxNeuralHudEnabled: false,
        fxControls: {
            pointerReactive: true,
            parallaxEnabled: true
        },
        fxTuning: {
            density: 1,
            speed: 1,
            glow: 1,
            interaction: 1,
            parallax: 1,
            contrast: 1,
            layerOpacity: 1,
            gridScale: 1,
            asciiScale: 1,
            asciiDensity: 1
        },

        motionAnchors: new Map(),

        lastMotionMode: 'free',

        controlsExpanded: false,

        labelMode: 'off',

        labelHitBoxes: [],

        infoCollapsed: true,

        infoHovered: false,

        infoHoverStartedAt: 0,

        coverRotationTimer: 0,

        coverPreviewSession: null,

        auraRoots: new Map(),
        workspaceAuraRoots: new Map(),
        blobControls: {
            enabled: false,
            mode: 'edge',
            rootShellsEnabled: true,
            layeredEnabled: false
        },
        blobTuning: {
            padding: 18,
            bridgeWidth: 1,
            rootScale: 1,
            opacity: 1,
            outline: 1,
            layerGap: 8
        },
        auraControls: {
            visualsEnabled: true,
            effectsEnabled: true,
            emitters: {
                workspace: true,
                category: true,
                folder: true
            },
            depths: {
                root: true,
                layer1: true,
                layer2: true,
                layer3plus: true
            }
        },
        auraTuning: {
            cardFrontScale: 1,
            cardBackScale: 1,
            cardWidthScale: 1,
            folderFrontScale: 1,
            folderBackScale: 1,
            folderWidthScale: 1,
            folderOffsetScale: 1,
            workspaceLengthScale: 1,
            workspaceWidthScale: 1,
            workspaceOffsetScale: 1
        },
        auraPreset: 'source',
        themeControls: {
            followSiteTheme: true,
            colors: {
                panelTint: '#0b1630',
                panelEdge: '#8fdcff',
                mapAccent: '#7bdcff',
                auraAccent: '#66f0ff',
                fxAccent: '#4cecff',
                workspaceNodeColor: '#ffd166',
                categoryNodeColor: '#ff4df1',
                folderNodeColor: '#b45eff',
                bookmarkDefaultColor: '#00d4ff',
                bookmarkCoveredColor: '#42c9ff',
                bookmarkTaggedColor: '#7ee787',
                bookmarkDoneColor: '#6e7583',
                cardAuraFill: '#66f0ff',
                cardAuraDash: '#c4fbff',
                workspaceAuraFill: '#5df7cf',
                workspaceAuraDash: '#d5fff1',
                folderAuraFill: '#7ea9ff',
                folderAuraDash: '#d7e4ff',
                titleColor: '#f4fbff',
                dangerAccent: '#ff6b93'
            },
            tuning: {
                panelFill: 0.9,
                buttonFill: 0.12,
                backgroundFill: 0.94,
                blur: 12
            }
        },

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
        hierarchyAnchors: new Map(),
        actionWheel: {
            visible: false,
            nodeId: '',
            clientX: 0,
            clientY: 0,
            items: []
        },
        rewire: {
            enabled: false,
            dragging: false,
            sourceNodeId: '',
            sourceNodeIds: [],
            targetNodeId: '',
            validTargetIds: new Set(),
            previewWorldX: 0,
            previewWorldY: 0,
            sourceStartX: 0,
            sourceStartY: 0,
            canDetachToRoot: false,
            hint: ''
        }
    };

    Object.assign(sharedStateCore, { state });
})(window.EveConstellationMap);
