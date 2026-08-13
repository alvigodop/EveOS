// js/modules/gemini/comm/mm_panel/voice_input/Voice_Input_MM_Commuication_Panel.js
// Manages voice input multimodal communication features

console.log("js/modules/gemini/comm/mm_panel/voice_input/Voice_Input_MM_Commuication_Panel.js started loading");

// Initialize the VoiceInputPanel namespace
window.VoiceInputPanel = window.VoiceInputPanel || {};

// Define the base path for voice input related modules
const VOICE_INPUT_MM_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/mm_panel/voice_input';

// List of voice input related scripts to load
const voiceInputMMScripts = [
    `${VOICE_INPUT_MM_BASE_PATH}/audio_input_operations/voiceMessageSender.js?v=ceaa1f66fae9`,
    `${VOICE_INPUT_MM_BASE_PATH}/audio_capture_processing/audioCapture.js?v=d14f6a9519bf`,
    `${VOICE_INPUT_MM_BASE_PATH}/media_recorder_state/mediaRecorderState.js?v=973b13f71f0d`,
    `${VOICE_INPUT_MM_BASE_PATH}/data_format_converters/base64Converter.js?v=eaff5aa8a0d3`, // Converts base64 strings to ArrayBuffer.
    `${VOICE_INPUT_MM_BASE_PATH}/data_format_converters/pcmConverter.js?v=1bcbedd5c89a`, // Converts PCM audio data to Float32Array.
    `${VOICE_INPUT_MM_BASE_PATH}/voice_input_button_handlers/voiceInputButtonHandler.js?v=5acee2344c52`
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