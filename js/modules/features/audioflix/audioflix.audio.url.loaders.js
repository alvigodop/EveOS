// Provider SDK script loaders for Audioflix URL playback (YouTube IFrame API, SoundCloud,
// Vimeo). Split out of audioflix.audio.url.js to keep that controller under the project line
// cap. These are provider-agnostic, deduped script injectors — each URL loads at most once and
// a failed load is retryable (the pending promise is dropped on rejection).
window.EveAudioflixUrlLoaders = window.EveAudioflixUrlLoaders || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUrlLoaders;
    if (ns.ready) return;

    const SCRIPT_TIMEOUT_MS = 12000;
    const scriptLoads = new Map();

    // Inject a provider SDK <script> and resolve once readyCheck() passes (some SDKs signal
    // readiness asynchronously after the load event, so poll as well).
    function loadScript(src, readyCheck) {
        if (readyCheck()) return Promise.resolve();
        if (scriptLoads.has(src)) return scriptLoads.get(src);
        const promise = new Promise((resolve, reject) => {
            const existing = [...document.scripts].find((script) => script.src === src);
            const script = existing || Object.assign(document.createElement('script'), { src, async: true });
            let poll = 0;
            const cleanup = () => { clearTimeout(timer); if (poll) clearInterval(poll); };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Provider player timed out while loading.'));
            }, SCRIPT_TIMEOUT_MS);
            const finish = () => {
                if (!readyCheck()) return;
                cleanup();
                resolve();
            };
            script.addEventListener('load', finish, { once: true });
            script.addEventListener('error', () => {
                cleanup();
                reject(new Error('Provider player script could not load.'));
            }, { once: true });
            if (!existing) document.head.appendChild(script);
            poll = setInterval(finish, 50);
        });
        scriptLoads.set(src, promise);
        promise.catch(() => scriptLoads.delete(src));
        return promise;
    }

    // The YouTube IFrame API signals readiness through a single global callback, so it needs its
    // own loader that chains any previously registered onYouTubeIframeAPIReady.
    function loadYouTubeApi() {
        if (window.YT?.Player) return Promise.resolve();
        const src = 'https://www.youtube.com/iframe_api';
        if (scriptLoads.has(src)) return scriptLoads.get(src);
        const promise = new Promise((resolve, reject) => {
            const previous = window.onYouTubeIframeAPIReady;
            const timer = setTimeout(() => reject(new Error('YouTube player timed out while loading.')), SCRIPT_TIMEOUT_MS);
            window.onYouTubeIframeAPIReady = function () {
                try { previous?.(); } catch { }
                clearTimeout(timer);
                resolve();
            };
            const existing = [...document.scripts].find((script) => script.src === src);
            if (existing) return;
            const script = Object.assign(document.createElement('script'), { src, async: true });
            script.onerror = () => {
                clearTimeout(timer);
                reject(new Error('YouTube player script could not load.'));
            };
            document.head.appendChild(script);
        });
        scriptLoads.set(src, promise);
        promise.catch(() => scriptLoads.delete(src));
        return promise;
    }

    Object.assign(ns, { ready: true, loadScript, loadYouTubeApi });
})();
