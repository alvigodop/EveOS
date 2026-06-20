(function () {
    'use strict';

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

        if (window.SocketGlobalState) {
            window.SocketGlobalState.credentialRequired = false;
            window.SocketGlobalState.apiPolicyBlocked = false;
            window.SocketGlobalState.apiKeyInvalid = false;
            window.SocketGlobalState.geminiApiReady = false;
            window.SocketGlobalState.reconnectAttempts = 0;
            window.SocketGlobalState.resetState?.();
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
