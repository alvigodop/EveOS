/**
 * socketMessageRouter.js
 * 
 * Routes incoming WebSocket messages to appropriate handlers.
 */

console.log("socketMessageRouter.js loading...");

(function () {
    const State = window.SocketGlobalState;

    function pauseReconnectForCredentialError(statusMessage) {
        State.credentialRequired = true;
        State.geminiApiReady = false;
        State.autoReconnectEnabled = false;
        State.serverOfflinePauseActive = true;
        if (State.reconnectTimeout) {
            clearTimeout(State.reconnectTimeout);
            State.reconnectTimeout = null;
        }
        if (State.continuousReconnectInterval) {
            clearTimeout(State.continuousReconnectInterval);
            State.continuousReconnectInterval = null;
        }
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('error', statusMessage || 'API Key Required');
        }
    }

    function isMessageFromStaleSocket(event) {
        const source = event?.currentTarget || event?.target || null;
        return !!source && !!window.webSocket && source !== window.webSocket;
    }

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
                const messageText = String(data.text || '').trim();
                if (data.is_system_message
                    && /(api key not valid|invalid api key|please pass a valid api key)/i.test(messageText)) {
                    if (isMessageFromStaleSocket(event)) {
                        console.warn('[Gemini] Ignoring invalid-key message from a stale socket after credential refresh.');
                        return;
                    }
                    State.apiPolicyBlocked = false;
                    State.apiKeyInvalid = true;
                    pauseReconnectForCredentialError('API Key Invalid');
                    if (typeof displayMessage === 'function') {
                        displayMessage('System Message: Gemini rejected the saved API key as invalid. Save a valid Gemini API key in Session Controls, then start/reconnect Gemini.', true);
                        displayMessage(data.text, true);
                    }
                    return;
                }
                // Self-heal a dead / unsupported MODEL (distinct from a key restriction).
                // Google retires preview Live models over time; a stale localStorage
                // selection then fails forever with 1008 "not found / not supported for
                // bidiGenerateContent". Reset to the known-good default and let reconnect
                // proceed. Future-proof: matches the failure, not a hardcoded model list.
                if (data.is_system_message
                    && /(not found for api version|not supported for bidigeneratecontent|is not found for|preview model issue)/i.test(messageText)) {
                    const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest';
                    let stale = '';
                    try { stale = localStorage.getItem('selectedModel') || ''; } catch (e) { stale = ''; }
                    if (stale && stale !== DEFAULT_LIVE_MODEL) {
                        try { localStorage.setItem('selectedModel', DEFAULT_LIVE_MODEL); } catch (e) { /* ignore */ }
                        try { const sel = document.getElementById('modelSelectSess'); if (sel) sel.value = DEFAULT_LIVE_MODEL; } catch (e) { /* ignore */ }
                        State.apiPolicyBlocked = false;
                        State.apiKeyInvalid = false;
                        if (typeof displayMessage === 'function') {
                            displayMessage(`System Message: The selected Gemini model "${stale}" is no longer available for Live. Reset to ${DEFAULT_LIVE_MODEL} — reconnecting with the working model.`, true);
                        }
                        return; // do NOT pause reconnect; next attempt uses the good model
                    }
                    // Already on the default and still failing -> fall through to generic handling.
                }
                if (data.is_system_message
                    && /(1008|policy violation|unrestricted keys|temporary service disruptions)/i.test(messageText)) {
                    State.apiPolicyBlocked = true;
                    State.apiKeyInvalid = false;
                    pauseReconnectForCredentialError('API Key Restricted');
                    if (typeof displayMessage === 'function') {
                        displayMessage('System Message: Gemini Live rejected the current API key restrictions. Update the key allowlist for this network/IP, or save a compatible Gemini key and reconnect.', true);
                        displayMessage(data.text, true);
                    }
                    return;
                }
                if (data.is_system_message && /^Error: No API key configured/i.test(messageText)) {
                    State.apiPolicyBlocked = false;
                    State.apiKeyInvalid = false;
                    pauseReconnectForCredentialError('API Key Required');
                    if (typeof displayMessage === 'function') {
                        displayMessage(data.text, true);
                    }
                    return;
                }
                const apiReadyMessage = data.is_system_message
                    && /^Connected to (?!server\b)/i.test(messageText);
                if (!State.geminiApiReady && apiReadyMessage) {
                    State.credentialRequired = false;
                    State.apiPolicyBlocked = false;
                    State.apiKeyInvalid = false;
                    State.geminiApiReady = true;
                    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected', 'Connected');
                    if (typeof displayMessage === 'function') {
                        displayMessage("System Message: Gemini API initialized successfully", true);
                    }
                    if (typeof window.scheduleGeminiPostReconnectContextReplay === 'function') {
                        window.scheduleGeminiPostReconnectContextReplay('gemini-api-ready');
                    }
                } else if (!State.geminiApiReady
                    && data.is_system_message
                    && /^Connecting to Gemini API/i.test(messageText)
                    && typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('connecting', 'Initializing Gemini API...');
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
