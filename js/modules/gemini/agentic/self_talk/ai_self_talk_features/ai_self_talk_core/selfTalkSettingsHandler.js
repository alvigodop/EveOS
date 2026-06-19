/**
 * selfTalkSettingsHandler.js
 * Handles the AI Self-Talk settings dialog, prompts, instructions, and delays.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.UI = window.AiSelfTalkAgentic.UI || {};

window.AiSelfTalkAgentic.UI.initializeSettingsHandler = function () {
    console.log("Initializing AI Self-talk Settings Handler.");
    const State = window.AiSelfTalkAgentic.State;
    const Definitions = window.AiSelfTalkAgentic.Definitions;

    function confirmSelfTalkAction(message) {
        if (typeof window.showConfirmWithTitle === 'function') {
            return window.showConfirmWithTitle('AI Self-talk Settings', message, { confirmText: 'Clear', cancelText: 'Cancel' });
        }
        if (typeof window.showConfirm === 'function') {
            return window.showConfirm(message, { confirmText: 'Clear', cancelText: 'Cancel' });
        }
        if (typeof displayMessage === 'function') {
            displayMessage('System Message: Confirmation dialog is not available yet. Try again after the workspace finishes loading.', true);
        }
        return Promise.resolve(false);
    }

    // --- Self-talk Settings Dialog Initialization ---
    const selfTalkSettingsDialog = document.getElementById('selfTalkSettingsDialog');
    const selfTalkSettingsButton = document.getElementById('selfTalkSettingsButton');
    const selfTalkSettingsSave = document.getElementById('selfTalkSettingsSave');
    const selfTalkSettingsCancel = document.getElementById('selfTalkSettingsCancel');
    const selfTalkPromptInput = document.getElementById('selfTalkPromptInput');
    const selfTalkSystemMessageInput = document.getElementById('selfTalkSystemMessageInput');
    const selfTalkPromptList = document.getElementById('selfTalkPromptList');
    const systemInstructionList = document.getElementById('systemInstructionList');
    const newPromptInput = document.getElementById('newPromptInput');
    const newInstructionInput = document.getElementById('newInstructionInput');
    const addPromptBtn = document.getElementById('addPromptBtn');
    const addInstructionBtn = document.getElementById('addInstructionBtn');
    const baseDelayInput = document.getElementById('baseDelayInput'); // Added delay inputs
    const maxDelayInput = document.getElementById('maxDelayInput');   // Added delay inputs
    const exportSettingsBtn = document.getElementById('exportSettingsBtn');
    const importSettingsBtn = document.getElementById('importSettingsBtn');
    const clearSettingsBtn = document.getElementById('clearSettingsBtn');
    const importSettingsInput = document.getElementById('importSettingsInput');

    if (!selfTalkSettingsDialog || !selfTalkSettingsButton || !selfTalkSettingsSave || !selfTalkSettingsCancel || !selfTalkPromptInput || !selfTalkSystemMessageInput || !selfTalkPromptList || !systemInstructionList || !newPromptInput || !newInstructionInput || !addPromptBtn || !addInstructionBtn || !baseDelayInput || !maxDelayInput) {
        console.warn("One or more self-talk settings dialog elements not found. Skipping full initialization of settings dialog.");
        return;
    }

    // Register dialog if polyfill is available and dialog is not yet registered
    if (typeof dialogPolyfill !== 'undefined' && !selfTalkSettingsDialog.showModal) {
        try {
            dialogPolyfill.registerDialog(selfTalkSettingsDialog);
            console.log('AI Self-talk settings dialog registered with polyfill.');
        } catch (e) {
            console.warn('Failed to register AI Self-talk settings dialog with polyfill, it might be natively supported.', e);
        }
    }

    const storedPrompt = localStorage.getItem('selfTalkPrompt');
    if (storedPrompt) State.prompt = storedPrompt;

    const storedSystemMessage = localStorage.getItem('selfTalkSystemMessage');
    if (storedSystemMessage) State.systemMessage = storedSystemMessage;

    const storedBaseDelay = localStorage.getItem('baseSelftalkDelay'); // Load stored delays
    if (storedBaseDelay) State.baseDelay = parseInt(storedBaseDelay, 10);

    const storedMaxDelay = localStorage.getItem('maxSelftalkDelayOffset'); // Load stored delays
    if (storedMaxDelay) State.maxDelayOffset = parseInt(storedMaxDelay, 10);


    // Use Definition's addItemToList for helper functionality
    const addItemToList = Definitions.addItemToList;
    const updateCombinedText = Definitions.updateCombinedText;
    const parseTextToItems = Definitions.parseTextToItems;

    addPromptBtn.addEventListener('click', function () {
        if (newPromptInput.value.trim()) {
            addItemToList(newPromptInput.value.trim(), 'selfTalkPromptList');
            newPromptInput.value = '';
            // Update MDL textfield state
            if (newPromptInput.parentElement.MaterialTextfield) newPromptInput.parentElement.MaterialTextfield.change(); else newPromptInput.parentElement.classList.remove('is-dirty');
        }
    });

    addInstructionBtn.addEventListener('click', function () {
        if (newInstructionInput.value.trim()) {
            addItemToList(newInstructionInput.value.trim(), 'systemInstructionList');
            newInstructionInput.value = '';
            // Update MDL textfield state
            if (newInstructionInput.parentElement.MaterialTextfield) newInstructionInput.parentElement.MaterialTextfield.change(); else newInstructionInput.parentElement.classList.remove('is-dirty');
        }
    });

    newPromptInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && newPromptInput.value.trim()) {
            addItemToList(newPromptInput.value.trim(), 'selfTalkPromptList');
            newPromptInput.value = '';
            // Update MDL textfield state
            if (newPromptInput.parentElement.MaterialTextfield) newPromptInput.parentElement.MaterialTextfield.change(); else newPromptInput.parentElement.classList.remove('is-dirty');
        }
    });

    newInstructionInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && newInstructionInput.value.trim()) {
            addItemToList(newInstructionInput.value.trim(), 'systemInstructionList');
            newInstructionInput.value = '';
            // Update MDL textfield state
            if (newInstructionInput.parentElement.MaterialTextfield) newInstructionInput.parentElement.MaterialTextfield.change(); else newInstructionInput.parentElement.classList.remove('is-dirty');
        }
    });

    // Populate lists from stored/default prompts
    parseTextToItems(State.prompt, 'selfTalkPromptList');
    parseTextToItems(State.systemMessage, 'systemInstructionList');

    // Update delay inputs with stored/default values
    baseDelayInput.value = State.baseDelay / 1000; // Convert ms to seconds for input
    maxDelayInput.value = State.maxDelayOffset / 1000; // Convert ms to seconds for input

    // Ensure MDL textfields are upgraded after setting values
    if (baseDelayInput.parentElement.MaterialTextfield) baseDelayInput.parentElement.MaterialTextfield.change();
    if (maxDelayInput.parentElement.MaterialTextfield) maxDelayInput.parentElement.MaterialTextfield.change();

    selfTalkSettingsButton.addEventListener('click', function () {
        // Update dialog inputs with current values before showing
        baseDelayInput.value = State.baseDelay / 1000;
        maxDelayInput.value = State.maxDelayOffset / 1000;
        // Update MDL textfield state
        if (baseDelayInput.parentElement.MaterialTextfield) baseDelayInput.parentElement.MaterialTextfield.change();
        if (maxDelayInput.parentElement.MaterialTextfield) maxDelayInput.parentElement.MaterialTextfield.change();

        // Clear existing list items before populating
        document.getElementById('selfTalkPromptList').innerHTML = '';
        document.getElementById('systemInstructionList').innerHTML = '';

        // Repopulate lists from current prompt/instruction values
        parseTextToItems(State.prompt, 'selfTalkPromptList');
        parseTextToItems(State.systemMessage, 'systemInstructionList');

        selfTalkSettingsDialog.showModal();
    });

    selfTalkSettingsCancel.addEventListener('click', function () {
        selfTalkSettingsDialog.close();
    });

    selfTalkSettingsSave.addEventListener('click', function () {
        // Save delay values
        const newBaseDelay = parseInt(baseDelayInput.value, 10);
        const newMaxDelayOffset = parseInt(maxDelayInput.value, 10);

        if (!isNaN(newBaseDelay) && newBaseDelay >= 1) {
            State.baseDelay = newBaseDelay * 1000; // Convert seconds to ms for storage
            localStorage.setItem('baseSelftalkDelay', State.baseDelay.toString());
        } else {
            console.warn('Invalid base delay value. Keeping previous value.');
        }

        if (!isNaN(newMaxDelayOffset) && newMaxDelayOffset >= 0) {
            State.maxDelayOffset = newMaxDelayOffset * 1000; // Convert seconds to ms for storage
            localStorage.setItem('maxSelftalkDelayOffset', State.maxDelayOffset.toString());
        } else {
            console.warn('Invalid max delay offset value. Keeping previous value.');
        }

        // Save prompt and instruction lists
        State.prompt = updateCombinedText('selfTalkPromptList');
        State.systemMessage = updateCombinedText('systemInstructionList');

        localStorage.setItem('selfTalkPrompt', State.prompt);
        localStorage.setItem('selfTalkSystemMessage', State.systemMessage);

        if (typeof displayMessage === 'function') displayMessage("System Message: AI self-talk settings saved.", true);
        selfTalkSettingsDialog.close();
    });

    // --- Export Settings Logic ---
    if (exportSettingsBtn) {
        exportSettingsBtn.addEventListener('click', function () {
            const settingsToExport = {
                prompt: updateCombinedText('selfTalkPromptList'), // Get current from UI in case unsaved
                systemMessage: updateCombinedText('systemInstructionList'), // Get current from UI in case unsaved
                baseDelay: parseInt(baseDelayInput.value, 10) * 1000,
                maxDelayOffset: parseInt(maxDelayInput.value, 10) * 1000,
                timestamp: new Date().toISOString()
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settingsToExport, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "ai_selftalk_settings.json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            console.log("AI Self-talk settings exported.");
        });
    }

    // --- Import Settings Logic ---
    if (importSettingsBtn && importSettingsInput) {
        importSettingsBtn.addEventListener('click', function () {
            importSettingsInput.click();
        });

        importSettingsInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const importedSettings = JSON.parse(e.target.result);

                    // Validate and Apply Settings
                    if (importedSettings.prompt !== undefined) {
                        // Clear current list and repopulate
                        document.getElementById('selfTalkPromptList').innerHTML = '';
                        parseTextToItems(importedSettings.prompt, 'selfTalkPromptList');
                    }

                    if (importedSettings.systemMessage !== undefined) {
                        // Clear current list and repopulate
                        document.getElementById('systemInstructionList').innerHTML = '';
                        parseTextToItems(importedSettings.systemMessage, 'systemInstructionList');
                    }

                    if (importedSettings.baseDelay !== undefined) {
                        const baseDelaySec = Math.floor(importedSettings.baseDelay / 1000);
                        baseDelayInput.value = baseDelaySec;
                        if (baseDelayInput.parentElement.MaterialTextfield) baseDelayInput.parentElement.MaterialTextfield.change();
                    }

                    if (importedSettings.maxDelayOffset !== undefined) {
                        const maxDelaySec = Math.floor(importedSettings.maxDelayOffset / 1000);
                        maxDelayInput.value = maxDelaySec;
                        if (maxDelayInput.parentElement.MaterialTextfield) maxDelayInput.parentElement.MaterialTextfield.change();
                    }

                    // Reset file input so same file can be selected again if needed
                    importSettingsInput.value = '';

                    console.log("AI Self-talk settings imported successfully.");
                    if (typeof displayMessage === 'function') displayMessage("System Message: AI self-talk settings imported successfully. Click Save to apply.", true);

                } catch (error) {
                    console.error("Error parsing imported settings file:", error);
                    if (typeof displayMessage === 'function') displayMessage("System Message: Error importing settings file. Invalid format.", true);
                }
            };
            reader.readAsText(file);
        });
    }

    // --- Clear Settings Logic ---
    if (clearSettingsBtn) {
        clearSettingsBtn.addEventListener('click', async function () {
            if (await confirmSelfTalkAction("Are you sure you want to clear all AI Self-talk settings? This cannot be undone.")) {
                // Clear UI lists
                document.getElementById('selfTalkPromptList').innerHTML = '';
                document.getElementById('systemInstructionList').innerHTML = '';

                // Reset Delays to defaults
                baseDelayInput.value = 15;
                maxDelayInput.value = 40;

                // Update MDL textfield state
                if (baseDelayInput.parentElement.MaterialTextfield) baseDelayInput.parentElement.MaterialTextfield.change();
                if (maxDelayInput.parentElement.MaterialTextfield) maxDelayInput.parentElement.MaterialTextfield.change();

                // Clear State and LocalStorage immediately or just UI? 
                // Suggestion: Clear UI and let user click Save to confirm, OR helper function to clear everything.
                // Based on request "add a clear button for it too to clear the terms", clearing UI is safest first step.
                // However, user might expect immediate clearance. Let's do implicit save or just UI clear.
                // Let's clear the UI and notify user to click Save to persist.
                // Actually, for "Clear", resetting to defaults is usually expected.

                // Let's reset the State vars too, but waiting for Save is better UX to avoid accidental data loss.
                // But the user asked for a clear button.

                console.log("AI Self-talk settings cleared in UI.");
                if (typeof displayMessage === 'function') displayMessage("System Message: Settings cleared. Click Save to confirm.", true);
            }
        });
    }

    console.log("AI Self-talk Settings Handler initialized.");
};
