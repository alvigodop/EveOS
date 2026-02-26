/**
 * sessionFlowManager.js
 * Manages the asynchronous flow of session initialization:
 * Setup -> History -> Context -> Voice Check
 */

window.ModelSetupCore = window.ModelSetupCore || {};

window.ModelSetupCore.SessionFlowManager = {

    // Helper to check WebSocket state
    isSocketReady: function () {
        return window.webSocket && window.webSocket.readyState === WebSocket.OPEN;
    },

    // Step 1: Send the setup message
    sendSetup: function (setupMessage) {
        if (!this.isSocketReady()) {
            throw new Error("WebSocket not ready for setup");
        }
        window.webSocket.send(JSON.stringify(setupMessage));

        const voiceAnnouncementsCurrentlyEnabled = document.getElementById('voiceAnnouncementsToggle') ? document.getElementById('voiceAnnouncementsToggle').checked : false;
        if (typeof displayMessage === 'function') {
            displayMessage(`System Message: Model initialized ${voiceAnnouncementsCurrentlyEnabled ? 'with voice' : 'without'} announcements`, true);
        }
    },

    // Step 2: Clear and Request History
    initiateHistoryLoading: function () {
        // Reset history loaded flag
        if (typeof window.historyLoaded !== 'undefined') window.historyLoaded = false;

        // Clear UI
        const previousConversationContent = document.getElementById('previousConversationContent');
        if (previousConversationContent) {
            previousConversationContent.innerHTML = '';
        }

        if (this.isSocketReady()) {
            window.webSocket.send(JSON.stringify({ command: "get_history" }));
        } else {
            if (typeof displayMessage === 'function') displayMessage("System Message: WebSocket not ready for history", true);
        }
    },

    // Step 3: Send Context Memory (System Instruction + Current Chat)
    sendContextMemory: function () {
        if (document.getElementById('chatLog').getElementsByClassName('chat-message').length > 0 &&
            window.ConversationMemoryAgentic && window.ConversationMemoryAgentic.isContextMemoryEnabled()) {

            // Send system instruction for context
            const contextInstruction = {
                realtime_input: {
                    media_chunks: [{
                        mime_type: "text/plain",
                        data: (window.aiSelftalkEnabled) ?
                            "[SYSTEM INSTRUCTION: The following context is for reference only. After processing this context, you should actively continue the conversation without waiting for user input.]" :
                            "[SYSTEM INSTRUCTION: The following context is for reference only. DO NOT respond to the context. Only respond when the user sends a new message. Never generate messages on behalf of the user.]"
                    }]
                },
                is_system_context: true,
                is_history_metadata: true
            };

            if (this.isSocketReady()) {
                window.webSocket.send(JSON.stringify(contextInstruction));

                // Small delay before sending the actual content to ensure instruction is processed first
                setTimeout(() => {
                    if (typeof sendCurrentChatAsContext === 'function') {
                        sendCurrentChatAsContext();
                    }
                }, 1500);
            }
        }
    },

    // Step 4: Perform Voice Check
    performVoiceCheck: function (selectedVoice) {
        const currentVoiceAnnouncementsSetting = document.getElementById('voiceAnnouncementsToggle') ? document.getElementById('voiceAnnouncementsToggle').checked : false;

        if (currentVoiceAnnouncementsSetting) {
            if (this.isSocketReady()) {
                const voiceCheckText = `Voice check: This is a test of the ${selectedVoice} voice.`;
                if (typeof sendTextMessage === 'function') {
                    sendTextMessage(voiceCheckText, true); // Send as system message
                }
                if (typeof displayMessage === 'function') {
                    displayMessage("System Message: Sending voice check...", true);
                }
            } else {
                if (typeof displayMessage === 'function') {
                    displayMessage("System Message: WebSocket not ready for voice check", true);
                }
            }
        }
    },

    // ORCHESTRATOR: Run the full sequence
    runInitializationSequence: function (setupMessage, selectedVoice) {

        // 1. Send Setup
        try {
            this.sendSetup(setupMessage);
        } catch (e) {
            if (typeof displayMessage === 'function') displayMessage(`System Message: Error sending setup - ${e.message}`, true);
            return; // Stop if setup failed
        }

        // 2. Load History (after delay to allow setup to process server-side)
        setTimeout(() => {
            if (this.isSocketReady()) {
                this.initiateHistoryLoading();

                // 3. Send Context (after history fetch delay)
                setTimeout(() => {
                    this.sendContextMemory();
                }, 3000); // Wait 3s after history request

                // 4. Voice Check (parallel to context, slightly skewed)
                setTimeout(() => {
                    this.performVoiceCheck(selectedVoice);
                }, 5000); // Wait 5s total (2s after history) setup

            } else {
                if (typeof displayMessage === 'function') displayMessage("System Message: WebSocket disconnected during initialization sequence", true);
            }
        }, 2000); // 2s delay after setup
    }
};
