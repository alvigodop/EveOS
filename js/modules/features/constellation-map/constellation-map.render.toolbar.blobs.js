window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const {
        ensureBlobControls,
        getBlobModeText,
        getBlobSummaryText,
        BLOB_TUNING_FIELDS,
        getBlobTuningText
    } = shared;

    function renderBlobToolbarState(queryAll, setButtonActive) {
        const controls = ensureBlobControls();

        queryAll('[data-map-blob-toggle]').forEach((button) => {
            const mode = button.dataset.mapBlobToggle;
            let active = false;
            let label = 'Blobs';
            if (mode === 'visuals') {
                active = controls.enabled === true;
                label = 'Blob View';
            } else if (mode === 'root-shells') {
                active = controls.rootShellsEnabled !== false;
                label = 'Root Blobs';
            } else if (mode === 'layers') {
                active = controls.layeredEnabled === true;
                label = 'Blob Layers';
            }
            button.textContent = label + ': ' + (active ? 'ON' : 'OFF');
            setButtonActive(button, active, {
                activeBorder: 'color-mix(in srgb, var(--map-theme-accent) 42%, var(--map-theme-aura) 24%)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-accent) 12%, transparent)',
                activeShadow: '0 0 0 1px color-mix(in srgb, var(--map-theme-aura) 14%, transparent), 0 0 26px color-mix(in srgb, var(--map-theme-accent) 12%, transparent)'
            });
        });

        queryAll('[data-map-toolbar="blob-mode"]').forEach((button) => {
            button.textContent = getBlobModeText();
            setButtonActive(button, controls.mode === 'onion', {
                activeBorder: 'color-mix(in srgb, var(--map-theme-aura) 44%, transparent)',
                activeBackground: 'color-mix(in srgb, var(--map-theme-aura) 12%, transparent)'
            });
        });

        queryAll('[data-map-blob-summary]').forEach((el) => {
            el.textContent = getBlobSummaryText();
        });

        BLOB_TUNING_FIELDS.forEach((field) => {
            const textValue = getBlobTuningText(field.key);
            queryAll('[data-map-blob-tuning="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-blob-tuning-number="' + field.key + '"]').forEach((input) => { input.value = textValue; });
            queryAll('[data-map-blob-tuning-value="' + field.key + '"]').forEach((el) => { el.textContent = textValue; });
        });
    }

    ns._renderToolbarBlobs = Object.assign(ns._renderToolbarBlobs || {}, {
        renderBlobToolbarState
    });
})(window.EveConstellationMap);
