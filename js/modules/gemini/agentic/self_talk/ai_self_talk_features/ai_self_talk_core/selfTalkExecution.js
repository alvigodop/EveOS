/**
 * selfTalkExecution.js
 * Handles the core logic for triggering and executing AI self-talk.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.Execution = window.AiSelfTalkAgentic.Execution || {};

window.AiSelfTalkAgentic.Execution.initiateSelftalk = function () {
    const State = window.AiSelfTalkAgentic.State;

    // Add debug logging
    console.log("initiateSelftalk called with current state:", {
        aiSelftalkEnabled: State.isEnabled,
        selftalkTimeout: State.timeout ? "exists" : "null",
        webSocketState: typeof webSocket !== 'undefined' && webSocket ? webSocket.readyState : "no websocket",
        baseSelftalkDelay: State.baseDelay,
        maxSelftalkDelayOffset: State.maxDelayOffset,
        consecutiveSelfTalks: State.consecutiveCount
    });

    // Clear any existing timeout
    if (State.timeout) {
        clearTimeout(State.timeout);
        State.timeout = null;
    }

    // Only proceed if self-talk is enabled and there's an active connection
    if (!State.isEnabled || typeof webSocket === 'undefined' || !webSocket || webSocket.readyState !== WebSocket.OPEN) {
        console.log("Self-talk not initiated - feature is disabled or no connection");
        return;
    }

    // Increment consecutive self-talks counter
    State.incrementConsecutiveCount();

    // Add safety measure for too many consecutive self-talks
    let delay;
    if (State.consecutiveCount > State.maxConsecutiveLimit) {
        console.log(`Safety: Too many consecutive self-talks (${State.consecutiveCount}), using longer delay`);
        delay = State.baseDelay * 3; // Triple the delay as a safety measure

        if (State.consecutiveCount > State.maxConsecutiveLimit * 2) {
            State.resetConsecutiveCount(); // Reset counter after a very long streak
        }
    } else {
        const maxDelay = State.baseDelay + State.maxDelayOffset;
        delay = State.baseDelay + Math.floor(Math.random() * (maxDelay - State.baseDelay));
    }

    console.log(`Setting self-talk timeout with delay: ${delay / 1000} seconds`);

    State.timeout = setTimeout(() => {
        console.log("Self-talk timeout triggered, current state:", {
            aiSelftalkEnabled: State.isEnabled,
            webSocketState: typeof webSocket !== 'undefined' && webSocket ? webSocket.readyState : "no websocket"
        });

        if (State.isEnabled && typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
            console.log("Initiating AI self-talk");

            let promptText = State.prompt;

            if (typeof window.TimePerceptionAgentic !== 'undefined' && typeof window.TimePerceptionAgentic.isTimePerceptionEnabled === 'function' && window.TimePerceptionAgentic.isTimePerceptionEnabled()) {
                const now = new Date();
                promptText += "\n[SYSTEM: The current time is " + now.toLocaleTimeString() + " on " + now.toLocaleDateString() + "]";
            }

            promptText = State.systemMessage + "\n\n" + promptText;
            console.log("Sending self-talk with system instructions:", promptText.substring(0, 100) + "...");

            const payload = {
                realtime_input: {
                    media_chunks: [{
                        mime_type: "text/plain",
                        data: promptText
                    }]
                },
                is_selftalk: true
            };

            try {
                webSocket.send(JSON.stringify(payload));
                State.timeout = null;
                if (typeof displayMessage === 'function') displayMessage("System Message: AI is continuing the conversation", true);
            } catch (error) {
                console.error("Error sending self-talk message:", error);
                State.resetConsecutiveCount();
                State.timeout = null;
            }
        } else {
            console.log("Self-talk timeout fired but conditions no longer valid");
            State.timeout = null;
        }
    }, delay);

    console.log(`Scheduled AI self-talk in ${delay / 1000} seconds`);
};

console.log("selfTalkExecution.js loaded.");
