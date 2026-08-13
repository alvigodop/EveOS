/**
 * base64PlayerLoader.js
 * Dynamically loads the modularized base64 player scripts.
 */

console.log("base64PlayerLoader.js loading...");

const BASE64_PLAYER_CORE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/audio_proc/audio_playback_core/base64_player_core';

const base64PlayerScripts = [
    `${BASE64_PLAYER_CORE_PATH}/playerStateManagement.js?v=482e9501b050`,
    `${BASE64_PLAYER_CORE_PATH}/audioBufferHandler.js?v=ab9daccbc8d2`,
    `${BASE64_PLAYER_CORE_PATH}/playbackLifecycleHandler.js?v=565af5c8690c`,
    `${BASE64_PLAYER_CORE_PATH}/base64PlayerCoordinator.js?v=b5b50c9b309e`
];

function loadBase64PlayerScripts() {
    const fragment = document.createDocumentFragment();
    base64PlayerScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

loadBase64PlayerScripts();

console.log("base64PlayerLoader.js finished.");
