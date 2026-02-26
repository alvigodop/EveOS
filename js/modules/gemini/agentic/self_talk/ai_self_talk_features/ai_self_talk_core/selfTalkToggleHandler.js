/**
 * selfTalkToggleHandler.js
 * Handles the main AI Self-Talk toggle and heartbeat mechanism.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.UI = window.AiSelfTalkAgentic.UI || {};

window.AiSelfTalkAgentic.UI.initializeToggleHandler = function () {
    console.log("Initializing AI Self-talk Toggle Handler.");
    const State = window.AiSelfTalkAgentic.State;
    const Execution = window.AiSelfTalkAgentic.Execution;

    const aiSelftalkToggle = document.getElementById('aiSelftalkToggle');
    if (!aiSelftalkToggle) {
        console.error("AI Self-talk toggle not found in the DOM. Cannot initialize feature.");
        return;
    }

    // Check if the parent element is an MDL switch before proceeding
    if (!(aiSelftalkToggle.parentElement && aiSelftalkToggle.parentElement.classList.contains('mdl-switch'))) {
        console.error("AI Self-talk toggle is not correctly wrapped in an MDL switch structure. Cannot initialize.");
        return;
    }

    aiSelftalkToggle.addEventListener('change', function () {
        State.isEnabled = this.checked;
        if (typeof displayMessage === 'function') displayMessage(`System Message: AI self-talk ${State.isEnabled ? 'enabled' : 'disabled'}`, true);
        localStorage.setItem('aiSelftalkEnabled', State.isEnabled.toString());

        if (State.isEnabled) {
            Execution.initiateSelftalk();
            if (State.heartbeatInterval) clearInterval(State.heartbeatInterval);

            State.heartbeatInterval = setInterval(() => {
                const currentToggle = document.getElementById('aiSelftalkToggle');
                if (currentToggle && currentToggle.checked && !State.timeout) {
                    console.log("Self-talk heartbeat detected no active self-talk, restarting it");
                    State.timeout = null; // Ensure it's null before initiating
                    Execution.initiateSelftalk();
                }
            }, 5000);
        } else {
            if (State.timeout) {
                clearTimeout(State.timeout);
                State.timeout = null;
            }
            if (State.heartbeatInterval) {
                clearInterval(State.heartbeatInterval);
                State.heartbeatInterval = null;
            }
            State.resetConsecutiveCount();
        }
    });

    // Set initial state based on localStorage
    const storedValue = localStorage.getItem('aiSelftalkEnabled');
    if (storedValue === 'true') {
        aiSelftalkToggle.checked = true;
        // Manually update MDL visual state if componentHandler isn't available yet or doesn't auto-upgrade
        if (aiSelftalkToggle.parentElement) {
            aiSelftalkToggle.parentElement.classList.add('is-checked');
        }
        State.isEnabled = true;
        // No need to dispatch change event here, initializeSelftalk only calls this AFTER HTML load and MDL upgrade
    } else {
        aiSelftalkToggle.checked = false;
        if (aiSelftalkToggle.parentElement) {
            aiSelftalkToggle.parentElement.classList.remove('is-checked');
        }
        State.isEnabled = false;
    }

    console.log("AI Self-talk Toggle Handler initialized.");
};
