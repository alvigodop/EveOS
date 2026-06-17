/**
 * setupMessageCreator.js
 * Responsible for creating the initial setup configuration object for the Gemini model.
 */

window.ModelSetupCore = window.ModelSetupCore || {};

window.ModelSetupCore.createSetupMessage = function (selectedVoice, sequentialAudioPlay) {
    console.log("Creating setup message for voice:", selectedVoice);

    const setup_client_message = {
        setup: {
            contents: [{
                parts: [{
                    text: `You are a helpful AI assistant speaking with the voice of ${selectedVoice}. Please maintain this voice throughout our conversation. You should respond naturally to questions and engage in conversation.`
                }]
            }],
            tools: [],
            generationConfig: {
                temperature: 0.9,
                topK: 1,
                topP: 1,
                candidateCount: 1,
                stopSequences: [],
                maxOutputTokens: 2048,
                responseModalities: ["AUDIO"]
            },
            safetySettings: [
                {
                    "category": "HARM_CATEGORY_HARASSMENT",
                    "threshold": "BLOCK_ONLY_HIGH"
                },
                {
                    "category": "HARM_CATEGORY_HATE_SPEECH",
                    "threshold": "BLOCK_ONLY_HIGH"
                },
                {
                    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "threshold": "BLOCK_ONLY_HIGH"
                },
                {
                    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                    "threshold": "BLOCK_ONLY_HIGH"
                }
            ],
            systemInstruction: null
        },
        // Pass the sequential audio play setting to the server
        sequentialAudioPlay: sequentialAudioPlay,
        // NEW: Pass the transcription mode setting to the server (Now always using inline)
        inlineTranscriptionMode: (window.AudioProcessingControlsAgentic &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState)
            ? window.AudioProcessingControlsAgentic.TranscriptionModeState.isInlineTranscriptionEnabled()
            : true
    };

    // Include speech config to instruct API to use selected voice
    setup_client_message.setup.speechConfig = {
        voiceConfig: {
            prebuiltVoiceConfig: {
                voiceName: selectedVoice,
                speakingRate: 1.0,
                pitch: 0.0
            }
        }
    };

    if (window.GeminiInstructionState?.applyToSetupMessage) {
        window.GeminiInstructionState.applyToSetupMessage(setup_client_message, {
            includeTranscriptionInjection: true,
            includeScreenPolicy: true
        });
    } else if (window.AudioProcessingControlsAgentic &&
        window.AudioProcessingControlsAgentic.TranscriptionModeState &&
        window.AudioProcessingControlsAgentic.TranscriptionModeState.isInjectionEnabled()) {
        setup_client_message.setup.systemInstruction = {
            parts: [{ text: window.AudioProcessingControlsAgentic.TranscriptionModeState.getInjectionPrompt() }]
        };
    }

    return setup_client_message;
};
