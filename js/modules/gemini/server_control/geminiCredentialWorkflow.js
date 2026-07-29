(function () {
    'use strict';

    function markCredentialRefreshInProgress() {
        try {
            localStorage.setItem('geminiServerDesiredState', 'running');
            localStorage.setItem('geminiConnectionEnabled', 'true');
            localStorage.removeItem('geminiServerManualStopAt');
        } catch (error) {
            // Runtime state below still keeps the current browser honest.
        }

        const state = window.SocketGlobalState;
        if (!state) return;
        state.credentialRequired = false;
        state.apiPolicyBlocked = false;
        state.apiKeyInvalid = false;
        state.geminiApiReady = false;
        state.autoReconnectEnabled = true;
        state.serverOfflinePauseActive = false;
        state.reconnectAttempts = 0;
        state.lastReconnectPauseNoticeAt = 0;
        state.lastCredentialSavedAt = Date.now();
    }

    async function saveCredentials(apiKey) {
        const normalizedKey = String(apiKey || '').trim();
        if (!normalizedKey) {
            throw new Error('Enter a Gemini API key before saving.');
        }

        const control = window.GeminiServerControl;
        if (!control?.syncCredentials) {
            throw new Error('The EveOS credential service is unavailable.');
        }
        const payload = await control.syncCredentials({
            force: true,
            apiKey: normalizedKey
        });
        if (!payload?.configured) {
            throw new Error(payload?.message || 'Gemini credentials could not be saved.');
        }

        try {
            localStorage.removeItem('geminiApiKey');
        } catch (error) {
            // The secure vault is now the durable source; restricted storage should not block reconnect.
        }
        try {
            // The vault stays authoritative. This tab-scoped handoff lets Sonic Forge reuse the
            // credential without writing it into Audioflix state or a datapack backup.
            sessionStorage.setItem('eveAudioflixSoundLabApiKey', normalizedKey);
            window.EveAudioflixSoundLabEngine?.setApiKey?.(normalizedKey);
        } catch (error) {
            // A restricted session store must not invalidate the already-saved Gemini credential.
        }

        markCredentialRefreshInProgress();
        if (window.SocketGlobalState) {
            window.SocketGlobalState.resetState?.();
            markCredentialRefreshInProgress();
        }
        if (window.webSocket && window.webSocket.readyState < WebSocket.CLOSING) {
            try {
                window.webSocket.close(1000, 'Gemini credentials updated');
            } catch (error) {
                // The controller reconciliation below still recovers the client.
            }
        }
        window.setTimeout(function () {
            control.reconcileClientConnection?.();
            window.SocketConnectionCore?.startAutoReconnect?.();
        }, 250);
        window.dispatchEvent(new CustomEvent('eve:gemini-credentials-saved', {
            detail: { configured: true }
        }));
        return payload;
    }

    window.GeminiCredentialWorkflow = { saveCredentials };
    if (window.GeminiServerControl) {
        window.GeminiServerControl.saveCredentials = saveCredentials;
    }
})();
