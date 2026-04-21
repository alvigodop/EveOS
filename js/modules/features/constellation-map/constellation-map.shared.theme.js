window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedState = ns._sharedState || {};
    const {
        state,
        MAP_THEME_SITE_COLOR_PALETTES,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS
    } = sharedState;

    const sharedHelpers = ns._sharedHelpers || {};
    const { clamp } = sharedHelpers;

    function getMapThemeColorField(key) {
        const normalizedKey = String(key || '').trim();
        return MAP_THEME_COLOR_FIELDS.find((field) => field.key === normalizedKey) || null;
    }

    function normalizeMapThemeColor(key, value) {
        const field = getMapThemeColorField(key);
        if (!field) return '#000000';
        const normalizedValue = String(value || '').trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalizedValue)) return normalizedValue;
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
        if (Number.isFinite(numeric)) return clamp(numeric, field.min, field.max);
        return field.defaultValue;
    }

    function ensureMapThemeControls() {
        if (!state.themeControls || typeof state.themeControls !== 'object') state.themeControls = {};
        const controls = state.themeControls;
        controls.followSiteTheme = controls.followSiteTheme !== false;
        controls.colors = controls.colors && typeof controls.colors === 'object' ? controls.colors : {};
        controls.tuning = controls.tuning && typeof controls.tuning === 'object' ? controls.tuning : {};
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

    function getCurrentSiteThemeMode() {
        const root = document.documentElement;
        if (!root) return 'dark';
        if (String(root.dataset?.nativeScheme || '').trim() === 'light') return 'light';
        if (root.classList?.contains('light-theme')) return 'light';
        return 'dark';
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

    function getMapThemeRgba(key, alpha) {
        const color = getResolvedMapThemeColorValue(key).replace('#', '');
        const normalized = color.length === 3 ? color.split('').map((part) => part + part).join('') : color;
        const red = parseInt(normalized.slice(0, 2), 16);
        const green = parseInt(normalized.slice(2, 4), 16);
        const blue = parseInt(normalized.slice(4, 6), 16);
        const opacity = clamp(Number(alpha), 0, 1);
        return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
    }

    function getMapThemeRgbChannels(key) {
        const color = getResolvedMapThemeColorValue(key).replace('#', '');
        const normalized = color.length === 3 ? color.split('').map((part) => part + part).join('') : color;
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
        const siteThemeMode = followSiteTheme ? getCurrentSiteThemeMode() : 'dark';
        const sitePalette = followSiteTheme
            ? (MAP_THEME_SITE_COLOR_PALETTES[siteThemeMode] || MAP_THEME_SITE_COLOR_PALETTES.dark)
            : null;
        const siteIsLight = siteThemeMode === 'light';
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
        const followTextColor = siteIsLight ? '#18314d' : '#e2edf9';
        const followMutedTextColor = siteIsLight ? '#61758e' : '#9eb2c8';
        const followTitleColor = siteIsLight
            ? `color-mix(in srgb, ${titleColor} 84%, #0f2a45 16%)`
            : `color-mix(in srgb, ${titleColor} 82%, #ffffff 18%)`;
        const panelFill = Math.round(getMapThemeTuningValue('panelFill') * 100) + '%';
        const buttonFill = Math.round(getMapThemeTuningValue('buttonFill') * 100) + '%';
        const backgroundFill = Math.round(getMapThemeTuningValue('backgroundFill') * 100) + '%';
        const blurValue = Math.round(getMapThemeTuningValue('blur')) + 'px';

        setVar('--map-theme-bg-a', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #f8fbff 82%, ${sitePalette?.panelTint || panelTint} 18%)`
                : `color-mix(in srgb, #07101d 84%, ${sitePalette?.panelTint || panelTint} 16%)`)
            : `color-mix(in srgb, ${panelTint} 80%, #040913 20%)`);
        setVar('--map-theme-bg-b', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #dde9f7 74%, ${sitePalette?.panelTint || panelTint} 26%)`
                : `color-mix(in srgb, #030711 78%, ${sitePalette?.panelTint || panelTint} 22%)`)
            : `color-mix(in srgb, ${panelTint} 54%, #02060c 46%)`);
        setVar('--map-theme-panel-base', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #ffffff 86%, ${sitePalette?.panelTint || panelTint} 14%)`
                : `color-mix(in srgb, #111a28 70%, ${sitePalette?.panelTint || panelTint} 30%)`)
            : `color-mix(in srgb, ${panelTint} 84%, #06101b 16%)`);
        setVar('--map-theme-panel-strong-base', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #f4f8ff 82%, ${sitePalette?.panelTint || panelTint} 18%)`
                : `color-mix(in srgb, #09111d 76%, ${sitePalette?.panelTint || panelTint} 24%)`)
            : `color-mix(in srgb, ${panelTint} 76%, #030811 24%)`);
        setVar('--map-theme-input-base', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #ffffff 90%, ${sitePalette?.panelTint || panelTint} 10%)`
                : `color-mix(in srgb, #0f1826 66%, ${sitePalette?.panelTint || panelTint} 34%)`)
            : `color-mix(in srgb, ${panelTint} 78%, #04101b 22%)`);
        setVar('--map-theme-button-base', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #edf5ff 80%, ${sitePalette?.panelTint || panelTint} 20%)`
                : `color-mix(in srgb, #101927 58%, ${sitePalette?.panelTint || panelTint} 42%)`)
            : `color-mix(in srgb, ${panelTint} 70%, #04101a 30%)`);
        setVar('--map-theme-border-base', followSiteTheme
            ? (siteIsLight
                ? `color-mix(in srgb, #c8d7ec 60%, ${sitePalette?.panelEdge || panelEdge} 40%)`
                : `color-mix(in srgb, #32455f 52%, ${sitePalette?.panelEdge || panelEdge} 48%)`)
            : `color-mix(in srgb, ${panelEdge} 74%, rgba(255,255,255,0.14) 26%)`);
        setVar('--map-theme-text', followSiteTheme ? followTextColor : 'var(--text-main)');
        setVar('--map-theme-text-muted', followSiteTheme ? followMutedTextColor : 'var(--text-muted)');
        setVar('--map-theme-title', followSiteTheme ? followTitleColor : titleColor);
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

    ns._sharedTheme = Object.assign(ns._sharedTheme || {}, {
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
        getCurrentSiteThemeMode,
        getMapThemeRgba,
        getMapThemeRgbChannels,
        applyMapTheme
    });
})(window.EveConstellationMap);
