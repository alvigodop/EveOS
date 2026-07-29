/**
 * agenticComponentOrchestrator.js
 * Orchestrates the loading and setup of all agentic HTML components and features.
 */

// Helper to safely execute initialization steps
async function safeInitializeFeature(cardLoaderName, featureName, initStep) {
    if (typeof window[cardLoaderName] === 'function') {
        try {
            await window[cardLoaderName]();
            if (initStep) {
                await initStep();
            }
        } catch (e) {
            console.error(`Error initializing ${featureName}:`, e);
        }
    } else {
        console.error(`${cardLoaderName} function not found.`);
    }
}

/**
 * Initializes the loading and setup of all agentic HTML components.
 */
async function initializeAgenticHtmlComponents() {
    console.log("agenticComponentOrchestrator.js: initializeAgenticHtmlComponents started.");

    try {
        // First, dynamically load all the individual UI loader scripts
        if (typeof window.loadAgenticUILoaderScripts === 'function') {
            await window.loadAgenticUILoaderScripts();
            console.log("agenticComponentOrchestrator.js: All individual agentic UI loader scripts loaded.");
        } else {
            throw new Error("loadAgenticUILoaderScripts function not found!");
        }

        // --- Time Perception ---
        await safeInitializeFeature('loadTimePerceptionCard', 'Time Perception', async () => {
            if (window.TimePerceptionAgentic?.initializeTimePerceptionFeature) {
                window.TimePerceptionAgentic.initializeTimePerceptionFeature();
                console.log('Time Perception feature initialized.');
            } else {
                console.error('TimePerceptionAgentic.initializeTimePerceptionFeature not found.');
            }
        });

        // --- Conversation Memory ---
        await safeInitializeFeature('loadConversationMemoryCard', 'Conversation Memory', async () => {
            if (window.ConversationMemoryAgentic?.initializeContextMemoryToggle) {
                window.ConversationMemoryAgentic.initializeContextMemoryToggle();
                console.log('Conversation Memory feature initialized.');
            } else {
                console.error('ConversationMemoryAgentic.initializeContextMemoryToggle not found.');
            }
        });

        // --- Gemini Live Link ---
        await safeInitializeFeature('loadGeminiLiveLinkCard', 'Gemini Live Link', async () => {
            if (window.GeminiLiveLinkAgentic?.initializeGeminiLiveLinkCard) {
                await window.GeminiLiveLinkAgentic.initializeGeminiLiveLinkCard();
                console.log('Gemini Live Link feature initialized.');
            } else {
                console.error('GeminiLiveLinkAgentic.initializeGeminiLiveLinkCard not found.');
            }
        });

        // --- Audio Processing Controls ---
        await safeInitializeFeature('loadAudioProcessingControlsCard', 'Audio Processing Controls', async () => {
            console.log('Audio Processing Controls UI loaded.');

            if (typeof window.loadAudioSettingsDialog === 'function') {
                await window.loadAudioSettingsDialog();
                console.log('Audio Settings Dialog loaded.');
            }

            if (window.AudioProcessingControlsAgentic?.initializeAudioProcessingPreferences) {
                window.AudioProcessingControlsAgentic.initializeAudioProcessingPreferences();
                console.log('Audio Processing Preferences Handler initialized.');
            } else {
                console.error('AudioProcessingControlsAgentic.initializeAudioProcessingPreferences not found.');
            }
        });

        // --- Sonic Forge Manager ---
        await safeInitializeFeature('loadSonicForgeManagerCard', 'Sonic Forge Manager', async () => {
            window.SonicForgeManagerAgentic?.initialize?.();
            console.log('Sonic Forge Manager initialized.');
        });

        // --- Session Controls ---
        await safeInitializeFeature('loadSessionControlsCard', 'Session Controls', async () => {
            console.log('Session Controls UI loaded.');

            if (typeof window.loadSessionControlsSettingsDialogScript === 'function') {
                await window.loadSessionControlsSettingsDialogScript();
                if (window.SessionControlsAgenticReady) {
                    await window.SessionControlsAgenticReady;
                }
                // Load the actual dialog HTML component
                if (typeof window.loadSessionControlsSettingsDialog === 'function') {
                    await window.loadSessionControlsSettingsDialog();
                    console.log('Session Controls Settings Dialog loaded.');

                    if (window.SessionControlsAgentic?.initializeSessionControlsSettings) {
                        const getWebSocket = () => window.webSocket || null;
                        const displayMessageFunc = window.displayMessage || window.LogInterfaceDisplay?.MessagingLog?.displayMessage || ((msg) => console.log(msg));

                        window.SessionControlsAgentic.initializeSessionControlsSettings(getWebSocket, displayMessageFunc);
                        console.log('Session Controls Settings Handler initialized.');
                    } else {
                        console.error('SessionControlsAgentic.initializeSessionControlsSettings not found.');
                    }
                }
            }
        });

        // --- Screen Capture ---
        if (typeof window.loadScreenCaptureSettingsCard === 'function' && typeof window.loadScreenCaptureSettingsDialog === 'function') {
            await window.loadScreenCaptureSettingsCard();
            await window.loadScreenCaptureSettingsDialog();

            if (window.ScreenCaptureSettingsAgentic?.initializeScreenCaptureSettingsHandler) {
                window.ScreenCaptureSettingsAgentic.initializeScreenCaptureSettingsHandler();
                console.log('Screen Capture Settings Handler initialized.');
            }
        } else {
            console.error('Screen capture loaders not found.');
        }

        // --- AI Self-Talk ---
        await safeInitializeFeature('loadAiSelfTalkCard', 'AI Self-Talk', async () => {
            console.log('AI Self-talk UI loaded.');

            if (window.AiSelfTalkAgentic?.loadAiSelfTalkSettingsDialog) {
                await window.AiSelfTalkAgentic.loadAiSelfTalkSettingsDialog();
                console.log('AI Self-talk Settings Dialog loaded.');
            }

            if (window.AiSelfTalkAgentic?.initializeAiSelfTalk) {
                window.AiSelfTalkAgentic.initializeAiSelfTalk();
                console.log('AI Self-talk feature initialized.');
            }
        });

    } catch (error) {
        console.error("Error initializing agentic HTML components:", error);
    }

    console.log("agenticComponentOrchestrator.js: initializeAgenticHtmlComponents finished.");
}

// Export the initialization function
window.initializeAgenticHtmlComponents = initializeAgenticHtmlComponents;

console.log("agenticComponentOrchestrator.js loaded.");
