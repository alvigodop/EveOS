let audioCaptureContext = null;
let audioCaptureProcessor = null;
let audioCapturePcmData = [];
let audioCaptureInterval = null;

// Configurable audio chunk interval (ms). Default 3000ms.
const AUDIO_CHUNK_INTERVAL_MS = 3000;
window.AUDIO_CHUNK_INTERVAL_MS = AUDIO_CHUNK_INTERVAL_MS;

// Allow runtime updates to the audio chunk interval
window.setAudioChunkInterval = function (ms) {
    try {
        if (audioCaptureInterval) {
            clearInterval(audioCaptureInterval);
        }
        audioCaptureInterval = setInterval(recordChunkForCapture, ms);
        window.AUDIO_CHUNK_INTERVAL_MS = ms;
    } catch (e) {
        console.error("Failed to set audio chunk interval:", e);
    }
};

function recordChunkForCapture() {
    const buffer = new ArrayBuffer(audioCapturePcmData.length * 2);
    const view = new DataView(buffer);
    audioCapturePcmData.forEach((value, index) => {
        view.setInt16(index * 2, value, true);
    });

    const base64 = btoa(
        String.fromCharCode.apply(null, new Uint8Array(buffer))
    );

    if (typeof sendVoiceMessage === 'function') {
        sendVoiceMessage(base64); // Assumes sendVoiceMessage is global, defined elsewhere
    } else {
        console.error("sendVoiceMessage function is not available for audio capture.");
    }
    audioCapturePcmData = [];
}

async function startAudioInputCapture() {
    try {
        // Initialize and Start Client-Side Speech Recognition
        if (window.AudioProcessingControlsAgentic &&
            window.AudioProcessingControlsAgentic.SpeechRecognitionHandler) {

            console.log("[audioCapture] Attempting to start SpeechRecognitionHandler...");
            // Ensure initialized
            if (!window.AudioProcessingControlsAgentic.SpeechRecognitionHandler.isSupported()) {
                console.log("[audioCapture] SpeechRecognitionHandler not initialized, initializing now...");
                window.AudioProcessingControlsAgentic.SpeechRecognitionHandler.initialize();
            }

            try {
                window.AudioProcessingControlsAgentic.SpeechRecognitionHandler.start();
                console.log("[audioCapture] SpeechRecognitionHandler.start() called.");
            } catch (err) {
                console.error("[audioCapture] Failed to start SpeechRecognitionHandler:", err);
            }

            // Show the display box
            const display = document.getElementById('user-transcription-display');
            if (display) {
                display.style.display = 'block';
                display.textContent = "Listening..."; // Immediate visual feedback
            } else {
                console.warn("[audioCapture] 'user-transcription-display' element not found!");
            }
        } else {
            console.warn("[audioCapture] SpeechRecognitionHandler not found in namespace.");
        }

        audioCaptureContext = new AudioContext({
            sampleRate: 16000,
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 16000,
            },
        });

        const source = audioCaptureContext.createMediaStreamSource(stream);
        audioCaptureProcessor = audioCaptureContext.createScriptProcessor(4096, 1, 1);

        audioCaptureProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = inputData[i] * 0x7fff; // Convert to 16-bit PCM
            }
            audioCapturePcmData.push(...pcm16);
        };

        source.connect(audioCaptureProcessor);
        audioCaptureProcessor.connect(audioCaptureContext.destination); // Connect to destination to enable processing

        audioCaptureInterval = setInterval(recordChunkForCapture, window.AUDIO_CHUNK_INTERVAL_MS || AUDIO_CHUNK_INTERVAL_MS);
        console.log("Audio input capture started.");
    } catch (error) {
        console.error("Error starting audio input capture:", error);
        // Potentially update UI or display a message to the user
    }
}

function stopAudioInputCapture() {
    if (audioCaptureInterval) {
        clearInterval(audioCaptureInterval);
        audioCaptureInterval = null;
    }
    if (audioCaptureProcessor) {
        audioCaptureProcessor.disconnect();
        audioCaptureProcessor = null;
    }
    if (audioCaptureContext) {
        if (audioCaptureContext.state !== 'closed') {
            audioCaptureContext.close().catch(e => console.error("Error closing audio context:", e));
        }
        audioCaptureContext = null;
    }
    audioCapturePcmData = []; // Clear PCM data

    // Stop Client-Side Speech Recognition
    if (window.AudioProcessingControlsAgentic &&
        window.AudioProcessingControlsAgentic.SpeechRecognitionHandler) {
        window.AudioProcessingControlsAgentic.SpeechRecognitionHandler.stop();

        // Optional: Hide display after a delay or keep it? 
        // Keeping it for now so user can see what was sent.
    }

    console.log("Audio input capture stopped.");
}

// Expose functions to the global scope so main.js event listeners can use them
// This is suitable for the current project structure.
window.startAudioInput = startAudioInputCapture;
window.stopAudioInput = stopAudioInputCapture; 