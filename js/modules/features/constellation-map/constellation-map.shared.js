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
        FX_TUNING_FIELDS,
        MOTION_TUNING_FIELDS,
        AURA_DEPTH_ORDER,
        AURA_TUNING_FIELDS,
        AURA_PRESETS,
        MAP_THEME_SITE_COLOR_PALETTES,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,
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

    function getFxTuningField(key) {

        const normalizedKey = String(key || '').trim();

        return FX_TUNING_FIELDS.find((field) => field.key === normalizedKey) || null;

    }

    function normalizeFxTuningValue(key, value) {

        const field = getFxTuningField(key);

        if (!field) return 1;

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {

            return clamp(numeric, field.min, field.max);

        }

        return field.defaultValue;

    }

    function getFxTuningValue(key) {

        const field = getFxTuningField(key);

        if (!field) return 1;

        return normalizeFxTuningValue(field.key, state.fxTuning?.[field.key]);

    }

    function setFxTuningValue(key, value) {

        const field = getFxTuningField(key);

        if (!field) return 1;

        if (!state.fxTuning || typeof state.fxTuning !== 'object') {

            state.fxTuning = {};

        }

        state.fxTuning[field.key] = normalizeFxTuningValue(field.key, value);

        return state.fxTuning[field.key];

    }

    function getFxTuningText(key) {

        return getFxTuningValue(key).toFixed(2);

    }

    function resetFxTuning() {

        state.fxTuning = {};

        FX_TUNING_FIELDS.forEach((field) => {

            state.fxTuning[field.key] = field.defaultValue;

        });

    }

    function ensureFxControls() {

        if (!state.fxControls || typeof state.fxControls !== 'object') {

            state.fxControls = {};

        }

        state.fxControls.pointerReactive = state.fxControls.pointerReactive !== false;
        state.fxControls.parallaxEnabled = state.fxControls.parallaxEnabled !== false;

        if (!state.fxTuning || typeof state.fxTuning !== 'object') {
            state.fxTuning = {};
        }

        FX_TUNING_FIELDS.forEach((field) => {
            state.fxTuning[field.key] = normalizeFxTuningValue(field.key, state.fxTuning[field.key]);
        });

        return state.fxControls;

    }

    function toggleFxControl(key) {
        const controls = ensureFxControls();
        const normalizedKey = String(key || '').trim();
        if (normalizedKey !== 'pointerReactive' && normalizedKey !== 'parallaxEnabled') return false;
        controls[normalizedKey] = controls[normalizedKey] === false;
        return controls[normalizedKey];
    }

    function resetFxControls() {
        state.fxControls = null;
        ensureFxControls();
        resetFxTuning();
        state.activeWebGlFx = 'none';
        state.fxGridEnabled = false;
        state.fxScanlineEnabled = false;
        state.fxTechEnabled = false;
        state.fxCircuitEnabled = false;
        state.fxNeuralHudEnabled = false;
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

    function getAuraTuningField(key) {

        const normalizedKey = String(key || '').trim();

        return AURA_TUNING_FIELDS.find((field) => field.key === normalizedKey) || null;

    }

    function normalizeAuraTuningValue(key, value) {

        const field = getAuraTuningField(key);

        if (!field) return 1;

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {

            return clamp(numeric, field.min, field.max);

        }

        return field.defaultValue;

    }

    function getAuraTuningValue(key) {

        const field = getAuraTuningField(key);

        if (!field) return 1;

        return normalizeAuraTuningValue(field.key, state.auraTuning?.[field.key]);

    }

    function setAuraTuningValue(key, value) {

        const field = getAuraTuningField(key);

        if (!field) return 1;

        if (!state.auraTuning || typeof state.auraTuning !== 'object') {

            state.auraTuning = {};

        }

        state.auraTuning[field.key] = normalizeAuraTuningValue(field.key, value);

        state.auraPreset = 'custom';

        return state.auraTuning[field.key];

    }

    function getAuraTuningText(key) {

        return getAuraTuningValue(key).toFixed(2);

    }

    function resetAuraTuning() {

        state.auraTuning = {};

        AURA_TUNING_FIELDS.forEach((field) => {

            state.auraTuning[field.key] = field.defaultValue;

        });

        state.auraPreset = 'source';

    }

    function applyAuraPreset(key) {

        const presetKey = text(key, 'source');

        const preset = AURA_PRESETS[presetKey] || AURA_PRESETS.source;

        resetAuraTuning();

        Object.entries(preset.values || {}).forEach(([fieldKey, value]) => {

            state.auraTuning[fieldKey] = normalizeAuraTuningValue(fieldKey, value);

        });

        state.auraPreset = presetKey;

        return state.auraPreset;

    }

    function getAuraPresetText() {

        const preset = AURA_PRESETS[state.auraPreset] || null;

        if (preset) return 'Aura Preset: ' + preset.label;

        return 'Aura Preset: Custom';

    }

    function ensureAuraControls() {

        if (!state.auraControls || typeof state.auraControls !== 'object') {

            state.auraControls = {};

        }

        const controls = state.auraControls;

        controls.visualsEnabled = controls.visualsEnabled !== false;

        controls.effectsEnabled = controls.effectsEnabled !== false;

        controls.emitters = controls.emitters && typeof controls.emitters === 'object'
            ? controls.emitters
            : {};

        controls.emitters.workspace = controls.emitters.workspace !== false;
        controls.emitters.category = controls.emitters.category !== false;
        controls.emitters.folder = controls.emitters.folder !== false;

        controls.depths = controls.depths && typeof controls.depths === 'object'
            ? controls.depths
            : {};

        AURA_DEPTH_ORDER.forEach((depthKey) => {
            controls.depths[depthKey] = controls.depths[depthKey] !== false;
        });

        state.showPhysicsAuras = controls.visualsEnabled;

        return controls;

    }

    function getAuraDepthBucket(depth) {

        const numeric = Number(depth);

        if (!Number.isFinite(numeric) || numeric <= 0) return 'root';
        if (numeric === 1) return 'layer1';
        if (numeric === 2) return 'layer2';
        return 'layer3plus';

    }

    function isAuraVisualsEnabled() {

        return ensureAuraControls().visualsEnabled !== false;

    }

    function isAuraEffectsEnabled() {

        return ensureAuraControls().effectsEnabled !== false;

    }

    function isAuraEmitterEnabled(kind, depth) {

        const controls = ensureAuraControls();
        const normalizedKind = String(kind || '').trim();

        if (normalizedKind === 'link') return false;
        if (controls.emitters[normalizedKind] === false) return false;

        return controls.depths[getAuraDepthBucket(depth)] !== false;

    }

    function toggleAuraVisuals() {

        const controls = ensureAuraControls();
        controls.visualsEnabled = !controls.visualsEnabled;
        state.showPhysicsAuras = controls.visualsEnabled;
        return controls.visualsEnabled;

    }

    function toggleAuraEffects() {

        const controls = ensureAuraControls();
        controls.effectsEnabled = !controls.effectsEnabled;
        return controls.effectsEnabled;

    }

    function toggleAuraEmitterKind(kind) {

        const controls = ensureAuraControls();
        const normalizedKind = String(kind || '').trim();

        if (!['workspace', 'category', 'folder'].includes(normalizedKind)) return false;

        controls.emitters[normalizedKind] = controls.emitters[normalizedKind] === false;
        return controls.emitters[normalizedKind];

    }

    function toggleAuraDepth(depthKey) {

        const controls = ensureAuraControls();
        const normalizedKey = text(depthKey, 'root');

        if (!AURA_DEPTH_ORDER.includes(normalizedKey)) return false;

        controls.depths[normalizedKey] = controls.depths[normalizedKey] === false;
        return controls.depths[normalizedKey];

    }

    function resetAuraControls() {

        state.auraControls = null;
        const controls = ensureAuraControls();

        controls.visualsEnabled = true;
        controls.effectsEnabled = true;
        controls.emitters.workspace = true;
        controls.emitters.category = true;
        controls.emitters.folder = true;
        AURA_DEPTH_ORDER.forEach((depthKey) => {
            controls.depths[depthKey] = true;
        });
        state.showPhysicsAuras = true;
        resetAuraTuning();

    }

    function resetConstellationControls() {

        resetFxControls();
        resetAuraControls();
        resetMotionTuning();
        resetMapThemeControls();

        state.stableMainNodes = true;
        state.chainInternalForcesEnabled = true;
        state.chainExternalForcesEnabled = true;
        state.chainHierarchyEnabled = true;
        state.bookmarkHierarchyEnabled = true;
        state.polarityStrength = { attract: 0.62, repel: 0.76 };
        state.kindPolarities = {
            workspace: DEFAULT_KIND_POLARITIES.workspace,
            category: DEFAULT_KIND_POLARITIES.category,
            folder: DEFAULT_KIND_POLARITIES.folder,
            link: DEFAULT_KIND_POLARITIES.link
        };
        if (state.rewire) {
            state.rewire.enabled = false;
            state.rewire.dragging = false;
            state.rewire.sourceNodeId = '';
            state.rewire.sourceNodeIds = [];
            state.rewire.targetNodeId = '';
            state.rewire.validTargetIds = new Set();
            state.rewire.previewWorldX = 0;
            state.rewire.previewWorldY = 0;
            state.rewire.sourceStartX = 0;
            state.rewire.sourceStartY = 0;
            state.rewire.canDetachToRoot = false;
            state.rewire.hint = '';
        }
        state.selectionIds = new Set();
        state.actionWheel = {
            visible: false,
            nodeId: '',
            clientX: 0,
            clientY: 0,
            items: []
        };

    }

    function getMapThemeColorField(key) {

        const normalizedKey = String(key || '').trim();

        return MAP_THEME_COLOR_FIELDS.find((field) => field.key === normalizedKey) || null;

    }

    function normalizeMapThemeColor(key, value) {

        const field = getMapThemeColorField(key);

        if (!field) return '#000000';

        const normalizedValue = String(value || '').trim();

        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalizedValue)) {
            return normalizedValue;
        }

        return field.defaultValue;

    }

    function getMapThemeTuningField(key) {

        const normalizedKey = String(key || '').trim();

        return MAP_THEME_TUNING_FIELDS.find((field) => field.key === normalizedKey) || null;

    }

    function normalizeMapThemeTuningValue(key, value) {

        const field = getMapThemeTuningField(key);

        if (!field) return 0;

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {
            return clamp(numeric, field.min, field.max);
        }

        return field.defaultValue;

    }

    function ensureMapThemeControls() {

        if (!state.themeControls || typeof state.themeControls !== 'object') {
            state.themeControls = {};
        }

        const controls = state.themeControls;

        controls.followSiteTheme = controls.followSiteTheme !== false;
        controls.colors = controls.colors && typeof controls.colors === 'object'
            ? controls.colors
            : {};
        controls.tuning = controls.tuning && typeof controls.tuning === 'object'
            ? controls.tuning
            : {};

        MAP_THEME_COLOR_FIELDS.forEach((field) => {
            controls.colors[field.key] = normalizeMapThemeColor(field.key, controls.colors[field.key]);
        });

        MAP_THEME_TUNING_FIELDS.forEach((field) => {
            controls.tuning[field.key] = normalizeMapThemeTuningValue(field.key, controls.tuning[field.key]);
        });

        return controls;

    }

    function getMapThemeColorValue(key) {

        const field = getMapThemeColorField(key);

        if (!field) return '#000000';

        return normalizeMapThemeColor(field.key, ensureMapThemeControls().colors[field.key]);

    }

    function getResolvedMapThemeColorValue(key) {

        const field = getMapThemeColorField(key);

        if (!field) return '#000000';

        const controls = ensureMapThemeControls();
        if (controls.followSiteTheme !== false) {
            const siteThemeMode = getCurrentSiteThemeMode();
            const sitePalette = MAP_THEME_SITE_COLOR_PALETTES[siteThemeMode] || MAP_THEME_SITE_COLOR_PALETTES.dark;
            if (Object.prototype.hasOwnProperty.call(sitePalette, field.key)) {
                return sitePalette[field.key];
            }
        }

        return normalizeMapThemeColor(field.key, controls.colors[field.key]);

    }

    function setMapThemeColor(key, value) {

        const field = getMapThemeColorField(key);

        if (!field) return '#000000';

        const controls = ensureMapThemeControls();
        controls.colors[field.key] = normalizeMapThemeColor(field.key, value);
        return controls.colors[field.key];

    }

    function getMapThemeTuningValue(key) {

        const field = getMapThemeTuningField(key);

        if (!field) return 0;

        return normalizeMapThemeTuningValue(field.key, ensureMapThemeControls().tuning[field.key]);

    }

    function setMapThemeTuningValue(key, value) {

        const field = getMapThemeTuningField(key);

        if (!field) return 0;

        const controls = ensureMapThemeControls();
        controls.tuning[field.key] = normalizeMapThemeTuningValue(field.key, value);
        return controls.tuning[field.key];

    }

    function getMapThemeTuningText(key) {

        const field = getMapThemeTuningField(key);
        const value = getMapThemeTuningValue(key);

        if (!field) return '0';

        return field.step >= 1 ? String(Math.round(value)) : value.toFixed(2);

    }

    function toggleMapThemeFollowSite() {

        const controls = ensureMapThemeControls();
        controls.followSiteTheme = !controls.followSiteTheme;
        return controls.followSiteTheme;

    }

    function resetMapThemeControls() {

        state.themeControls = null;
        ensureMapThemeControls();

    }

    function getMapThemeSummaryText() {

        const controls = ensureMapThemeControls();

        return controls.followSiteTheme
            ? 'Theme: Site-linked dark/light Constellation palette'
            : 'Theme: Map-local shell and accents';

    }

    function getCurrentSiteThemeMode() {

        const root = document.documentElement;
        if (!root) return 'dark';
        if (String(root.dataset?.nativeScheme || '').trim() === 'light') return 'light';
        if (root.classList?.contains('light-theme')) return 'light';
        return 'dark';

    }

    function getMapThemeRgba(key, alpha) {

        const color = getResolvedMapThemeColorValue(key).replace('#', '');
        const normalized = color.length === 3
            ? color.split('').map((part) => part + part).join('')
            : color;
        const red = parseInt(normalized.slice(0, 2), 16);
        const green = parseInt(normalized.slice(2, 4), 16);
        const blue = parseInt(normalized.slice(4, 6), 16);
        const opacity = clamp(Number(alpha), 0, 1);

        return `rgba(${red}, ${green}, ${blue}, ${opacity})`;

    }

    function getMapThemeRgbChannels(key) {

        const color = getResolvedMapThemeColorValue(key).replace('#', '');
        const normalized = color.length === 3
            ? color.split('').map((part) => part + part).join('')
            : color;
        const red = parseInt(normalized.slice(0, 2), 16);
        const green = parseInt(normalized.slice(2, 4), 16);
        const blue = parseInt(normalized.slice(4, 6), 16);

        return `${red} ${green} ${blue}`;

    }

    function applyMapTheme(container) {

        if (!container || !container.style) return;
        const style = container.style;
        const setVar = typeof style.setProperty === 'function'
            ? (key, value) => style.setProperty(key, value)
            : (key, value) => { style[key] = value; };

        const controls = ensureMapThemeControls();
        const followSiteTheme = controls.followSiteTheme !== false;
        const panelTint = getResolvedMapThemeColorValue('panelTint');
        const panelEdge = getResolvedMapThemeColorValue('panelEdge');
        const mapAccent = getResolvedMapThemeColorValue('mapAccent');
        const auraAccent = getResolvedMapThemeColorValue('auraAccent');
        const fxAccent = getResolvedMapThemeColorValue('fxAccent');
        const cardAuraFill = getResolvedMapThemeColorValue('cardAuraFill');
        const cardAuraDash = getResolvedMapThemeColorValue('cardAuraDash');
        const workspaceAuraFill = getResolvedMapThemeColorValue('workspaceAuraFill');
        const workspaceAuraDash = getResolvedMapThemeColorValue('workspaceAuraDash');
        const folderAuraFill = getResolvedMapThemeColorValue('folderAuraFill');
        const folderAuraDash = getResolvedMapThemeColorValue('folderAuraDash');
        const workspaceNodeColor = getResolvedMapThemeColorValue('workspaceNodeColor');
        const categoryNodeColor = getResolvedMapThemeColorValue('categoryNodeColor');
        const folderNodeColor = getResolvedMapThemeColorValue('folderNodeColor');
        const bookmarkDefaultColor = getResolvedMapThemeColorValue('bookmarkDefaultColor');
        const bookmarkCoveredColor = getResolvedMapThemeColorValue('bookmarkCoveredColor');
        const bookmarkTaggedColor = getResolvedMapThemeColorValue('bookmarkTaggedColor');
        const bookmarkDoneColor = getResolvedMapThemeColorValue('bookmarkDoneColor');
        const titleColor = getResolvedMapThemeColorValue('titleColor');
        const dangerAccent = getResolvedMapThemeColorValue('dangerAccent');
        const siteThemeMode = getCurrentSiteThemeMode();
        const panelFill = Math.round(getMapThemeTuningValue('panelFill') * 100) + '%';
        const buttonFill = Math.round(getMapThemeTuningValue('buttonFill') * 100) + '%';
        const backgroundFill = Math.round(getMapThemeTuningValue('backgroundFill') * 100) + '%';
        const blurValue = Math.round(getMapThemeTuningValue('blur')) + 'px';

        setVar('--map-theme-bg-a', followSiteTheme
            ? `color-mix(in srgb, var(--bg-primary) 72%, ${panelTint} 28%)`
            : `color-mix(in srgb, ${panelTint} 80%, #040913 20%)`);
        setVar('--map-theme-bg-b', followSiteTheme
            ? `color-mix(in srgb, var(--bg-primary) 38%, ${panelTint} 62%)`
            : `color-mix(in srgb, ${panelTint} 54%, #02060c 46%)`);
        setVar('--map-theme-panel-base', followSiteTheme
            ? `color-mix(in srgb, var(--card-bg) 72%, ${panelTint} 28%)`
            : `color-mix(in srgb, ${panelTint} 84%, #06101b 16%)`);
        setVar('--map-theme-panel-strong-base', followSiteTheme
            ? `color-mix(in srgb, var(--modal-bg) 66%, ${panelTint} 34%)`
            : `color-mix(in srgb, ${panelTint} 76%, #030811 24%)`);
        setVar('--map-theme-input-base', followSiteTheme
            ? `color-mix(in srgb, var(--input-bg) 80%, ${panelTint} 20%)`
            : `color-mix(in srgb, ${panelTint} 78%, #04101b 22%)`);
        setVar('--map-theme-button-base', followSiteTheme
            ? `color-mix(in srgb, var(--input-bg) 64%, ${panelTint} 36%)`
            : `color-mix(in srgb, ${panelTint} 70%, #04101a 30%)`);
        setVar('--map-theme-border-base', followSiteTheme
            ? `color-mix(in srgb, var(--modal-border) 58%, ${panelEdge} 42%)`
            : `color-mix(in srgb, ${panelEdge} 74%, rgba(255,255,255,0.14) 26%)`);
        setVar('--map-theme-text', 'var(--text-main)');
        setVar('--map-theme-text-muted', 'var(--text-muted)');
        setVar('--map-theme-title', titleColor);
        setVar('--map-theme-accent', followSiteTheme
            ? `color-mix(in srgb, var(--accent) 68%, ${mapAccent} 32%)`
            : mapAccent);
        setVar('--map-theme-aura', followSiteTheme
            ? `color-mix(in srgb, ${auraAccent} 78%, var(--accent) 22%)`
            : auraAccent);
        setVar('--map-theme-fx', followSiteTheme
            ? `color-mix(in srgb, ${fxAccent} 82%, var(--accent) 18%)`
            : fxAccent);
        setVar('--map-theme-card-aura-fill', cardAuraFill);
        setVar('--map-theme-card-aura-dash', cardAuraDash);
        setVar('--map-theme-workspace-aura-fill', workspaceAuraFill);
        setVar('--map-theme-workspace-aura-dash', workspaceAuraDash);
        setVar('--map-theme-folder-aura-fill', folderAuraFill);
        setVar('--map-theme-folder-aura-dash', folderAuraDash);
        setVar('--map-theme-workspace-node', workspaceNodeColor);
        setVar('--map-theme-category-node', categoryNodeColor);
        setVar('--map-theme-folder-node', folderNodeColor);
        setVar('--map-theme-bookmark-default', bookmarkDefaultColor);
        setVar('--map-theme-bookmark-covered', bookmarkCoveredColor);
        setVar('--map-theme-bookmark-tagged', bookmarkTaggedColor);
        setVar('--map-theme-bookmark-done', bookmarkDoneColor);
        setVar('--map-theme-panel-tint-rgb', getMapThemeRgbChannels('panelTint'));
        setVar('--map-theme-panel-edge-rgb', getMapThemeRgbChannels('panelEdge'));
        setVar('--map-theme-accent-rgb', getMapThemeRgbChannels('mapAccent'));
        setVar('--map-theme-aura-rgb', getMapThemeRgbChannels('auraAccent'));
        setVar('--map-theme-fx-rgb', getMapThemeRgbChannels('fxAccent'));
        setVar('--map-theme-title-rgb', getMapThemeRgbChannels('titleColor'));
        setVar('--map-theme-danger-rgb', getMapThemeRgbChannels('dangerAccent'));
        setVar('--map-theme-workspace-node-rgb', getMapThemeRgbChannels('workspaceNodeColor'));
        setVar('--map-theme-category-node-rgb', getMapThemeRgbChannels('categoryNodeColor'));
        setVar('--map-theme-folder-node-rgb', getMapThemeRgbChannels('folderNodeColor'));
        setVar('--map-theme-bookmark-default-rgb', getMapThemeRgbChannels('bookmarkDefaultColor'));
        setVar('--map-theme-bookmark-covered-rgb', getMapThemeRgbChannels('bookmarkCoveredColor'));
        setVar('--map-theme-bookmark-tagged-rgb', getMapThemeRgbChannels('bookmarkTaggedColor'));
        setVar('--map-theme-bookmark-done-rgb', getMapThemeRgbChannels('bookmarkDoneColor'));
        setVar('--map-theme-danger', followSiteTheme
            ? `color-mix(in srgb, var(--danger) 52%, ${dangerAccent} 48%)`
            : dangerAccent);
        setVar('--map-theme-panel-fill', panelFill);
        setVar('--map-theme-button-fill', buttonFill);
        setVar('--map-theme-background-fill', backgroundFill);
        setVar('--map-theme-blur', blurValue);

    }

    function getCardAuraShape(card) {

        const baseRadius = card?.radius || 120;
        return {
            radiusFront: baseRadius * 18.0 * getAuraTuningValue('cardFrontScale'),
            radiusBack: baseRadius * 5.0 * getAuraTuningValue('cardBackScale'),
            radiusLat: baseRadius * 10.0 * getAuraTuningValue('cardWidthScale')
        };

    }

    function getFolderAuraShape(folder, distToParent, isRootFolder) {

        let offsetDist = 140 * getAuraTuningValue('folderOffsetScale');
        if (isRootFolder) {
            // ROOT FOLDER: Move center further TOWARD the card (Upward shift: 80px)
            offsetDist = 80 * getAuraTuningValue('folderOffsetScale');
        }

        const distFromCenterToParent = distToParent - offsetDist;
        const extraBuffer = isRootFolder ? 110 : 250;

        return {
            offsetDist,
            radiusFront: isRootFolder 
                ? 300 * getAuraTuningValue('folderFrontScale') // Increased front for root folders
                : Math.max(300 * getAuraTuningValue('folderFrontScale'), (distFromCenterToParent + extraBuffer) * getAuraTuningValue('folderFrontScale')),
            radiusBack: (isRootFolder ? 260 : 250) * getAuraTuningValue('folderBackScale'), // Slightly reduced back
            radiusLat: 1100 * getAuraTuningValue('folderWidthScale')
        };

    }

    function getWorkspaceAuraShape(workspace, categoryCount) {

        const baseRadius = workspace?.radius || 15;
        const count = Math.max(1, Number(categoryCount) || 1);
        const backOffset = Math.max(80, ((baseRadius * 5) + (count * 4)) * getAuraTuningValue('workspaceOffsetScale'));
        const centerOffset = Math.max(58, backOffset * 0.84);

        return {
            capsuleHalfWidth: Math.max(150, (((baseRadius * 7) + (count * 18)) * 1.45) * getAuraTuningValue('workspaceLengthScale')),
            capsuleRadius: Math.max(90, ((baseRadius * 5.5) + (count * 7)) * getAuraTuningValue('workspaceWidthScale')),
            backOffset,
            centerOffset
        };

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

        FX_TUNING_FIELDS,

        MOTION_TUNING_FIELDS,

        AURA_TUNING_FIELDS,

        AURA_PRESETS,

        AURA_DEPTH_ORDER,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,

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

        getFxTuningField,

        getFxTuningValue,

        setFxTuningValue,

        getFxTuningText,

        resetFxTuning,

        ensureFxControls,

        toggleFxControl,

        resetFxControls,

        getMotionTuningField,

        getMotionTuningValue,

        setMotionTuningValue,

        getMotionTuningText,

        resetMotionTuning,

        getAuraTuningField,

        getAuraTuningValue,

        setAuraTuningValue,

        getAuraTuningText,

        resetAuraTuning,

        applyAuraPreset,

        getAuraPresetText,

        ensureAuraControls,

        getAuraDepthBucket,

        isAuraVisualsEnabled,

        isAuraEffectsEnabled,

        isAuraEmitterEnabled,

        toggleAuraVisuals,

        toggleAuraEffects,

        toggleAuraEmitterKind,

        toggleAuraDepth,

        resetAuraControls,

        getMapThemeColorField,

        getMapThemeColorValue,

        getResolvedMapThemeColorValue,

        setMapThemeColor,

        getMapThemeTuningField,

        getMapThemeTuningValue,

        setMapThemeTuningValue,

        getMapThemeTuningText,

        ensureMapThemeControls,

        toggleMapThemeFollowSite,

        resetMapThemeControls,

        getMapThemeSummaryText,

        getMapThemeRgba,

        getMapThemeRgbChannels,

        applyMapTheme,

        resetConstellationControls,

        getCardAuraShape,

        getFolderAuraShape,

        getWorkspaceAuraShape,

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



