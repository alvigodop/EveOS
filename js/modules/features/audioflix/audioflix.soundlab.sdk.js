window.EveAudioflixSoundLabSdk = window.EveAudioflixSoundLabSdk || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSdk;
    if (ns.ready) return;

    const SESSION_KEY = 'eveAudioflixSoundLabApiKey';
    let sdkPromise = null;
    let statusPromise = null;
    let credentialStatus = {
        state: 'unknown',
        configured: false,
        message: 'Checking the secure Gemini credential vault...'
    };

    function load() {
        if (window.EveAudioflixGenAI?.GoogleGenAI) return Promise.resolve(window.EveAudioflixGenAI);
        if (sdkPromise) return sdkPromise;
        sdkPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-audioflix-genai-sdk]');
            const script = existing || document.createElement('script');
            const timeout = window.setTimeout(() => reject(new Error('Google GenAI SDK load timed out.')), 15000);
            const finish = () => {
                window.clearTimeout(timeout);
                if (window.EveAudioflixGenAI?.GoogleGenAI) resolve(window.EveAudioflixGenAI);
                else reject(new Error('Google GenAI SDK did not initialize.'));
            };
            script.addEventListener('load', finish, { once: true });
            script.addEventListener('error', () => {
                window.clearTimeout(timeout);
                reject(new Error('Could not load the local Google GenAI SDK bundle.'));
            }, { once: true });
            if (!existing) {
                script.dataset.audioflixGenaiSdk = '1';
                script.src = new URL('js/vendor/audioflix-genai.js?v=2.16.0', document.baseURI).href;
                document.head.appendChild(script);
            }
        }).catch((error) => {
            sdkPromise = null;
            throw error;
        });
        return sdkPromise;
    }

    function getApiKey() {
        try {
            return String(sessionStorage.getItem(SESSION_KEY)
                || localStorage.getItem('geminiApiKey')
                || '').trim();
        } catch {
            return '';
        }
    }

    function setApiKey(value) {
        const key = String(value || '').trim();
        try {
            if (key) sessionStorage.setItem(SESSION_KEY, key);
            else sessionStorage.removeItem(SESSION_KEY);
        } catch {}
        credentialStatus = key ? {
            state: 'direct', configured: true, message: 'Available in this browser tab'
        } : { state: 'unknown', configured: false, message: 'Checking the secure Gemini credential vault...' };
        return !!key;
    }

    function getCredentialStatus() {
        if (getApiKey()) {
            return { state: 'direct', configured: true, message: 'Available in this browser tab' };
        }
        const runtimeState = window.GeminiServerControlRuntime?.stateApi?.state;
        if (runtimeState?.credentialsConfigured === true) {
            return { state: 'vault', configured: true, message: 'Available through the secure Gemini backend' };
        }
        return Object.assign({}, credentialStatus);
    }

    function publishCredentialStatus(next) {
        credentialStatus = Object.assign({}, next);
        window.dispatchEvent(new CustomEvent('eve:sonic-forge-credential-status', {
            detail: Object.assign({}, credentialStatus)
        }));
        return credentialStatus;
    }

    async function refreshCredentialStatus(force) {
        const current = getCredentialStatus();
        if (current.state === 'direct' || (current.configured && force !== true)) {
            return publishCredentialStatus(current);
        }
        if (statusPromise && force !== true) return statusPromise;
        const baseUrl = window.GeminiServerControlRuntime?.stateApi?.state?.baseUrl
            || window.EveOSLocalControl?.baseUrl?.()
            || 'http://127.0.0.1:9082';
        if (!window.GeminiCredentialBridge?.getStatus) {
            return publishCredentialStatus({
                state: 'missing', configured: false,
                message: 'Set a Gemini API key in Search Monitor Session Controls'
            });
        }
        statusPromise = window.GeminiCredentialBridge.getStatus(baseUrl)
            .then((payload) => publishCredentialStatus(payload?.configured ? {
                state: 'vault', configured: true,
                message: 'Available through the secure Gemini backend'
            } : {
                state: 'missing', configured: false,
                message: 'Set a Gemini API key in Search Monitor Session Controls'
            }))
            .catch(() => publishCredentialStatus({
                state: 'offline', configured: false,
                message: 'Start the local Gemini backend or save a key in this tab'
            }))
            .finally(() => { statusPromise = null; });
        return statusPromise;
    }

    Object.assign(ns, {
        ready: true,
        load,
        getApiKey,
        setApiKey,
        getCredentialStatus,
        refreshCredentialStatus
    });
})();
