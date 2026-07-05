/**
 * Loads the Session Controls card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSessionControlsCard() {
    const placeholder = document.getElementById('session-controls-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Session Controls card not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<div class="agentic-function-card gemini-agentic-card gemini-agentic-card--session">
    <div class="gemini-agentic-card-head">
        <div>
            <div class="gemini-agentic-card-kicker">Connection Rhythm</div>
            <span class="gemini-agentic-card-title">Session Controls</span>
        </div>
        <button id="sessionControlsSettingsButton" class="mdl-button mdl-js-button mdl-button--icon gemini-agentic-icon-btn">
            <i class="material-icons">settings</i>
        </button>
    </div>
    <div class="gemini-agentic-card-copy">
        Configure keep-alive pings and cleanup interval
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Session Controls card:', error);
        return Promise.reject(error);
    }
}

function loadSessionControlsSettingsDialogScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/agentic/sess_ctrl/sessionControlsSettingsDialogUILoader.js?v=0.2.2';
        script.defer = true;
        script.onload = () => {
            console.log('Session Controls Settings Dialog UI Loader script loaded.');
            resolve();
        };
        script.onerror = (error) => {
            console.error('Failed to load Session Controls Settings Dialog UI Loader script:', error);
            reject(error);
        };
        document.body.appendChild(script);
    });
}

window.loadSessionControlsCard = loadSessionControlsCard;
window.loadSessionControlsSettingsDialogScript = loadSessionControlsSettingsDialogScript;
