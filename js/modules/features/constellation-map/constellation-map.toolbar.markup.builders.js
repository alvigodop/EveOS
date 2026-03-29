window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const {
        state,
        FX_TUNING_FIELDS,
        MOTION_TUNING_FIELDS,
        AURA_TUNING_FIELDS,
        AURA_PRESETS,
        AURA_DEPTH_ORDER,
        MAP_THEME_COLOR_FIELDS,
        MAP_THEME_TUNING_FIELDS,
        escapeHtml,
        getMotionTuningText,
        getFxTuningText,
        getAuraTuningText,
        getAuraPresetText,
        getMapThemeTuningText,
        getMapThemeSummaryText,
        getMapThemeColorValue,
        getKindDisplayName
    } = shared;

function getInteractionTargetNode() {
        return state.selected || state.hovered || null;
    }

function buildRangeNumberRows(fields, rangeAttr, numberAttr, valueAttr) {
        return fields.map((field) => [
            '<label class="map-controls-range-row">',
            '<span>' + escapeHtml(field.label) + '</span>',
            '<input ' + rangeAttr + '="' + escapeHtml(field.key) + '" type="range" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(rangeAttr.indexOf('motion') !== -1 ? getMotionTuningText(field.key) : getAuraTuningText(field.key)) + '">',
            '<span ' + valueAttr + '="' + escapeHtml(field.key) + '" class="map-controls-range-value">' + escapeHtml(rangeAttr.indexOf('motion') !== -1 ? getMotionTuningText(field.key) : getAuraTuningText(field.key)) + '</span>',
            '<input ' + numberAttr + '="' + escapeHtml(field.key) + '" type="number" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(rangeAttr.indexOf('motion') !== -1 ? getMotionTuningText(field.key) : getAuraTuningText(field.key)) + '" class="map-controls-number-input">',
            '</label>'
        ].join('')).join('');
    }

function buildAuraTuningMarkup(section) {
        const fields = AURA_TUNING_FIELDS.filter((field) => field.section === section);
        return buildRangeNumberRows(fields, 'data-map-aura-tuning', 'data-map-aura-tuning-number', 'data-map-aura-tuning-value');
    }

function buildFxTuningMarkup(section) {
        const fields = FX_TUNING_FIELDS.filter((field) => field.section === section);
        return fields.map((field) => [
            '<label class="map-controls-range-row">',
            '<span>' + escapeHtml(field.label) + '</span>',
            '<input data-map-fx-tuning="' + escapeHtml(field.key) + '" type="range" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getFxTuningText(field.key)) + '">',
            '<span data-map-fx-tuning-value="' + escapeHtml(field.key) + '" class="map-controls-range-value">' + escapeHtml(getFxTuningText(field.key)) + '</span>',
            '<input data-map-fx-tuning-number="' + escapeHtml(field.key) + '" type="number" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getFxTuningText(field.key)) + '" class="map-controls-number-input">',
            '</label>'
        ].join('')).join('');
    }

function buildMotionTuningMarkup() {
        return buildRangeNumberRows(MOTION_TUNING_FIELDS, 'data-map-motion-tuning', 'data-map-motion-tuning-number', 'data-map-motion-tuning-value');
    }

function buildThemeTuningMarkup(section) {
        const fields = MAP_THEME_TUNING_FIELDS.filter((field) => field.section === section);
        return fields.map((field) => [
            '<label class="map-controls-range-row">',
            '<span>' + escapeHtml(field.label) + '</span>',
            '<input data-map-theme-tuning="' + escapeHtml(field.key) + '" type="range" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getMapThemeTuningText(field.key)) + '">',
            '<span data-map-theme-tuning-value="' + escapeHtml(field.key) + '" class="map-controls-range-value">' + escapeHtml(getMapThemeTuningText(field.key)) + '</span>',
            '<input data-map-theme-tuning-number="' + escapeHtml(field.key) + '" type="number" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getMapThemeTuningText(field.key)) + '" class="map-controls-number-input">',
            '</label>'
        ].join('')).join('');
    }

function buildThemeColorMarkup(section) {
        const fields = MAP_THEME_COLOR_FIELDS.filter((field) => field.section === section);
        return fields.map((field) => [
            '<label class="map-controls-color-row" data-map-theme-row="' + escapeHtml(field.key) + '">',
            '<span>' + escapeHtml(field.label) + '</span>',
            '<input data-map-theme-color="' + escapeHtml(field.key) + '" type="color" value="' + escapeHtml(getMapThemeColorValue(field.key)) + '" class="map-controls-color-input">',
            '<span data-map-theme-color-value="' + escapeHtml(field.key) + '" class="map-controls-color-value">' + escapeHtml(getMapThemeColorValue(field.key).toUpperCase()) + '</span>',
            '</label>'
        ].join('')).join('');
    }

function buildPresetButtons() {
        return Object.entries(AURA_PRESETS).map(([key, preset]) => {
            return '<button type="button" data-map-aura-preset="' + escapeHtml(key) + '" class="map-btn">' + escapeHtml(preset.label) + '</button>';
        }).join('');
    }

function buildDepthButtons() {
        const labels = {
            root: 'Root Layer',
            layer1: 'Layer 1',
            layer2: 'Layer 2',
            layer3plus: 'Layer 3+'
        };
        return AURA_DEPTH_ORDER.map((key) => {
            return '<button type="button" data-map-aura-depth="' + escapeHtml(key) + '" class="map-btn">' + escapeHtml(labels[key] || key) + '</button>';
        }).join('');
    }

    const moduleApi = ns._toolbarMarkupBuilders = ns._toolbarMarkupBuilders || {};
    Object.assign(moduleApi, {
        getInteractionTargetNode,
        buildRangeNumberRows,
        buildAuraTuningMarkup,
        buildFxTuningMarkup,
        buildMotionTuningMarkup,
        buildThemeTuningMarkup,
        buildThemeColorMarkup,
        buildPresetButtons,
        buildDepthButtons
    });
})(window.EveConstellationMap);
