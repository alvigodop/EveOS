/**
 * socketAudioLogic.js
 * 
 * Handles business logic for audio messages received from the WebSocket.
 * Delegates UI creation to ensureAudioPlayerUI (global).
 */

console.log("socketAudioLogic.js loading...");

(function () {

    async function handleAudioMessage(data) {
        // Mark Gemini API as ready on first audio response
        if (window.SocketGlobalState && !window.SocketGlobalState.geminiApiReady) {
            window.SocketGlobalState.geminiApiReady = true;
            if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected', 'Connected');
            // Removed synchronous displayMessage to prevent initial audio clipping/lag
        }

        if (typeof playProcessedAudio !== 'undefined' && !playProcessedAudio) {
            console.log("Audio processing disabled by main toggle: skipping auto processing");
            // Ensure UI is explicitly created even if processing is disabled
            if (typeof ensureAudioPlayerUI === 'function') {
                ensureAudioPlayerUI(data.audio || data.audio_data);
            } else {
                console.warn("ensureAudioPlayerUI not found!");
            }
            return;
        }

        console.log("Received audio data");
        const isCompleteAudio = data.is_transcription === true && data.audio_data;
        const isSequential = data.sequential === true;

        // *** ENHANCED AUDIO LOGIC: Allow interim audio even with sequential enabled ***
        // Check if this is interim audio and if interim playback is disabled
        const isInterimAudio = !isCompleteAudio;
        const interimAudioDisabled = (typeof playInterimAudio !== 'undefined' && !playInterimAudio);

        if (isInterimAudio && interimAudioDisabled) {
            console.log("Skipping interim audio chunk (playInterimAudio is disabled by user setting)");
            if (typeof ensureAudioPlayerUI === 'function') {
                ensureAudioPlayerUI(data.audio || data.audio_data);
            }
            return;
        }

        // *** IMPROVED SEQUENTIAL AUDIO HANDLING ***
        // Sequential audio can now coexist with interim audio
        const audioData = data.audio || data.audio_data; // Support both interim and complete keys
        if (audioData) {
            window.dispatchEvent(new CustomEvent('eve:gemini-audio-output', {
                detail: {
                    kind: isCompleteAudio ? 'complete' : 'interim',
                    sequential: isSequential,
                    chars: String(audioData || '').length,
                    at: Date.now()
                }
            }));
        }

        // **KEY FIX**: Ensure UI is created UNCONDITIONALLY
        if (typeof ensureAudioPlayerUI === 'function') {
            ensureAudioPlayerUI(audioData);
        } else {
            console.error("ensureAudioPlayerUI missing! Cannot update UI.");
        }

        const shouldAutoPlay = (isCompleteAudio && (typeof playProcessedAudio !== 'undefined' && playProcessedAudio)) ||
            (isInterimAudio && (typeof playInterimAudio !== 'undefined' && playInterimAudio)) ||
            (typeof autoAudioPlay !== 'undefined' && autoAudioPlay);

        async function ensurePlaybackReady() {
            if (window.AudioProcessingControlsAgentic?.ensureAudioContextReady) {
                return await window.AudioProcessingControlsAgentic.ensureAudioContextReady();
            }
            if (window.audioInputContext?.state === 'suspended') {
                await window.audioInputContext.resume();
            }
            return true;
        }

        async function playWithRecovery(chunk, finalAudio) {
            const ready = await ensurePlaybackReady();
            if (!ready) {
                if (typeof displayMessage === 'function') {
                    displayMessage('System Message: Gemini audio is queued until the page receives an audio-unlock click/key press.', true);
                }
                return;
            }
            try {
                await injestAudioChuckToPlay(chunk, finalAudio);
            } catch (error) {
                console.warn('[socketAudioLogic] Audio ingest failed; rebuilding audio context once:', error);
                try {
                    if (window.AudioContextState) {
                        window.AudioContextState.audioContextInitialized = false;
                        window.AudioContextState.audioInputContext = null;
                    }
                    window.audioInputContext = null;
                    await ensurePlaybackReady();
                    await injestAudioChuckToPlay(chunk, finalAudio);
                } catch (retryError) {
                    console.error('[socketAudioLogic] Audio retry failed:', retryError);
                    if (typeof displayMessage === 'function') {
                        displayMessage('System Message: Gemini audio playback failed after retry; use the visible player controls for this response.', true);
                    }
                }
            }
        }

        if (shouldAutoPlay && typeof injestAudioChuckToPlay === 'function') {
            if (audioData) {
                console.log(`Auto-playing ${isInterimAudio ? 'interim' : 'complete'} audio chunk`);
                await playWithRecovery(audioData, isCompleteAudio);
            } else {
                console.warn("[socketAudioLogic] shouldAutoPlay is true but audioData is missing/empty.");
            }
        } else {
            console.log('Skipping ' + (isCompleteAudio ? 'final processed' : 'interim') + ' audio chunk (auto-play disabled or injestor missing)');
            // UI is already created by ensureAudioPlayerUI above
        }
    }

    // Export function
    window.handleAudioMessage = handleAudioMessage;

})();

console.log("socketAudioLogic.js loaded.");
