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
<dialog id="selfTalkSettingsDialog" class="mdl-dialog gemini-self-talk-dialog" aria-labelledby="selfTalkSettingsTitle">
    <header class="gemini-self-talk-dialog__header">
        <span class="gemini-self-talk-dialog__kicker">Agentic Functions · Self-talk</span>
        <h4 class="mdl-dialog__title" id="selfTalkSettingsTitle">AI Self-talk Settings</h4>
        <p>Shape autonomous follow-ups, timing, and the instructions Gemini carries into self-talk turns.</p>
    </header>
    <div class="mdl-dialog__content">
        <section class="gemini-self-talk-section">
            <div class="gemini-self-talk-section__heading">
                <span>Timing</span>
                <small>Randomize the wait between autonomous responses.</small>
            </div>
            <div class="gemini-self-talk-delay-grid">
                <div class="gemini-self-talk-field">
                    <label for="baseDelayInput">Minimum seconds</label>
                    <input type="number" id="baseDelayInput" min="1" max="26" value="15" step="1">
                </div>
                <div class="gemini-self-talk-field">
                    <label for="maxDelayInput">Maximum extra seconds</label>
                    <input type="number" id="maxDelayInput" min="0" max="60" value="40" step="1">
                </div>
            </div>
        </section>
        
        <section class="gemini-self-talk-section">
            <div class="gemini-self-talk-section__heading">
                <span>Self-talk prompts</span>
                <small>Choose the internal follow-up goals Gemini can rotate through.</small>
            </div>
            <div class="gemini-self-talk-list" id="selfTalkPromptList" aria-live="polite">
                <!-- Prompt items will be added here -->
            </div>
            <div class="gemini-self-talk-input-row">
                <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label gemini-self-talk-textfield">
                    <input class="mdl-textfield__input" type="text" id="newPromptInput">
                    <label class="mdl-textfield__label" for="newPromptInput">New prompt instruction...</label>
                </div>
                <button class="mdl-button mdl-js-button gemini-self-talk-add" id="addPromptBtn" type="button" aria-label="Add self-talk prompt">
                    <i class="material-icons">add</i>
                </button>
            </div>
            <!-- Hidden textarea to store combined prompts -->
            <textarea id="selfTalkPromptInput" class="gemini-self-talk-hidden"></textarea>
        </section>
        
        <section class="gemini-self-talk-section">
            <div class="gemini-self-talk-section__heading">
                <span>System instructions</span>
                <small>Persistent behavioral guidance applied to autonomous turns.</small>
            </div>
            <div class="gemini-self-talk-list" id="systemInstructionList" aria-live="polite">
                <!-- Instruction items will be added here -->
            </div>
            <div class="gemini-self-talk-input-row">
                <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label gemini-self-talk-textfield">
                    <input class="mdl-textfield__input" type="text" id="newInstructionInput">
                    <label class="mdl-textfield__label" for="newInstructionInput">New system instruction...</label>
                </div>
                <button class="mdl-button mdl-js-button gemini-self-talk-add" id="addInstructionBtn" type="button" aria-label="Add system instruction">
                    <i class="material-icons">add</i>
                </button>
            </div>
            <!-- Hidden textarea to store combined instructions -->
            <textarea id="selfTalkSystemMessageInput" class="gemini-self-talk-hidden"></textarea>
        </section>

        <section class="gemini-self-talk-section gemini-self-talk-section--management">
            <div class="gemini-self-talk-section__heading">
                <span>Settings management</span>
                <small>Move this configuration safely or start fresh.</small>
            </div>
            <div class="gemini-self-talk-management-actions">
                <button type="button" class="mdl-button mdl-js-button" id="exportSettingsBtn">
                    <i class="material-icons">download</i><span>Export</span>
                </button>
                <button type="button" class="mdl-button mdl-js-button" id="importSettingsBtn">
                    <i class="material-icons">upload</i><span>Import</span>
                </button>
                <button type="button" class="mdl-button mdl-js-button gemini-self-talk-danger" id="clearSettingsBtn">
                    <i class="material-icons">delete</i><span>Clear</span>
                </button>
            </div>
            <!-- Hidden file input for import -->
            <input type="file" id="importSettingsInput" accept=".json" class="gemini-self-talk-hidden">
        </section>

        <p class="gemini-self-talk-note"><i class="material-icons">info</i> Changes apply after Save and only affect self-talk mode.</p>
    </div>
    <div class="mdl-dialog__actions gemini-self-talk-dialog__actions">
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
        if (dialog) {
            dialog.setAttribute('aria-modal', 'true');
            if (typeof window.SearchMonitorBoot?.registerSurface === 'function') {
                window.SearchMonitorBoot.registerSurface({ element: dialog });
            } else {
                dialog.dataset.searchMonitorOwned = 'true';
                dialog.dataset.surfaceOwner = 'search-monitor';
            }
        }
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
