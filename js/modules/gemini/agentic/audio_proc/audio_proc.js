// js/modules/gemini/Agentic_js_Functions/Audio_Processing_Controls_Agentic/Audio_Processing_Controls_Agentic.js
// Manages and loads all audio processing control related functionality

console.log("js/modules/gemini/Agentic_js_Functions/Audio_Processing_Controls_Agentic/Audio_Processing_Controls_Agentic.js started loading");

// Base path for audio processing scripts
const AUDIO_PROCESSING_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/audio_proc';

// List of audio processing scripts to load
const audioProcessingScripts = [
    // Core Audio Playback
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_core/audioContainerHelper.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_core/audioContextInitializer.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_core/audioSourceConfigurator.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_core/base64_player_core/base64PlayerLoader.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_fallback/fallback_core/wavEncoder.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_fallback/fallback_core/html5AudioFallback.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_fallback/fallback_core/webAudioFallback.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_playback_fallback/fallback_core/fallbackAudioCoordinator.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/playback_ctrl/audioPlaybackStopper.js`,

    // Audio Context and Buffer Management
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/audioContextState.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/audioWorkletProcessor.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/iOSAudioUnlock.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/user_gesture_core/userGestureLoader.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/audioContextHelpers.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/initialization_modules/audioWorkletInitializer.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/initialization_modules/legacyAudioInitializer.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/audioContextCoreInit.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/audioContextReadiness.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/context_mgmt/containerContextFactory.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/buffer_mgmt/audioBufferCreator.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/playback_settings/sequentialAudioPlayState.js`,

    // Audio Processing and Queue Management
    `${AUDIO_PROCESSING_BASE_PATH}/playback_proc/audio_injest_core/audioIngestLoader.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/queue_mgmt/audioQueueStore.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/queue_mgmt/queue_core/queueItemSelector.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/queue_mgmt/queue_core/queueUIManager.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/queue_mgmt/queue_core/queuePlaybackExecutor.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/queue_mgmt/queue_core/queueCompletionHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/queue_mgmt/queue_core/queueProcessor.js`,

    // Audio Progress UI
    `${AUDIO_PROCESSING_BASE_PATH}/audio_progress_ui/audioProgressTracker.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/audio_progress_ui/audioProgressUpdater.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/progress_updater/directProgressBarUpdater.js`,

    // Audio Seeking and Settings
    `${AUDIO_PROCESSING_BASE_PATH}/seek_ops/audioSeeker.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/settings_dialog/audioSettingsDialogHandler.js`,

    // Audio Processing Preferences and Toggles
    `${AUDIO_PROCESSING_BASE_PATH}/audio_preferences/audioProcessingPreferencesHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/auto_play_toggle/autoAudioPlayToggleHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/seq_play_toggle/sequentialAudioPlayToggleHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/interim_audio_toggle/interimAudioToggleHandler.js`,

    // Speech Recognition (Client-Side)
    `${AUDIO_PROCESSING_BASE_PATH}/speech_recognition/speechRecognitionHandler.js`,

    // Voice Settings and Controls
    `${AUDIO_PROCESSING_BASE_PATH}/voice_announcements_handler/voiceAnnouncementsHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/voice_selection_handler/voiceSelectionHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/voice_operations/voiceAnnouncementTester.js`,

    // Transcription Mode Settings
    `${AUDIO_PROCESSING_BASE_PATH}/transcription_mode_settings/transcriptionModeState.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/transcription_mode_settings/transcriptionModeToggleHandler.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/inline_transcription/transcriptionSystemInstructions.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/inline_transcription/transcriptionBoxParser.js`,
    `${AUDIO_PROCESSING_BASE_PATH}/inline_transcription/transcriptionTagHandler.js`
];

// Function to load all audio processing scripts
function loadAudioProcessingScripts() {
    const fragment = document.createDocumentFragment();
    audioProcessingScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Function to initialize the audio processing module
function initializeAudioProcessingModule() {
    // Add any initialization code here if needed
    console.log('Audio Processing Controls module initialized');
}

// Load all audio processing scripts
loadAudioProcessingScripts();

// Initialize the module
initializeAudioProcessingModule();

// Export audio processing related functions for global use
window.AudioProcessingControlsAgentic = {
    // Core Audio Functions
    playAudio: null,                // Will be defined by base64AudioPlayer.js
    stopAudio: null,                // Will be defined by audioPlaybackStopper.js
    seekAudio: null,                // Will be defined by audioSeeker.js
    updateAudioProgress: null,      // Will be defined by audioProgressUpdater.js
    processAudioChunk: null,        // Will be defined by audioChunkInjestor.js
    queueAudio: null,               // Will be defined by audioQueueManager.js

    // Audio State Management
    isSequentialPlaybackEnabled: null, // Will be defined by sequentialAudioPlayState.js
    isAutoPlayEnabled: null,        // Will be defined by autoAudioPlayToggleHandler.js
    audioContext: null,             // Will be defined by audioContextManager.js
    createAudioBuffer: null,        // Will be defined by audioBufferCreator.js

    // Voice Control Functions
    isVoiceAnnouncementsEnabled: null, // Will be defined by voiceAnnouncementsHandler.js
    restoreVoiceSelection: null,    // Will be defined by voiceSelectionHandler.js
    saveVoiceAndReinitialize: null  // Will be defined by voiceSelectionHandler.js
}; 