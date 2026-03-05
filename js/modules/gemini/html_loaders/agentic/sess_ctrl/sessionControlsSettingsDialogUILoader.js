/**
 * Loads the Session Controls Settings Dialog HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSessionControlsSettingsDialog() {
    // Create a placeholder div for the dialog since it doesn't need a specific placeholder
    const bodyElement = document.body;
    if (!bodyElement) {
        console.error('Body element not found for Session Controls Settings Dialog!');
        return Promise.reject('Body element not found');
    }

    try {
        const htmlContent = `
<dialog id="sessionControlsDialog" class="mdl-dialog" style="width: 360px;">
    <h4 class="mdl-dialog__title">Session Controls Settings</h4>
    <div class="mdl-dialog__content" style="max-height: 400px; overflow-y: auto;">
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="keepAliveToggleSess">
            <input type="checkbox" id="keepAliveToggleSess" class="mdl-switch__input">
            <span class="mdl-switch__label">Keep Session Alive</span>
        </label>
        
        <h5 style="margin: 16px 0 8px; font-size: 14px; font-weight: bold; border-bottom: 1px solid #eee;">Connection Settings</h5>
        
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
            <label for="heartbeatIntervalInputSess" style="font-size:12px; color:#333; width: 120px;">Heartbeat (s):</label>
            <input type="number" id="heartbeatIntervalInputSess" min="5" max="300" value="60" style="width:60px;">
        </div>
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
            <label for="cleanupIntervalInputSess" style="font-size:12px; color:#333; width: 120px;">Cleanup (s):</label>
            <input type="number" id="cleanupIntervalInputSess" min="5" max="3600" value="60" style="width:60px;">
        </div>
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
            <label for="responseTimeoutInputSess" style="font-size:12px; color:#333; width: 120px;">Response Timeout (s):</label>
            <input type="number" id="responseTimeoutInputSess" min="30" max="300" value="75" style="width:60px;">
        </div>

        <h5 style="margin: 16px 0 8px; font-size: 14px; font-weight: bold; border-bottom: 1px solid #eee;">Gemini Configuration</h5>

        <div style="margin-top: 8px;">
            <label for="systemInstructionInputSess" style="font-size:12px; color:#333; display:block;">System Instructions:</label>
            <textarea id="systemInstructionInputSess" rows="3" style="width: 100%; font-size: 12px; font-family: monospace; border: 1px solid #ddd; resize: vertical;" placeholder="Enter system instructions (persona, behavior)..."></textarea>
        </div>

        <form autocomplete="off" onsubmit="return false;" style="margin-top: 12px;">
            <label for="apiKeyInputSess" style="font-size:12px; color:#333; display:block;">Gemini API Key:</label>
            <input type="password" id="apiKeyInputSess" name="gemini-api-key" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" style="width: 100%; margin-top: 4px; border: 1px solid #ddd; padding: 4px;" placeholder="Optional: Enter your API key">
            <p style="font-size: 10px; color: #666; margin: 4px 0 0;">If provided, this key will be used instead of the server's default. It is stored safely in your browser.</p>
        </form>

        <div style="margin-top: 12px;">
            <label for="modelSelectSess" style="font-size:12px; color:#333; display:block;">Gemini Model:</label>
            <select id="modelSelectSess" style="width: 100%; margin-top: 4px;">
                <option value="gemini-2.5-flash-native-audio-latest">gemini-2.5-flash-native-audio-latest (Default)</option>
                <option value="gemini-2.0-flash-exp">gemini-2.0-flash-exp</option>
                <option value="gemini-2.0-flash-thinking-exp-1219">gemini-2.0-flash-thinking-exp-1219</option>
            </select>
        </div>
        
        <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
             <label for="safetyLevelSelectSess" style="font-size:12px; color:#333; width: 120px;">Safety Level:</label>
             <select id="safetyLevelSelectSess" style="width: 100px;">
                 <option value="high">Default (High)</option>
                 <option value="medium">Medium</option>
                 <option value="low">Low</option>
                 <option value="none">None (Permissive)</option>
             </select>
        </div>

        <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
            <label for="temperatureInputSess" style="font-size:12px; color:#333; width: 120px;">Temperature (0-2):</label>
            <input type="number" id="temperatureInputSess" min="0" max="2" step="0.1" value="0.9" style="width:60px;">
        </div>
        
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
            <label for="topKInputSess" style="font-size:12px; color:#333; width: 120px;">Top K:</label>
            <input type="number" id="topKInputSess" min="1" value="1" style="width:60px;">
        </div>

        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
            <label for="topPInputSess" style="font-size:12px; color:#333; width: 120px;">Top P (0-1):</label>
            <input type="number" id="topPInputSess" min="0" max="1" step="0.1" value="1" style="width:60px;">
        </div>

        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
            <label for="maxTokensInputSess" style="font-size:12px; color:#333; width: 120px;">Max Tokens:</label>
            <input type="number" id="maxTokensInputSess" min="1" value="2048" style="width:60px;">
        </div>




    </div>
    <div class="mdl-dialog__actions">
        <button type="button" class="mdl-button" id="sessionControlsCancel">Cancel</button>
        <button type="button" class="mdl-button" id="sessionControlsSave">Save</button>
    </div>
</dialog>
`;

        // Create a temporary container to parse the HTML
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = htmlContent;

        // Append the dialog directly to the body
        bodyElement.appendChild(tempContainer.firstElementChild);

        // After loading, upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            const dialog = document.getElementById('sessionControlsDialog');
            if (dialog) {
                componentHandler.upgradeElements(dialog);
            }
        }

        // Register dialog with polyfill if needed
        const dialog = document.getElementById('sessionControlsDialog');
        if (dialog && typeof dialog.showModal !== 'function' && typeof dialogPolyfill !== 'undefined') {
            dialogPolyfill.registerDialog(dialog);
        }

        console.log('Session Controls Settings Dialog loaded successfully');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Session Controls Settings Dialog:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the session controls loader
window.loadSessionControlsSettingsDialog = loadSessionControlsSettingsDialog; 
