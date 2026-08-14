/**
 * socketMessageRouter.js
 * 
 * Routes incoming WebSocket messages to appropriate handlers.
 */

console.log("socketMessageRouter.js loading...");

(function () {
    const State = window.SocketGlobalState;
    const LIVE_FALLBACK_MARKER = 'eveGeminiLiveFallbackAttempt';

    function pauseReconnectForCredentialError(statusMessage) {
        State.credentialRequired = true;
        State.credentialStatusMessage = statusMessage || 'API Key Required';
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

    function handleCredentialFailure(event, data, messageText) {
        if (!data.is_system_message) return false;
        const failure = window.EveGeminiApiFailure?.classify?.(messageText);
        if (!failure?.credential) return false;
        if (isMessageFromStaleSocket(event)) {
            console.warn('[Gemini] Ignoring credential failure from a stale socket after refresh.');
            return true;
        }
        State.apiPolicyBlocked = !!failure.policyBlocked;
        State.apiKeyInvalid = failure.kind === 'invalid-key';
        pauseReconnectForCredentialError(failure.status);
        if (typeof displayMessage === 'function') {
            displayMessage(`System Message: ${failure.message}`, true);
            if (messageText !== failure.message) displayMessage(data.text, true);
        }
        return true;
    }

    function safeStorageGet(storage, key) {
        try { return String(storage?.getItem?.(key) || ''); }
        catch (error) { return ''; }
    }

    function safeStorageSet(storage, key, value) {
        try {
            storage?.setItem?.(key, String(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    function clearFallbackAttempt() {
        try { window.sessionStorage?.removeItem?.(LIVE_FALLBACK_MARKER); }
        catch (error) { /* session storage is optional */ }
    }

    function pauseReconnectForModelError(statusMessage) {
        State.autoReconnectEnabled = false;
        State.serverOfflinePauseActive = true;
        if (State.reconnectTimeout) {
            clearTimeout(State.reconnectTimeout);
            State.reconnectTimeout = null;
        }
        if (State.continuousReconnectInterval) {
            clearInterval(State.continuousReconnectInterval);
            State.continuousReconnectInterval = null;
        }
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('error', statusMessage || 'Model Unavailable');
        }
    }

    function handleModelAvailabilityFailure(event, data, messageText) {
        if (!data.is_system_message) return false;
        const failure = window.EveGeminiApiFailure?.classify?.(messageText);
        if (failure?.kind !== 'model-unavailable') return false;
        if (isMessageFromStaleSocket(event)) {
            console.warn('[Gemini] Ignoring model failure from a stale socket.');
            return true;
        }

        const registry = window.EveGeminiModelRegistry;
        const stored = safeStorageGet(window.localStorage, 'selectedModel');
        const selected = registry?.resolve?.('live', stored) || stored;
        const fallback = registry?.getFallback?.('live', selected) || '';
        const attempt = fallback ? `${selected}->${fallback}` : '';
        const previousAttempt = safeStorageGet(window.sessionStorage, LIVE_FALLBACK_MARKER);

        if (fallback && previousAttempt !== attempt) {
            safeStorageSet(window.sessionStorage, LIVE_FALLBACK_MARKER, attempt);
            safeStorageSet(window.localStorage, 'selectedModel', fallback);
            const select = document.getElementById('modelSelectSess');
            if (select) select.value = fallback;
            State.apiPolicyBlocked = false;
            State.apiKeyInvalid = false;
            State.credentialRequired = false;
            State.autoReconnectEnabled = true;
            State.serverOfflinePauseActive = false;
            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus('waiting', 'Trying Compatibility Model...');
            }
            if (typeof displayMessage === 'function') {
                displayMessage(
                    `System Message: ${selected} is unavailable for Live. Trying the registered compatibility model ${fallback}.`,
                    true
                );
            }
            return true;
        }

        pauseReconnectForModelError(failure.status);
        if (typeof displayMessage === 'function') {
            displayMessage(`System Message: ${failure.message} Choose another Live model in Session Controls, then reconnect.`, true);
        }
        return true;
    }

    async function handleSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'session_resumption_update') {
                if (data.resumable && data.handle) {
                    window.EveGeminiSessionResumption?.store?.(data.handle);
                } else if (data.resumable === false) {
                    window.EveGeminiSessionResumption?.clear?.();
                }
                return;
            }

            if (data.type === 'session_go_away') {
                const canResume = data.resumeAvailable === true
                    && window.EveGeminiSessionResumption?.markPending?.() === true;
                State.plannedSessionRotation = true;
                State.resumptionFallbackPending = !canResume;
                State.shouldReplayContextAfterReconnect = !canResume;
                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('waiting', canResume
                        ? 'Preparing Gemini Session Resume...'
                        : 'Preparing Fresh Gemini Session...');
                }
                return;
            }

            if (data.type === 'session_resumption_rejected') {
                window.EveGeminiSessionResumption?.clear?.();
                State.plannedSessionRotation = true;
                State.resumptionFallbackPending = true;
                State.shouldReplayContextAfterReconnect = true;
                if (typeof updateConnectionStatus === 'function') {
                    updateConnectionStatus('waiting', 'Starting Fresh Gemini Session...');
                }
                if (data.text && typeof displayMessage === 'function') displayMessage(data.text, true);
                return;
            }

            if (data.type === 'session_ready') {
                State.credentialRequired = false;
                State.apiPolicyBlocked = false;
                State.apiKeyInvalid = false;
                State.credentialStatusMessage = '';
                State.geminiApiReady = true;
                State.plannedSessionRotation = false;
                State.resumptionFallbackPending = false;
                clearFallbackAttempt();
                if (data.resumed === true) {
                    window.EveGeminiSessionResumption?.completeResume?.();
                    State.shouldReplayContextAfterReconnect = false;
                }
                if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected', 'Connected');
                if (data.text && typeof displayMessage === 'function') displayMessage(data.text, true);
                if (data.resumed !== true && typeof window.scheduleGeminiPostReconnectContextReplay === 'function') {
                    window.scheduleGeminiPostReconnectContextReplay('gemini-api-ready');
                }
                return;
            }

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

            if (data.type === 'live_usage') {
                window.EveGeminiUsageTelemetry?.recordLiveUsage?.(data);
                return;
            }

            if (data.type === 'model_migrated') {
                const kind = data.kind === 'text_brain' ? 'textBrain' : 'live';
                const storageKey = kind === 'textBrain' ? 'textBrainModel' : 'selectedModel';
                const resolved = window.EveGeminiModelRegistry?.resolve?.(kind, data.to) || String(data.to || '');
                if (resolved) {
                    try { localStorage.setItem(storageKey, resolved); } catch (error) { /* storage is optional */ }
                    const selectId = kind === 'textBrain' ? 'textBrainModelSelectSess' : 'modelSelectSess';
                    const select = document.getElementById(selectId);
                    if (select) select.value = resolved;
                }
                if (data.text && typeof displayMessage === 'function') displayMessage(data.text, true);
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
                if (handleModelAvailabilityFailure(event, data, messageText)) return;
                // Early-loader compatibility if the central failure classifier was not loaded.
                if (!window.EveGeminiApiFailure && data.is_system_message
                    && /(not found for api version|not supported for bidigeneratecontent|is not found for|preview model issue)/i.test(messageText)) {
                    const DEFAULT_LIVE_MODEL = window.EveGeminiModelRegistry?.defaults?.live
                        || 'gemini-3.1-flash-live-preview';
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
                if (handleCredentialFailure(event, data, messageText)) return;
                const apiReadyMessage = data.is_system_message
                    && /^Connected to (?!server\b)/i.test(messageText);
                if (!State.geminiApiReady && apiReadyMessage) {
                    State.credentialRequired = false;
                    State.apiPolicyBlocked = false;
                    State.apiKeyInvalid = false;
                    State.credentialStatusMessage = '';
                    State.geminiApiReady = true;
                    clearFallbackAttempt();
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
