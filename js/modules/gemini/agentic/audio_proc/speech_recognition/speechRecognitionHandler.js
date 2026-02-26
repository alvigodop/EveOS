
/**
 * SpeechRecognitionHandler.js
 * 
 * Manages client-side speech recognition using the Web Speech API.
 * This provides real-time transcription of user speech without server latency.
 */

if (!window.AudioProcessingControlsAgentic) {
    window.AudioProcessingControlsAgentic = {};
}

// Ensure namespace exists
if (!window.AudioProcessingControlsAgentic.SpeechRecognitionHandler) {
    window.AudioProcessingControlsAgentic.SpeechRecognitionHandler = (function () {

        let recognition = null;
        let isRecognizing = false;
        let finalTranscript = '';
        let interimTranscript = '';

        // Configuration
        const config = {
            lang: 'en-US',
            continuous: true,
            interimResults: true
        };

        /**
         * Initialize the speech recognition engine
         */
        function initialize() {
            if ('webkitSpeechRecognition' in window) {
                recognition = new webkitSpeechRecognition();
            } else if ('SpeechRecognition' in window) {
                recognition = new SpeechRecognition();
            } else {
                console.warn("[SpeechRecognition] Web Speech API not supported in this browser.");
                return false;
            }

            recognition.continuous = config.continuous;
            recognition.interimResults = config.interimResults;
            recognition.lang = config.lang;

            recognition.onstart = function () {
                isRecognizing = true;
                console.log("[SpeechRecognition] Started");
                // Clear previous transcription UI if needed
            };

            recognition.onerror = function (event) {
                console.error("[SpeechRecognition] Error:", event.error);
                if (event.error === 'no-speech') {
                    // Ignore no-speech errors usually
                }
            };

            recognition.onend = function () {
                isRecognizing = false;
                console.log("[SpeechRecognition] Ended");
                // If we were supposed to be recording, maybe restart? 
                // For now, we rely on the external controller to stop/start.
            };

            recognition.onresult = function (event) {
                interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                        console.log("[SpeechRecognition] Final:", finalTranscript);
                        // Here we would send the final text to the UI
                        updateTranscriptionUI(finalTranscript, true);
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (interimTranscript) {
                    // Update UI with interim results
                    updateTranscriptionUI(finalTranscript + interimTranscript, false);
                }
            };

            return true;
        }

        /**
         * Start recognition
         */
        function start() {
            if (recognition && !isRecognizing) {
                finalTranscript = ''; // Reset for new turn
                interimTranscript = '';
                try {
                    recognition.start();
                } catch (e) {
                    console.warn("[SpeechRecognition] Start failed (maybe already running):", e);
                }
            }
        }

        /**
         * Stop recognition
         */
        function stop() {
            if (recognition && isRecognizing) {
                recognition.stop();
            }
        }

        /**
         * Update the UI with the transcribed text.
         * Looks for an element with ID 'transcription-box' or creates/finds a suitable container.
         */
        function updateTranscriptionUI(text, isFinal) {
            // Find the transcription box - assuming standard ID from previous implementation or creating one
            // Ideally this ID should be configurable or standard in the project
            let displayElement = document.getElementById('user-transcription-display');

            if (!displayElement) {
                // If it doesn't exist, try to find the container where it should go
                const container = document.getElementById('chat-input-container') || document.body; // Fallback

                // Construct it if missing (Quick UI fix)
                // In a real app, this should be in the HTML. 
                // We will log for now if missing to guide the next step.
                console.log("[SpeechRecognition] Output:", text);
                return;
            }

            displayElement.textContent = text;
            displayElement.style.opacity = isFinal ? '1' : '0.7'; // Visual cue for interim
        }

        return {
            initialize: initialize,
            start: start,
            stop: stop,
            isSupported: function () { return !!recognition; }
        };

    })();
}
