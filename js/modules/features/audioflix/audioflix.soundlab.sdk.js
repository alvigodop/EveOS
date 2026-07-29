window.EveAudioflixSoundLabSdk = window.EveAudioflixSoundLabSdk || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabSdk;
    if (ns.ready) return;

    const SESSION_KEY = 'eveAudioflixSoundLabApiKey';
    let sdkPromise = null;

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
                script.src = new URL('js/vendor/audioflix-genai.js?v=2.13.0', document.baseURI).href;
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
        return !!key;
    }

    Object.assign(ns, { ready: true, load, getApiKey, setApiKey });
})();
