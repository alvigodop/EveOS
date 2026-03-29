window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedState = ns._sharedState || {};
    const {
        state,
        BLOB_MODE_ORDER,
        BLOB_TUNING_FIELDS
    } = sharedState;

    const sharedHelpers = ns._sharedHelpers || {};
    const { clamp } = sharedHelpers;

    function ensureBlobControls() {
        if (!state.blobControls || typeof state.blobControls !== 'object') state.blobControls = {};
        const controls = state.blobControls;
        controls.enabled = controls.enabled === true;
        controls.mode = BLOB_MODE_ORDER.includes(controls.mode) ? controls.mode : 'edge';
        controls.rootShellsEnabled = controls.rootShellsEnabled !== false;
        controls.layeredEnabled = controls.layeredEnabled === true;
        if (!state.blobTuning || typeof state.blobTuning !== 'object') state.blobTuning = {};
        BLOB_TUNING_FIELDS.forEach((field) => {
            state.blobTuning[field.key] = normalizeBlobTuningValue(field.key, state.blobTuning[field.key]);
        });
        return controls;
    }

    function getBlobMode() {
        return ensureBlobControls().mode;
    }

    function getBlobModeText() {
        return getBlobMode() === 'onion' ? 'Blob Mode: Onion' : 'Blob Mode: Blob-to-Blob';
    }

    function getBlobSummaryText() {
        const controls = ensureBlobControls();
        const modeText = controls.mode === 'onion'
            ? 'Onion mode nests descendants inside parent shells.'
            : 'Blob-to-Blob stops each shell at direct children.';
        const rootText = controls.rootShellsEnabled ? 'Root shells on.' : 'Root shells off.';
        const layerText = controls.layeredEnabled ? 'Layer bands on.' : 'Layer bands off.';
        return modeText + ' ' + rootText + ' ' + layerText;
    }

    function getBlobTuningField(key) {
        const normalizedKey = String(key || '').trim();
        return BLOB_TUNING_FIELDS.find((field) => field.key === normalizedKey) || null;
    }

    function normalizeBlobTuningValue(key, value) {
        const field = getBlobTuningField(key);
        if (!field) return 0;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return clamp(numeric, field.min, field.max);
        return field.defaultValue;
    }

    function getBlobTuningValue(key) {
        const field = getBlobTuningField(key);
        if (!field) return 0;
        return normalizeBlobTuningValue(field.key, state.blobTuning?.[field.key]);
    }

    function setBlobTuningValue(key, value) {
        const field = getBlobTuningField(key);
        if (!field) return 0;
        if (!state.blobTuning || typeof state.blobTuning !== 'object') state.blobTuning = {};
        state.blobTuning[field.key] = normalizeBlobTuningValue(field.key, value);
        return state.blobTuning[field.key];
    }

    function getBlobTuningText(key) {
        const field = getBlobTuningField(key);
        const value = getBlobTuningValue(key);
        if (!field) return '0';
        return field.step >= 1 ? String(Math.round(value)) : value.toFixed(2);
    }

    function resetBlobTuning() {
        state.blobTuning = {};
        BLOB_TUNING_FIELDS.forEach((field) => {
            state.blobTuning[field.key] = field.defaultValue;
        });
    }

    function isBlobVisualsEnabled() {
        return ensureBlobControls().enabled === true;
    }

    function isBlobRootShellsEnabled() {
        return ensureBlobControls().rootShellsEnabled !== false;
    }

    function isBlobLayeredEnabled() {
        return ensureBlobControls().layeredEnabled === true;
    }

    function toggleBlobVisuals() {
        const controls = ensureBlobControls();
        controls.enabled = !controls.enabled;
        return controls.enabled;
    }

    function cycleBlobMode() {
        const controls = ensureBlobControls();
        const currentIndex = Math.max(0, BLOB_MODE_ORDER.indexOf(controls.mode));
        controls.mode = BLOB_MODE_ORDER[(currentIndex + 1) % BLOB_MODE_ORDER.length];
        return controls.mode;
    }

    function toggleBlobRootShells() {
        const controls = ensureBlobControls();
        controls.rootShellsEnabled = !controls.rootShellsEnabled;
        return controls.rootShellsEnabled;
    }

    function toggleBlobLayers() {
        const controls = ensureBlobControls();
        controls.layeredEnabled = !controls.layeredEnabled;
        return controls.layeredEnabled;
    }

    function resetBlobControls() {
        state.blobControls = null;
        ensureBlobControls();
        state.blobControls.enabled = false;
        state.blobControls.mode = 'edge';
        state.blobControls.rootShellsEnabled = true;
        state.blobControls.layeredEnabled = false;
        resetBlobTuning();
    }

    ns._sharedBlobs = Object.assign(ns._sharedBlobs || {}, {
        ensureBlobControls,
        getBlobMode,
        getBlobModeText,
        getBlobSummaryText,
        getBlobTuningField,
        getBlobTuningValue,
        setBlobTuningValue,
        getBlobTuningText,
        resetBlobTuning,
        isBlobVisualsEnabled,
        isBlobRootShellsEnabled,
        isBlobLayeredEnabled,
        toggleBlobVisuals,
        cycleBlobMode,
        toggleBlobRootShells,
        toggleBlobLayers,
        resetBlobControls
    });
})(window.EveConstellationMap);
