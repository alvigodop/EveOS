/**
 * audioIngestLoader.js
 * Dynamically loads the modularized audio ingestion scripts.
 */

console.log("audioIngestLoader.js loading...");

const AUDIO_INGEST_CORE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/audio_proc/playback_proc/audio_injest_core';

const audioIngestScripts = [
    `${AUDIO_INGEST_CORE_PATH}/sequentialIngestHandler.js`,
    `${AUDIO_INGEST_CORE_PATH}/interimIngestHandler.js`,
    `${AUDIO_INGEST_CORE_PATH}/workletIngestHandler.js`,
    `${AUDIO_INGEST_CORE_PATH}/errorRecoveryHandler.js`,
    `${AUDIO_INGEST_CORE_PATH}/ingestCoordinator.js`
];

function loadAudioIngestScripts() {
    const fragment = document.createDocumentFragment();
    audioIngestScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

loadAudioIngestScripts();

console.log("audioIngestLoader.js finished.");
