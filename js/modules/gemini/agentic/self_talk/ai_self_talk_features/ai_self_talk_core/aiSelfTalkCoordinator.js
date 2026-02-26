/**
 * aiSelfTalkCoordinator.js
 * Main coordinator module for AI Self-Talk.
 * Aggregates functionality and exposes it to the global namespace.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};

// Expose initiateSelftalk via the namespace
window.AiSelfTalkAgentic.initiateSelftalk = function () {
    if (window.AiSelfTalkAgentic.Execution && window.AiSelfTalkAgentic.Execution.initiateSelftalk) {
        window.AiSelfTalkAgentic.Execution.initiateSelftalk();
    } else {
        console.error("AiSelfTalkAgentic.Execution.initiateSelftalk not loaded.");
    }
};

/**
 * Initializes the AI Self-talk toggle and settings dialog.
 * This should be called AFTER the AI Self-talk HTML is loaded into the DOM.
 */
window.AiSelfTalkAgentic.initializeAiSelfTalk = function () {
    if (window.AiSelfTalkAgentic.UI && window.AiSelfTalkAgentic.UI.initializeAiSelfTalk) {
        window.AiSelfTalkAgentic.UI.initializeAiSelfTalk();
    } else {
        console.error("AiSelfTalkAgentic.UI.initializeAiSelfTalk not loaded.");
    }
};

// Aliases for compatibility
// Note: window.AiSelfTalkAgentic.getAISelfTalkState and resetConsecutiveSelfTalks 
// are already set in selfTalkState.js

console.log("aiSelfTalkCoordinator.js loaded.");
