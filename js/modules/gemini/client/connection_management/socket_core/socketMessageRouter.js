/**
 * socketMessageRouter.js
 * 
 * Routes incoming WebSocket messages to appropriate handlers.
 */

console.log("socketMessageRouter.js loading...");

(function () {
    const State = window.SocketGlobalState;

    async function handleSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Handle application-level pong messages
            if (data.type === "application_pong" || data.message === State.APPLICATION_PONG_MESSAGE) {
                if (typeof handleApplicationPong === 'function') handleApplicationPong();
                return;
            }

            // Handle legacy pong messages (for backward compatibility)
            if (data.pong) {
                console.log("Received legacy pong from server");
                State.lastPongReceived = Date.now();
                return;
            }

            if (data.audio) {
                if (typeof window.handleAudioMessage === 'function') {
                    await window.handleAudioMessage(data);
                } else {
                    console.error("handleAudioMessage not found");
                }
            } else if (data.audio_ack) {
                // Server acknowledged an audio seq received
                try {
                    window._pendingAudioAcks = window._pendingAudioAcks || {};
                    const seq = data.audio_ack;
                    if (window._pendingAudioAcks[seq]) {
                        try { window._pendingAudioAcks[seq](); } catch (e) { }
                        delete window._pendingAudioAcks[seq];
                        console.log('Received audio ACK for seq', seq);
                    } else {
                        console.warn('Received audio ACK for unknown seq', seq);
                    }
                } catch (e) {
                    console.error('Error handling audio_ack', e);
                }
            } else if (data.text) {
                // Mark Gemini API as ready on first text response
                if (!State.geminiApiReady) {
                    State.geminiApiReady = true;
                    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected', 'Connected');
                    if (typeof displayMessage === 'function') {
                        displayMessage("System Message: Gemini API initialized successfully", true);
                    }
                }

                if (data.is_system_message && typeof displayMessage === 'function') {
                    displayMessage(data.text, true);
                    return;
                }

                // History message application logic
                if (data.is_history) {
                    if (typeof historyMessages !== 'undefined' && !historyMessages.has(data.text)) {
                        historyMessages.add(data.text);
                        if (typeof historyMessageOrder !== 'undefined') historyMessageOrder.push(data.text);

                        const messageElement = document.createElement('div');
                        messageElement.className = 'chat-message';

                        if (data.text.startsWith('YOU:')) {
                            messageElement.classList.add('previous-user-message');
                        } else if (data.text.startsWith('GEMINI:')) {
                            messageElement.classList.add('previous-gemini-message');
                        } else {
                            messageElement.classList.add('previous-system-message');
                        }

                        if (data.timestamp) {
                            const timestampElement = document.createElement('div');
                            timestampElement.className = 'message-timestamp';
                            timestampElement.textContent = data.timestamp;
                            messageElement.appendChild(timestampElement);
                        }

                        messageElement.appendChild(document.createTextNode(data.text));

                        const previousConversationContent = document.getElementById('previousConversationContent');
                        if (previousConversationContent) {
                            previousConversationContent.appendChild(messageElement);
                            previousConversationContent.scrollTop = previousConversationContent.scrollHeight;
                        }
                    }
                    return;
                }

                if (typeof showIncomingMessage === 'function') {
                    if (data.is_transcription) {
                        // Pass audio_data only if available.
                        showIncomingMessage(data.text, true, data.audio_data);
                    } else {
                        showIncomingMessage(data.text);
                    }
                }

                const aiSelftalkToggle = document.getElementById('aiSelftalkToggle');
                if (aiSelftalkToggle && aiSelftalkToggle.checked) {
                    console.log("Received message from Gemini, checking if self-talk should be restarted");
                    if (typeof selftalkTimeout !== 'undefined' && selftalkTimeout) {
                        console.log("Clearing existing self-talk timeout after message");
                        clearTimeout(selftalkTimeout);
                        selftalkTimeout = null;
                    }
                    setTimeout(() => {
                        if (aiSelftalkToggle.checked && (typeof selftalkTimeout !== 'undefined' && !selftalkTimeout) && typeof initiateSelftalk === 'function') {
                            console.log("Restarting self-talk after receiving Gemini response");
                            initiateSelftalk();
                        }
                    }, 2000);
                }
            }
        } catch (e) {
            console.error("Error processing message:", e);
        }
    }

    // Export function
    window.handleSocketMessage = handleSocketMessage;

})();

console.log("socketMessageRouter.js loaded.");
