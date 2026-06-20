/**
 * Handles text input and sending text messages.
 */

window.LogInterfaceDisplay = window.LogInterfaceDisplay || {};
window.LogInterfaceDisplay.MessagingInterface = window.LogInterfaceDisplay.MessagingInterface || {};
window.LogInterfaceDisplay.MessagingInterface.TextInputHandling = window.LogInterfaceDisplay.MessagingInterface.TextInputHandling || {};

/**
 * Initializes the text input field and send button handlers.
 * This should be called after the relevant HTML components are loaded into the DOM.
 */
function initializeTextInputHandlers() {
    console.log('LogInterfaceDisplay.MessagingInterface.TextInputHandling.initializeTextInputHandlers called.');

    const sendButton = document.getElementById('sendButton');
    const textInput = document.getElementById('textInput');

    if (!sendButton) {
        console.error("Send button not found. Text input handler not fully initialized.");
        // Return or handle the error appropriately
        return;
    }

    if (!textInput) {
        console.error("Text input field not found. Text input handler not fully initialized.");
        // Return or handle the error appropriately
        return;
    }

    if (sendButton.dataset.geminiTextInputBound === '1'
        && textInput.dataset.geminiTextInputBound === '1') {
        window.LogInterfaceDisplay?.MessagingInterface?.ImageAttachments?.bind?.(textInput);
        return;
    }

    const sendCurrentText = function () {
        const text = textInput.value.trim();
        const attachmentsApi = window.LogInterfaceDisplay?.MessagingInterface?.ImageAttachments;
        const hasAttachments = !!attachmentsApi?.hasAttachments?.();
        if (text || hasAttachments) {
            // Stop audio if "Barge-in" is enabled
            if (localStorage.getItem('stopAudioOnInput') === 'true' && typeof stopAllAudioPlayback === 'function') {
                stopAllAudioPlayback();
            }

            const attachments = hasAttachments ? attachmentsApi.consume() : [];
            const imageLabel = attachments.length
                ? ` ${attachments.length} image${attachments.length === 1 ? '' : 's'}`
                : '';
            const displayText = text || '[Image attachment]';

            // Display user message in the chat log
            // displayMessage is expected to be globally available
            if (typeof window.displayMessage === 'function') {
                window.displayMessage(`YOU:${imageLabel ? imageLabel + ' -' : ''} ${displayText}`);
            } else {
                console.error("displayMessage function not found in textInputHandler");
            }

            // Mode 2 is text-only: route plain typed turns through the long-context
            // text brain, then let Live speak the brain's reply. Image attachments
            // still go direct so the live multimodal path can see them.
            if (!hasAttachments && window.EveGeminiMode2?.isMode2?.()) {
                window.EveGeminiMode2.relayUserUtterance(text);
            } else if (typeof window.sendTextMessage === 'function') {
                window.sendTextMessage(text || 'Please analyze the attached image.', false, { attachments });
            } else {
                console.error("sendTextMessage function not found in textInputHandler");
            }

            // Clear the input field
            textInput.value = '';
        }
    };

    // Attach click listener to send button
    if (sendButton.dataset.geminiTextInputBound !== '1') {
        sendButton.dataset.geminiTextInputBound = '1';
        sendButton.addEventListener('click', sendCurrentText);
    }

    if (textInput.dataset.geminiTextInputBound !== '1') {
        textInput.dataset.geminiTextInputBound = '1';
        window.LogInterfaceDisplay?.MessagingInterface?.ImageAttachments?.bind?.(textInput);
        textInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendCurrentText();
            }
        });
    }

    console.log('Text input and send button handlers initialized.');
}

// Expose the initialization function via the namespace
window.LogInterfaceDisplay.MessagingInterface.TextInputHandling.initializeTextInputHandlers = initializeTextInputHandlers;
