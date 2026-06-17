/**
 * autoSetupHandler.js
 * Handles the automatic setup message sent to the server on connection.
 */

console.log("autoSetupHandler.js started loading");

// Enhanced auto-setup message function
function sendAutoSetupMessage() {
    console.log('Sending automatic setup message with saved voice configuration...');

    // Get saved voice from localStorage or default to Aoede
    const savedVoice = localStorage.getItem('selectedVoice') || 'Aoede';

    // Also update the UI dropdown to match
    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
        for (let i = 0; i < voiceSelect.options.length; i++) {
            if (voiceSelect.options[i].value === savedVoice) {
                voiceSelect.selectedIndex = i;
                break;
            }
        }
    }

    if (typeof displayMessage === 'function') {
        displayMessage(`System Message: Auto-restoring model with voice: ${savedVoice}`, true);
    }

    // Retrieve saved configuration
    const savedModel = localStorage.getItem('selectedModel') || 'gemini-2.5-flash-native-audio-latest';
    const temp = parseFloat(localStorage.getItem('generationTemperature') || '0.9');
    const topK = parseInt(localStorage.getItem('generationTopK') || '1', 10);
    const topP = parseFloat(localStorage.getItem('generationTopP') || '1.0');
    const maxTokens = parseInt(localStorage.getItem('generationMaxTokens') || '2048', 10);

    // New settings
    const safetyLevel = localStorage.getItem('safetyLevel') || 'high';
    const speakingRate = parseFloat(localStorage.getItem('speakingRate') || '1.0');
    const pitch = parseInt(localStorage.getItem('pitch') || '0', 10);
    const responseTimeout = parseInt(localStorage.getItem('responseTimeout') || '75', 10);
    const geminiApiKey = localStorage.getItem('geminiApiKey') || null;

    // Map safety level
    let harmBlockThreshold = "BLOCK_ONLY_HIGH";
    if (safetyLevel === 'medium') harmBlockThreshold = "BLOCK_MEDIUM_AND_ABOVE";
    if (safetyLevel === 'low') harmBlockThreshold = "BLOCK_LOW_AND_ABOVE";
    if (safetyLevel === 'none') harmBlockThreshold = "BLOCK_NONE";

    const commonSafetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: harmBlockThreshold },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: harmBlockThreshold },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: harmBlockThreshold },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: harmBlockThreshold }
    ];

    // Create setup message with saved voice and new config
    const setup_client_message = {
        model: savedModel,
        apiKey: geminiApiKey,
        responseTimeout: responseTimeout, // Passed to server session loop
        setup: {
            contents: [{
                parts: [{
                    text: `You are a helpful AI assistant speaking with the voice of ${savedVoice}. Please maintain this voice throughout our conversation. You should respond naturally to questions and engage in conversation.`
                }]
            }],
            systemInstruction: null,
            tools: [],
            generationConfig: {
                temperature: temp,
                topK: topK,
                topP: topP,
                candidateCount: 1,
                stopSequences: [],
                maxOutputTokens: maxTokens,
                responseModalities: ["AUDIO"]
            },
            safetySettings: commonSafetySettings,
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: savedVoice,
                        speakingRate: speakingRate,
                        pitch: pitch
                    }
                }
            }
        },
        // Pass the sequential audio play setting to the server
        sequentialAudioPlay: (typeof sequentialAudioPlay !== 'undefined') ? sequentialAudioPlay : false,
        // NEW: Pass the transcription mode setting to the server (Now always using inline)
        inlineTranscriptionMode: (window.AudioProcessingControlsAgentic &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState)
            ? window.AudioProcessingControlsAgentic.TranscriptionModeState.isInlineTranscriptionEnabled()
            : true
    };

    if (window.GeminiInstructionState?.applyToSetupMessage) {
        window.GeminiInstructionState.applyToSetupMessage(setup_client_message, {
            includeTranscriptionInjection: true,
            includeScreenPolicy: true
        });
    } else {
        const sysInstr = localStorage.getItem('systemInstruction') || '';
        setup_client_message.setup.systemInstruction = sysInstr ? { parts: [{ text: sysInstr }] } : null;
    }

    if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) {
        try {
            window.webSocket.send(JSON.stringify(setup_client_message));
            console.log(`Auto-setup message sent with voice: ${savedVoice}`);

            if (typeof displayMessage === 'function') {
                displayMessage(`System Message: Connection restored with voice: ${savedVoice}`, true);
            }
        } catch (error) {
            console.error("Error sending auto-setup message:", error);
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Error auto-configuring voice - " + error.message, true);
            }
        }
    }
}

// Expose globally
window.sendAutoSetupMessage = sendAutoSetupMessage;
