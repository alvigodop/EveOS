(function () {
    'use strict';

    const STATUS_PATH = '/api/gemini-credentials/status';
    const SAVE_PATH = '/api/gemini-credentials';
    let lastSyncedKey = '';

    function getSavedBrowserKey() {
        try {
            return String(localStorage.getItem('geminiApiKey') || '').trim();
        } catch (error) {
            return '';
        }
    }

    async function fetchJson(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = window.setTimeout(function () {
            controller.abort();
        }, timeoutMs || 1800);
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                ...options,
                signal: controller.signal
            });
            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok) {
                throw new Error(payload.message || `Credential request failed (${response.status})`);
            }
            return payload;
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function getStatus(baseUrl) {
        if (!baseUrl) return { ok: false, configured: false };
        return fetchJson(`${baseUrl}${STATUS_PATH}`, null, 1200);
    }

    async function save(baseUrl, apiKey) {
        const normalizedKey = String(apiKey || '').trim();
        if (!baseUrl || !normalizedKey) {
            throw new Error('Enter a Gemini API key before saving.');
        }
        const payload = await fetchJson(`${baseUrl}${SAVE_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: normalizedKey })
        }, 2500);
        if (payload.configured) {
            lastSyncedKey = normalizedKey;
            try {
                localStorage.removeItem('geminiApiKey');
            } catch (error) {
                // The encrypted server vault is still the durable credential source.
            }
        }
        return payload;
    }

    async function sync(baseUrl, options) {
        const apiKey = String(options?.apiKey || getSavedBrowserKey()).trim();
        if (!baseUrl || !apiKey) {
            return getStatus(baseUrl);
        }
        if (!options?.force && apiKey === lastSyncedKey) {
            return { ok: true, configured: true, cached: true };
        }
        return save(baseUrl, apiKey);
    }

    window.GeminiCredentialBridge = {
        getStatus,
        save,
        sync,
        hasBrowserKey: function () {
            return !!getSavedBrowserKey();
        }
    };
})();
