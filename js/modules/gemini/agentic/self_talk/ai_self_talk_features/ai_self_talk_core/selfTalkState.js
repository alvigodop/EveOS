/**
 * selfTalkState.js
 * Manages global state variables for AI Self-Talk.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.State = window.AiSelfTalkAgentic.State || {};

// internal state variables
let aiSelftalkEnabled = false;
let selftalkTimeout = null;
let consecutiveSelfTalks = 0;
const MAX_CONSECUTIVE_SELF_TALKS = 10;
let baseSelftalkDelay = 15000;
let maxSelftalkDelayOffset = 25000;
let selfTalkHeartbeatInterval = null;
let selfTalkPrompt = "I'm thinking to myself now. Let me continue this conversation naturally by adding some new thoughts, asking follow-up questions, or sharing relevant insights. I'll be conversational and proactive to keep the discussion flowing by exploring interesting aspects of the topic.";
let selfTalkSystemMessage = "[SYSTEM: You are the AI_ASSISTANT in this conversation. The human user is identified as HUMAN_USER. Never generate messages as if you were the human user. Always maintain your role as the AI assistant. Self-talk mode is enabled, so you should continue the conversation naturally by adding insights, asking follow-up questions and expressing additional thoughts without waiting for user input. Please continue the conversation actively.]";

// Initialize localStorage default
if (localStorage.getItem('aiSelftalkEnabled') !== 'false') {
    localStorage.setItem('aiSelftalkEnabled', 'false');
}

// Exported State Management Functions
window.AiSelfTalkAgentic.State = {
    get isEnabled() { return aiSelftalkEnabled; },
    set isEnabled(value) { aiSelftalkEnabled = value; },

    get timeout() { return selftalkTimeout; },
    set timeout(value) { selftalkTimeout = value; },

    get consecutiveCount() { return consecutiveSelfTalks; },
    set consecutiveCount(value) { consecutiveSelfTalks = value; },
    incrementConsecutiveCount: () => { consecutiveSelfTalks++; },
    resetConsecutiveCount: () => { consecutiveSelfTalks = 0; console.log("Consecutive self-talks reset."); },

    get maxConsecutiveLimit() { return MAX_CONSECUTIVE_SELF_TALKS; },

    get baseDelay() { return baseSelftalkDelay; },
    set baseDelay(value) { baseSelftalkDelay = value; },

    get maxDelayOffset() { return maxSelftalkDelayOffset; },
    set maxDelayOffset(value) { maxSelftalkDelayOffset = value; },

    get heartbeatInterval() { return selfTalkHeartbeatInterval; },
    set heartbeatInterval(value) { selfTalkHeartbeatInterval = value; },

    get prompt() { return selfTalkPrompt; },
    set prompt(value) { selfTalkPrompt = value; },

    get systemMessage() { return selfTalkSystemMessage; },
    set systemMessage(value) { selfTalkSystemMessage = value; },

    // Public State Getter
    getPublicState: () => ({
        isEnabled: aiSelftalkEnabled,
        systemMessage: selfTalkSystemMessage
    })
};

// Aliases for compatibility
window.AiSelfTalkAgentic.getAISelfTalkState = window.AiSelfTalkAgentic.State.getPublicState;
window.AiSelfTalkAgentic.resetConsecutiveSelfTalks = window.AiSelfTalkAgentic.State.resetConsecutiveCount;

console.log("selfTalkState.js loaded.");
