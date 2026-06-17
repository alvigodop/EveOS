/**
 * Loads the Screen Capture Settings card and dialog.
 */
function getScreenCapturePrefs() {
    const Prefs = window.ScreenShareMMCommunicationPanel?.CapturePreferences;
    if (Prefs) return Prefs.get();
    return {
        intervalMs: parseInt(localStorage.getItem('screenCaptureInterval') || '1000', 10),
        quality: parseFloat(localStorage.getItem('screenCaptureQuality') || '0.98'),
        maxDimension: parseInt(localStorage.getItem('screenCaptureMaxDimension') || '2560', 10),
        format: localStorage.getItem('screenCaptureFormat') || 'png',
        silentObservation: localStorage.getItem('screenCaptureSilentObservation') === 'true'
    };
}

function saveScreenCapturePrefsFromDialog() {
    const Prefs = window.ScreenShareMMCommunicationPanel?.CapturePreferences;
    if (Prefs) {
        const prefs = Prefs.readFromFields();
        Prefs.restartIntervalIfSharing();
        return prefs;
    }

    const prefs = {
        intervalMs: parseInt(document.getElementById('screenCaptureIntervalInput')?.value || '1000', 10),
        quality: parseFloat(document.getElementById('screenCaptureQualityInput')?.value || '0.98'),
        maxDimension: parseInt(document.getElementById('screenCaptureMaxDimensionInput')?.value || '2560', 10),
        format: document.getElementById('screenCaptureFormatInput')?.value || 'png',
        silentObservation: !!document.getElementById('screenCaptureSilentToggle')?.checked
    };
    localStorage.setItem('screenCaptureInterval', String(prefs.intervalMs));
    localStorage.setItem('screenCaptureQuality', String(prefs.quality));
    localStorage.setItem('screenCaptureMaxDimension', String(prefs.maxDimension));
    localStorage.setItem('screenCaptureFormat', String(prefs.format));
    localStorage.setItem('screenCaptureSilentObservation', prefs.silentObservation ? 'true' : 'false');
    window.screenCaptureIntervalGlobal = prefs.intervalMs;
    return prefs;
}

function syncScreenCaptureDialogFields() {
    const Prefs = window.ScreenShareMMCommunicationPanel?.CapturePreferences;
    if (Prefs) return Prefs.applyToFields();
    const prefs = getScreenCapturePrefs();
    const fields = {
        screenCaptureIntervalInput: prefs.intervalMs,
        screenCaptureQualityInput: prefs.quality,
        screenCaptureMaxDimensionInput: prefs.maxDimension
    };
    Object.keys(fields).forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = String(fields[id]);
    });
    const silent = document.getElementById('screenCaptureSilentToggle');
    if (silent) silent.checked = !!prefs.silentObservation;
    const format = document.getElementById('screenCaptureFormatInput');
    if (format) format.value = prefs.format || 'png';
    return prefs;
}

function ensureScreenCaptureSettingsStyles() {
    if (document.getElementById('screenCaptureSettingsStyles')) return;
    const style = document.createElement('style');
    style.id = 'screenCaptureSettingsStyles';
    style.textContent = `
#screenCaptureSettingsDialog.gemini-screen-capture-dialog {
    width: min(440px, calc(100vw - 28px));
    border: 1px solid rgba(34, 211, 238, 0.28);
    border-radius: 18px;
    padding: 0;
    background: linear-gradient(150deg, rgba(10, 16, 24, 0.98), rgba(14, 24, 35, 0.98));
    color: #e8f8ff;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}
#screenCaptureSettingsDialog::backdrop {
    background: rgba(2, 8, 14, 0.72);
    backdrop-filter: blur(10px);
}
.gemini-screen-capture-dialog .mdl-dialog__title {
    padding: 18px 20px 8px;
    color: #f3fbff;
    font-size: 1.25rem;
    line-height: 1.1;
}
.gemini-screen-capture-copy {
    margin: 0 20px 14px;
    color: rgba(220, 242, 255, 0.68);
    font-size: 0.78rem;
}
.gemini-screen-capture-grid {
    display: grid;
    gap: 10px;
    padding: 0 20px 16px;
}
.gemini-screen-capture-field {
    display: grid;
    gap: 5px;
    padding: 10px;
    border: 1px solid rgba(148, 197, 255, 0.16);
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.035);
}
.gemini-screen-capture-field label {
    color: rgba(232, 248, 255, 0.72);
    font-size: 0.67rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
}
.gemini-screen-capture-field input,
.gemini-screen-capture-field select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(94, 234, 212, 0.28);
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(1, 10, 18, 0.76);
    color: #f4fcff;
}
.gemini-screen-capture-hint {
    color: rgba(220, 242, 255, 0.52);
    font-size: 0.7rem;
}
.gemini-screen-capture-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.gemini-screen-capture-toggle input {
    width: 42px;
    height: 22px;
    accent-color: #22d3ee;
}
.gemini-screen-capture-dialog .mdl-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px 16px;
    border-top: 1px solid rgba(148, 197, 255, 0.12);
}
.gemini-screen-capture-dialog .mdl-button {
    color: #e8f8ff;
    border-radius: 999px;
}
.gemini-screen-capture-dialog .gemini-screen-capture-save {
    background: rgba(34, 211, 238, 0.2);
    color: #effcff;
}`;
    document.head.appendChild(style);
}

async function loadScreenCaptureSettingsCard() {
    const placeholder = document.getElementById('screen-capture-settings-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Screen Capture Interval card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<div class="agentic-function-card gemini-agentic-card gemini-agentic-card--screen">
    <div class="gemini-agentic-card-head">
        <div>
            <div class="gemini-agentic-card-kicker">Share Sampling</div>
            <span class="gemini-agentic-card-title">Screen Observation</span>
        </div>
        <button id="screenCaptureSettingsButton" class="mdl-button mdl-js-button mdl-button--icon gemini-agentic-icon-btn">
            <i class="material-icons">settings</i>
        </button>
    </div>
    <div class="gemini-agentic-card-copy">
        Configure screen-share cadence, image quality, and silent observation mode.
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        const settingsButton = document.getElementById('screenCaptureSettingsButton');
        if (settingsButton) settingsButton.disabled = false;

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Screen Capture Interval card:', error);
        return Promise.reject(error);
    }
}

async function loadScreenCaptureSettingsDialog() {
    const placeholder = document.getElementById('screen-capture-settings-dialog-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Screen Capture Settings Dialog not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        ensureScreenCaptureSettingsStyles();
        const htmlContent = `
<dialog id="screenCaptureSettingsDialog" class="mdl-dialog gemini-screen-capture-dialog">
    <h4 class="mdl-dialog__title">Screen Capture Settings</h4>
    <p class="gemini-screen-capture-copy">Screen frames can remain visible to Gemini without forcing voice/chat output for every passive update.</p>
    <div class="mdl-dialog__content">
        <div class="gemini-screen-capture-grid">
            <div class="gemini-screen-capture-field">
                <label for="screenCaptureIntervalInput">Interval (ms)</label>
                <input type="number" id="screenCaptureIntervalInput" min="250" max="30000" step="250" value="1000">
                <span class="gemini-screen-capture-hint">Lower is more responsive; higher is quieter and cheaper.</span>
            </div>
            <div class="gemini-screen-capture-field">
                <label for="screenCaptureQualityInput">JPEG Quality</label>
                <input type="number" id="screenCaptureQualityInput" min="0.6" max="1" step="0.05" value="0.98">
                <span class="gemini-screen-capture-hint">Used by JPEG/WebP. PNG stays lossless for text-heavy screens.</span>
            </div>
            <div class="gemini-screen-capture-field">
                <label for="screenCaptureMaxDimensionInput">Max Frame Side</label>
                <input type="number" id="screenCaptureMaxDimensionInput" min="720" max="3840" step="160" value="2560">
                <span class="gemini-screen-capture-hint">Caps payload size while keeping captures readable.</span>
            </div>
            <div class="gemini-screen-capture-field">
                <label for="screenCaptureFormatInput">Image Mode</label>
                <select id="screenCaptureFormatInput">
                    <option value="png">PNG / sharp text</option>
                    <option value="webp">WebP / balanced</option>
                    <option value="jpeg">JPEG / small payload</option>
                </select>
                <span class="gemini-screen-capture-hint">PNG is default so Gemini receives cleaner text and UI edges.</span>
            </div>
            <div class="gemini-screen-capture-field gemini-screen-capture-toggle">
                <div>
                    <label for="screenCaptureSilentToggle">Silent Observation</label>
                    <span class="gemini-screen-capture-hint">Gemini sees frames but responses/audio from passive frames are suppressed.</span>
                </div>
                <input type="checkbox" id="screenCaptureSilentToggle">
            </div>
        </div>
    </div>
    <div class="mdl-dialog__actions">
        <button type="button" class="mdl-button" id="screenCaptureSettingsCancel">Cancel</button>
        <button type="button" class="mdl-button gemini-screen-capture-save" id="screenCaptureSettingsSave">Save</button>
    </div>
</dialog>
`;
        placeholder.innerHTML = htmlContent;

        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        const dialog = document.getElementById('screenCaptureSettingsDialog');
        if (dialog && typeof window.dialogPolyfill !== 'undefined') {
            window.dialogPolyfill.registerDialog(dialog);
        }
        syncScreenCaptureDialogFields();

        console.log('Screen Capture Settings Dialog loaded successfully.');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Screen Capture Settings Dialog:', error);
        return Promise.reject(error);
    }
}

function initializeScreenCaptureSettingsHandler() {
    console.log('ScreenCaptureSettingsAgentic.initializeScreenCaptureSettingsHandler called.');
    const settingsButton = document.getElementById('screenCaptureSettingsButton');
    const settingsDialog = document.getElementById('screenCaptureSettingsDialog');
    const cancelButton = settingsDialog ? settingsDialog.querySelector('#screenCaptureSettingsCancel') : null;
    const saveButton = settingsDialog ? settingsDialog.querySelector('#screenCaptureSettingsSave') : null;

    if (!settingsButton || !settingsDialog) {
        console.error('One or more Screen Capture Settings dialog elements not found. Handler will not be fully initialized.');
        return;
    }

    settingsButton.addEventListener('click', () => {
        console.log('Screen Capture Settings button clicked. Opening dialog.');
        syncScreenCaptureDialogFields();

        if (settingsDialog.showModal) {
            settingsDialog.showModal();
        } else {
            console.error('Dialog API not supported.');
            settingsDialog.style.display = 'block';
        }
    });

    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            console.log('Screen Capture Settings dialog Cancel button clicked.');
            if (settingsDialog.close) {
                settingsDialog.close();
            } else {
                settingsDialog.style.display = 'none';
            }
        });
    }

    if (saveButton) {
        saveButton.addEventListener('click', () => {
            console.log('Screen Capture Settings dialog Save button clicked.');
            const prefs = saveScreenCapturePrefsFromDialog();
            if (typeof window.displayMessage === 'function') {
                const mode = prefs.silentObservation ? 'silent observation' : 'response allowed';
                window.displayMessage(`System Message: Screen capture set to ${prefs.intervalMs}ms, ${prefs.format || 'png'} @ ${prefs.maxDimension}px (${mode})`, true);
            }

            if (settingsDialog.close) {
                settingsDialog.close();
            } else {
                settingsDialog.style.display = 'none';
            }
        });
    }

    console.log('Screen Capture Settings Handler initialized successfully.');
}

window.loadScreenCaptureSettingsCard = loadScreenCaptureSettingsCard;
window.loadScreenCaptureSettingsDialog = loadScreenCaptureSettingsDialog;
window.ScreenCaptureSettingsAgentic = window.ScreenCaptureSettingsAgentic || {};
window.ScreenCaptureSettingsAgentic.initializeScreenCaptureSettingsHandler = initializeScreenCaptureSettingsHandler;
