// Audio Worklet Components HTML Loaders
// This module coordinates the loading of all audio worklet component HTML loaders

// Base path for audio worklet components HTML loaders
const AUDIO_WORKLET_COMPONENTS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/audio_worklet/';

// Audio worklet components HTML loader scripts
const audioWorkletComponentsScripts = [
    'pcm_proc/pcmProcessorScriptUILoader.js'
];

// Function to load audio worklet components HTML loader scripts with error protection
async function loadAudioWorkletComponentsHTMLLoaders() {
    if (!audioWorkletComponentsScripts || audioWorkletComponentsScripts.length === 0) {
        console.warn('[Audio Worklet Components HTML Loaders] No scripts to load');
        return;
    }

    const loadPromises = audioWorkletComponentsScripts.map(async (scriptPath) => {
        try {
            const fullPath = AUDIO_WORKLET_COMPONENTS_BASE_PATH + scriptPath;

            // Create and configure script element
            const script = document.createElement('script');
            script.src = fullPath;
            script.defer = true;

            // Return a promise that resolves when script loads
            return new Promise((resolve, reject) => {
                script.onload = () => {
                    console.log(`[Audio Worklet Components HTML Loaders] Successfully loaded: ${scriptPath}`);
                    resolve();
                };
                script.onerror = () => {
                    console.error(`[Audio Worklet Components HTML Loaders] Failed to load: ${scriptPath}`);
                    reject(new Error(`Failed to load script: ${scriptPath}`));
                };
                document.head.appendChild(script);
            });

        } catch (error) {
            console.error(`[Audio Worklet Components HTML Loaders] Error loading ${scriptPath}:`, error);
            throw error;
        }
    });

    try {
        await Promise.all(loadPromises);
        console.log('[Audio Worklet Components HTML Loaders] All audio worklet components HTML loader scripts loaded successfully');
    } catch (error) {
        console.error('[Audio Worklet Components HTML Loaders] Error loading some audio worklet components HTML loader scripts:', error);
        throw error;
    }
}

// Expose the loading function globally
window.loadAudioWorkletComponentsHTMLLoaders = loadAudioWorkletComponentsHTMLLoaders; 