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
        return;
    }

    const sendCurrentText = function () {
        const text = textInput.value.trim();
        if (text) {
            // Stop audio if "Barge-in" is enabled
            if (localStorage.getItem('stopAudioOnInput') === 'true' && typeof stopAllAudioPlayback === 'function') {
                stopAllAudioPlayback();
            }

            // Display user message in the chat log
            // displayMessage is expected to be globally available
            if (typeof window.displayMessage === 'function') {
                window.displayMessage("YOU: " + text);
            } else {
                console.error("displayMessage function not found in textInputHandler");
            }

            // Send message to server
            // sendTextMessage is expected to be globally available
            if (typeof window.sendTextMessage === 'function') {
                window.sendTextMessage(text);
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
