/**
 * Loads the AI Self-talk Settings Dialog HTML component.
 */

async function loadAiSelfTalkSettingsDialog() {
    // Check if dialog already exists in DOM to avoid duplicates
    const existingDialog = document.getElementById('selfTalkSettingsDialog');
    if (existingDialog) {
        console.log('AI Self-talk Settings Dialog already exists in DOM.');
        return true;
    }

    try {
        const html = `
<!-- Self-talk Settings Dialog -->
<dialog id="selfTalkSettingsDialog" class="mdl-dialog" style="width: 500px;">
    <h4 class="mdl-dialog__title">AI Self-talk Settings</h4>
    <div class="mdl-dialog__content">
        <div class="settings-section" style="margin-bottom: 20px;">
            <h5 style="font-size: 14px; color: #333; display: block; margin-bottom: 5px;">Response Delay:</h5>
            <div class="delay-settings" style="display: flex; gap: 15px;">
                <div class="delay-setting" style="flex: 1;">
                    <label for="baseDelayInput" style="font-size: 12px; color: #757575; display: block; margin-bottom: 3px;">Minimum (seconds):</label>
                    <input type="number" id="baseDelayInput" min="1" max="26" value="15" step="1" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                </div>
                <div class="delay-setting" style="flex: 1;">
                    <label for="maxDelayInput" style="font-size: 12px; color: #757575; display: block; margin-bottom: 3px;">Maximum (seconds):</label>
                    <input type="number" id="maxDelayInput" min="1" max="60" value="40" step="1" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                </div>
            </div>
        </div>
        
        <div class="settings-section" style="margin-bottom: 20px;">
            <h5 style="font-size: 14px; color: #333; display: block; margin-bottom: 5px;">Self-talk Prompts:</h5>
            <div class="prompt-list" id="selfTalkPromptList" style="max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 8px; margin-bottom: 10px; background-color: #f9f9f9;">
                <!-- Prompt items will be added here -->
            </div>
            <div class="prompt-input-container" style="display: flex; align-items: flex-end; gap: 10px;">
                <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label" style="width: 100%;">
                    <input class="mdl-textfield__input" type="text" id="newPromptInput">
                    <label class="mdl-textfield__label" for="newPromptInput">New prompt instruction...</label>
                </div>
                <button class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab mdl-button--colored" id="addPromptBtn">
                    <i class="material-icons">add</i>
                </button>
            </div>
            <!-- Hidden textarea to store combined prompts -->
            <textarea id="selfTalkPromptInput" style="display: none;"></textarea>
        </div>
        
        <div class="settings-section" style="margin-bottom: 10px;">
            <h5 style="font-size: 14px; color: #333; display: block; margin-bottom: 5px;">System Instructions:</h5>
            <div class="instruction-list" id="systemInstructionList" style="max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 8px; margin-bottom: 10px; background-color: #f9f9f9;">
                <!-- Instruction items will be added here -->
            </div>
            <div class="instruction-input-container" style="display: flex; align-items: flex-end; gap: 10px;">
                <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label" style="width: 100%;">
                    <input class="mdl-textfield__input" type="text" id="newInstructionInput">
                    <label class="mdl-textfield__label" for="newInstructionInput">New system instruction...</label>
                </div>
                <button class="mdl-button mdl-js-button mdl-button--fab mdl-button--mini-fab mdl-button--colored" id="addInstructionBtn">
                    <i class="material-icons">add</i>
                </button>
            </div>
            <!-- Hidden textarea to store combined instructions -->
            <textarea id="selfTalkSystemMessageInput" style="display: none;"></textarea>
        </div>

        <div class="settings-section" style="margin-bottom: 20px; border-top: 1px solid #eee; padding-top: 15px;">
            <h5 style="font-size: 14px; color: #333; display: block; margin-bottom: 10px;">Settings Management:</h5>
            <div class="settings-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect" id="exportSettingsBtn" style="flex: 1; background-color: #e0e0e0; color: #333; font-size: 11px;">
                    <i class="material-icons" style="font-size: 16px; margin-right: 5px; vertical-align: middle;">download</i>Export
                </button>
                <button type="button" class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect" id="importSettingsBtn" style="flex: 1; background-color: #e0e0e0; color: #333; font-size: 11px;">
                    <i class="material-icons" style="font-size: 16px; margin-right: 5px; vertical-align: middle;">upload</i>Import
                </button>
                <button type="button" class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect" id="clearSettingsBtn" style="flex: 1; background-color: #ffcdd2; color: #d32f2f; font-size: 11px;">
                    <i class="material-icons" style="font-size: 16px; margin-right: 5px; vertical-align: middle;">delete</i>Clear
                </button>
            </div>
            <!-- Hidden file input for import -->
            <input type="file" id="importSettingsInput" accept=".json" style="display: none;">
        </div>

        <p class="settings-note" style="font-size: 12px; color: #666; margin-top: 5px;">These instructions control how the AI behaves in self-talk mode.</p>
    </div>
    <div class="mdl-dialog__actions">
        <button type="button" class="mdl-button" id="selfTalkSettingsCancel">Cancel</button>
        <button type="button" class="mdl-button" id="selfTalkSettingsSave">Save</button>
    </div>
</dialog>
`;

        // Insert the dialog at the end of the body (typical for dialogs)
        const container = document.body;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Move all child nodes from temp div to body
        while (tempDiv.firstChild) {
            container.appendChild(tempDiv.firstChild);
        }

        // Upgrade MDL components within the loaded dialog
        const dialog = document.getElementById('selfTalkSettingsDialog');
        if (window.componentHandler && dialog) {
            window.componentHandler.upgradeElements(dialog);
        }

        console.log('AI Self-talk Settings Dialog loaded and MDL components upgraded.');

        // Return true to indicate successful loading
        return true;

    } catch (error) {
        console.error('Error loading AI Self-talk Settings Dialog:', error);
        return false;
    }
}

// Expose the loader function globally
window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.loadAiSelfTalkSettingsDialog = loadAiSelfTalkSettingsDialog; 