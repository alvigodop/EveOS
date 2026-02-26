// js/modules/gemini/agentic/Conversation_Memory_Agentic/context_memory_toggle_handler/contextMemoryToggleHandler.js

console.log("js/modules/gemini/agentic/Conversation_Memory_Agentic/context_memory_toggle_handler/contextMemoryToggleHandler.js started loading");

// Define the namespace if it doesn't exist
window.ConversationMemoryAgentic = window.ConversationMemoryAgentic || {};

// Initialize context memory toggle state (default value)
window.ConversationMemoryAgentic.contextMemoryEnabled = true;

// This function will now be called by pageInitializer.js AFTER the HTML is loaded
function initializeContextMemoryToggle() {
    const contextMemoryToggle = document.getElementById('contextMemoryToggle');

    if (contextMemoryToggle) {
        // Initialize context memory toggle from localStorage
        const savedContextMemory = localStorage.getItem('contextMemoryEnabled');
        if (savedContextMemory !== null) {
            window.ConversationMemoryAgentic.contextMemoryEnabled = savedContextMemory === 'true';
        } else {
            // If not in localStorage, use default and save it
            localStorage.setItem('contextMemoryEnabled', window.ConversationMemoryAgentic.contextMemoryEnabled.toString());
        }

        // Update the toggle state
        contextMemoryToggle.checked = window.ConversationMemoryAgentic.contextMemoryEnabled;

        // Ensure MDL component is visually updated if applicable
        // Adding a slight delay here as well, similar to pageInitializer's overall approach
        setTimeout(() => {
            if (contextMemoryToggle.parentElement && typeof componentHandler !== 'undefined' && contextMemoryToggle.parentElement.classList.contains('is-upgraded')) {
                if (window.ConversationMemoryAgentic.contextMemoryEnabled) {
                    if (!contextMemoryToggle.parentElement.classList.contains('is-checked')) {
                        contextMemoryToggle.parentElement.classList.add('is-checked');
                    }
                } else {
                    if (contextMemoryToggle.parentElement.classList.contains('is-checked')) {
                        contextMemoryToggle.parentElement.classList.remove('is-checked');
                    }
                }
            } else {
                // Fallback for when MDL might not be ready immediately
                if (contextMemoryToggle.parentElement) {
                    if (window.ConversationMemoryAgentic.contextMemoryEnabled) {
                        contextMemoryToggle.parentElement.classList.add('is-checked');
                    } else {
                        contextMemoryToggle.parentElement.classList.remove('is-checked');
                    }
                }
            }
            if (typeof displayMessage === 'function') {
                displayMessage(`System Message: Conversation memory ${window.ConversationMemoryAgentic.contextMemoryEnabled ? 'enabled' : 'disabled'}`, true);
            } else {
                console.warn('displayMessage function not found for contextMemoryToggleHandler during initialization.');
            }
        }, 50); // Small delay to allow MDL upgrade

        // Add event listener for context memory toggle
        contextMemoryToggle.addEventListener('change', function () {
            window.ConversationMemoryAgentic.contextMemoryEnabled = this.checked;

            if (typeof displayMessage === 'function') {
                displayMessage(`System Message: Conversation memory ${window.ConversationMemoryAgentic.contextMemoryEnabled ? 'enabled' : 'disabled'}`, true);
            } else {
                console.warn('displayMessage function not found for contextMemoryToggleHandler during change event.');
            }
            localStorage.setItem('contextMemoryEnabled', window.ConversationMemoryAgentic.contextMemoryEnabled.toString());
        });
    } else {
        console.warn("Element with ID 'contextMemoryToggle' not found after HTML load. Context memory feature may not initialize correctly.");
    }
}

// Add getter/setter functions to the namespace
window.ConversationMemoryAgentic.isContextMemoryEnabled = () => window.ConversationMemoryAgentic.contextMemoryEnabled;
window.ConversationMemoryAgentic.setContextMemoryEnabled = (enabled) => {
    window.ConversationMemoryAgentic.contextMemoryEnabled = enabled;
    localStorage.setItem('contextMemoryEnabled', enabled.toString());
};

// Expose the initialization function
window.ConversationMemoryAgentic.initializeContextMemoryToggle = initializeContextMemoryToggle;

console.log("Context memory toggle handler initialized in ConversationMemoryAgentic namespace");
console.log("js/modules/gemini/agentic/Conversation_Memory_Agentic/context_memory_toggle_handler/contextMemoryToggleHandler.js finished loading and initial execution");