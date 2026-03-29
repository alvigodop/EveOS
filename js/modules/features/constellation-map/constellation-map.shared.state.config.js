window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedStateConfig = ns._sharedStateConfig = ns._sharedStateConfig || {};

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

    const AURA_DEPTH_ORDER = Object.freeze(['root', 'layer1', 'layer2', 'layer3plus']);

    const FX_TUNING_FIELDS = Object.freeze([
        { key: 'density', label: 'Effect Density', min: 0.25, max: 3, step: 0.01, defaultValue: 1, section: 'engine' },
        { key: 'speed', label: 'Animation Speed', min: 0.2, max: 3, step: 0.01, defaultValue: 1, section: 'engine' },
        { key: 'glow', label: 'Glow Strength', min: 0, max: 3, step: 0.01, defaultValue: 1, section: 'engine' },
        { key: 'interaction', label: 'Pointer Force', min: 0, max: 3, step: 0.01, defaultValue: 1, section: 'engine' },
        { key: 'parallax', label: 'Camera Drift', min: 0, max: 3, step: 0.01, defaultValue: 1, section: 'engine' },
        { key: 'contrast', label: 'Contrast Lift', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'layers' },
        { key: 'layerOpacity', label: 'Layer Strength', min: 0, max: 3, step: 0.01, defaultValue: 1, section: 'layers' },
        { key: 'gridScale', label: 'Grid Scale', min: 0.5, max: 2.5, step: 0.01, defaultValue: 1, section: 'layers' },
        { key: 'asciiScale', label: 'ASCII Size', min: 0.65, max: 1.7, step: 0.01, defaultValue: 1, section: 'ascii' },
        { key: 'asciiDensity', label: 'ASCII Density', min: 0.45, max: 2.4, step: 0.01, defaultValue: 1, section: 'ascii' }
    ]);

    const MOTION_TUNING_FIELDS = Object.freeze([
        { key: 'repulsion', label: 'Node Repulsion', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'centerPull', label: 'World Center Pull', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'spring', label: 'Edge Spring', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'hierarchy', label: 'Hierarchy Reaction', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'folderRecovery', label: 'Folder Recovery', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'damping', label: 'Velocity Damping', min: 0, max: 2, step: 0.01, defaultValue: 1 },
        { key: 'speed', label: 'Velocity Limit', min: 0, max: 2, step: 0.01, defaultValue: 1 },
        { key: 'tether', label: 'World Boundary Pull', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'frontierReach', label: 'Root Ring Radius', min: 80, max: 800, step: 1, defaultValue: 180 }
    ]);

    const AURA_TUNING_FIELDS = Object.freeze([
        { key: 'cardFrontScale', label: 'Card Front Reach', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'card' },
        { key: 'cardBackScale', label: 'Card Rear Reach', min: 0.3, max: 3, step: 0.01, defaultValue: 1, section: 'card' },
        { key: 'cardWidthScale', label: 'Card Width', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'card' },
        { key: 'folderFrontScale', label: 'Folder Front Reach', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'folder' },
        { key: 'folderBackScale', label: 'Folder Rear Reach', min: 0.3, max: 3, step: 0.01, defaultValue: 1, section: 'folder' },
        { key: 'folderWidthScale', label: 'Folder Width', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'folder' },
        { key: 'folderOffsetScale', label: 'Folder Core Offset', min: 0.5, max: 2.5, step: 0.01, defaultValue: 1, section: 'folder' },
        { key: 'workspaceLengthScale', label: 'Tab Length', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'workspace' },
        { key: 'workspaceWidthScale', label: 'Tab Width', min: 0.4, max: 3, step: 0.01, defaultValue: 1, section: 'workspace' },
        { key: 'workspaceOffsetScale', label: 'Tab Offset', min: 0.5, max: 2.5, step: 0.01, defaultValue: 1, section: 'workspace' }
    ]);

    const AURA_PRESETS = Object.freeze({
        source: {
            label: 'Source Default',
            values: {}
        },
        tight: {
            label: 'Tight Spine',
            values: {
                cardFrontScale: 0.82,
                cardBackScale: 0.78,
                cardWidthScale: 0.72,
                folderFrontScale: 0.86,
                folderBackScale: 0.84,
                folderWidthScale: 0.72,
                folderOffsetScale: 0.9,
                workspaceLengthScale: 0.88,
                workspaceWidthScale: 0.76,
                workspaceOffsetScale: 0.9
            }
        },
        wide: {
            label: 'Wide Canopy',
            values: {
                cardFrontScale: 1.25,
                cardBackScale: 1.12,
                cardWidthScale: 1.35,
                folderFrontScale: 1.2,
                folderBackScale: 1.08,
                folderWidthScale: 1.28,
                folderOffsetScale: 1.08,
                workspaceLengthScale: 1.22,
                workspaceWidthScale: 1.32,
                workspaceOffsetScale: 1.08
            }
        },
        orbital: {
            label: 'Orbital Spread',
            values: {
                cardFrontScale: 1.08,
                cardBackScale: 1.22,
                cardWidthScale: 1.48,
                folderFrontScale: 1.05,
                folderBackScale: 1.18,
                folderWidthScale: 1.42,
                folderOffsetScale: 1.18,
                workspaceLengthScale: 1.05,
                workspaceWidthScale: 1.5,
                workspaceOffsetScale: 1.2
            }
        }
    });

    const MAP_THEME_COLOR_FIELDS = Object.freeze([
        { key: 'panelTint', label: 'Panel Tint', defaultValue: '#0b1630', section: 'shell' },
        { key: 'panelEdge', label: 'Panel Edge', defaultValue: '#8fdcff', section: 'shell' },
        { key: 'dangerAccent', label: 'Danger Accent', defaultValue: '#ff6b93', section: 'shell' },
        { key: 'mapAccent', label: 'Map Accent', defaultValue: '#7bdcff', section: 'map' },
        { key: 'auraAccent', label: 'Aura Accent', defaultValue: '#66f0ff', section: 'map' },
        { key: 'fxAccent', label: 'FX Accent', defaultValue: '#4cecff', section: 'map' },
        { key: 'titleColor', label: 'Title Glow', defaultValue: '#f4fbff', section: 'map' },
        { key: 'workspaceNodeColor', label: 'Tab Node', defaultValue: '#ffd166', section: 'nodes' },
        { key: 'categoryNodeColor', label: 'Card Node', defaultValue: '#ff4df1', section: 'nodes' },
        { key: 'folderNodeColor', label: 'Folder Node', defaultValue: '#b45eff', section: 'nodes' },
        { key: 'bookmarkDefaultColor', label: 'Bookmark Default', defaultValue: '#00d4ff', section: 'bookmarks' },
        { key: 'bookmarkCoveredColor', label: 'Bookmark Covered', defaultValue: '#42c9ff', section: 'bookmarks' },
        { key: 'bookmarkTaggedColor', label: 'Bookmark Tagged', defaultValue: '#7ee787', section: 'bookmarks' },
        { key: 'bookmarkDoneColor', label: 'Bookmark Done', defaultValue: '#6e7583', section: 'bookmarks' },
        { key: 'cardAuraFill', label: 'Card Aura Fill', defaultValue: '#66f0ff', section: 'auras' },
        { key: 'cardAuraDash', label: 'Card Aura Dash', defaultValue: '#c4fbff', section: 'auras' },
        { key: 'workspaceAuraFill', label: 'Tab Aura Fill', defaultValue: '#5df7cf', section: 'auras' },
        { key: 'workspaceAuraDash', label: 'Tab Aura Dash', defaultValue: '#d5fff1', section: 'auras' },
        { key: 'folderAuraFill', label: 'Folder Aura Fill', defaultValue: '#7ea9ff', section: 'auras' },
        { key: 'folderAuraDash', label: 'Folder Aura Dash', defaultValue: '#d7e4ff', section: 'auras' }
    ]);

    const MAP_THEME_SITE_COLOR_PALETTES = Object.freeze({
        dark: Object.freeze({
            panelTint: '#0b1630',
            panelEdge: '#8fdcff',
            dangerAccent: '#ff6b93',
            mapAccent: '#7bdcff',
            auraAccent: '#66f0ff',
            fxAccent: '#4cecff',
            titleColor: '#f4fbff',
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
            folderAuraDash: '#d7e4ff'
        }),
        light: Object.freeze({
            panelTint: '#eef5ff',
            panelEdge: '#7ea2cf',
            dangerAccent: '#d94870',
            mapAccent: '#0b78c8',
            auraAccent: '#0ea5e9',
            fxAccent: '#10b981',
            titleColor: '#163b63',
            workspaceNodeColor: '#b7791f',
            categoryNodeColor: '#c026d3',
            folderNodeColor: '#6d28d9',
            bookmarkDefaultColor: '#2563eb',
            bookmarkCoveredColor: '#0284c7',
            bookmarkTaggedColor: '#15803d',
            bookmarkDoneColor: '#6b7280',
            cardAuraFill: '#0ea5e9',
            cardAuraDash: '#075985',
            workspaceAuraFill: '#10b981',
            workspaceAuraDash: '#065f46',
            folderAuraFill: '#6366f1',
            folderAuraDash: '#3730a3'
        })
    });

    const MAP_THEME_TUNING_FIELDS = Object.freeze([
        { key: 'panelFill', label: 'Panel Glass', min: 0.55, max: 0.98, step: 0.01, defaultValue: 0.9, section: 'shell' },
        { key: 'buttonFill', label: 'Button Glass', min: 0.04, max: 0.32, step: 0.01, defaultValue: 0.12, section: 'shell' },
        { key: 'backgroundFill', label: 'Map Haze', min: 0.55, max: 0.98, step: 0.01, defaultValue: 0.94, section: 'shell' },
        { key: 'blur', label: 'Frost Blur', min: 0, max: 26, step: 1, defaultValue: 12, section: 'shell' }
    ]);

    Object.assign(sharedStateConfig, {
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
        AURA_DEPTH_ORDER,
        FX_TUNING_FIELDS,
        MOTION_TUNING_FIELDS,
        AURA_TUNING_FIELDS,
        AURA_PRESETS,
        MAP_THEME_SITE_COLOR_PALETTES,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,
        LABEL_CURSOR_RADIUS,
        LABEL_FOCUS_LIMIT
    });
})(window.EveConstellationMap);
