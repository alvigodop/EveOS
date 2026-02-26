// js/modules/gemini/comm/mm_panel/voice_input/Voice_Input_MM_Commuication_Panel.js
// Manages voice input multimodal communication features

console.log("js/modules/gemini/comm/mm_panel/voice_input/Voice_Input_MM_Commuication_Panel.js started loading");

// Initialize the VoiceInputPanel namespace
window.VoiceInputPanel = window.VoiceInputPanel || {};

// Define the base path for voice input related modules
const VOICE_INPUT_MM_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/mm_panel/voice_input';

// List of voice input related scripts to load
const voiceInputMMScripts = [
    `${VOICE_INPUT_MM_BASE_PATH}/audio_input_operations/voiceMessageSender.js`,
    `${VOICE_INPUT_MM_BASE_PATH}/audio_capture_processing/audioCapture.js`,
    `${VOICE_INPUT_MM_BASE_PATH}/media_recorder_state/mediaRecorderState.js`,
    `${VOICE_INPUT_MM_BASE_PATH}/data_format_converters/base64Converter.js`, // Converts base64 strings to ArrayBuffer.
    `${VOICE_INPUT_MM_BASE_PATH}/data_format_converters/pcmConverter.js`, // Converts PCM audio data to Float32Array.
    `${VOICE_INPUT_MM_BASE_PATH}/voice_input_button_handlers/voiceInputButtonHandler.js`
];

// Function to load all voice input related scripts
function loadVoiceInputMMScripts() {
    const fragment = document.createDocumentFragment();
    voiceInputMMScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Initialize voice input features
loadVoiceInputMMScripts(); 