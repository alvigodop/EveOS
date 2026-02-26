// js/modules/gemini/voice_announcements_handler/voiceAnnouncementsHandler.js

// This variable should be managed within this module.
// Other modules can read the state directly from the toggle if needed.
let showVoiceAnnouncements = false;

// Ensure the namespace exists
window.AudioProcessingControlsAgentic = window.AudioProcessingControlsAgentic || {};

/**
 * Initializes the voice announcements toggle functionality
 */
function initializeVoiceAnnouncementsToggle() {
    const voiceAnnouncementsToggle = document.getElementById('voiceAnnouncementsToggle');

    if (voiceAnnouncementsToggle) {
        // Restore Voice Announcements toggle from localStorage
        const savedVoiceAnnouncements = localStorage.getItem('voiceAnnouncementsEnabled');
        if (savedVoiceAnnouncements !== null) {
            const enabled = savedVoiceAnnouncements === 'true';
            voiceAnnouncementsToggle.checked = enabled;
            showVoiceAnnouncements = enabled;
        } else {
            // Initialize localStorage with the default state (false) or current toggle state
            // The toggle's default HTML state might be 'checked', so read from it if localStorage is empty.
            showVoiceAnnouncements = voiceAnnouncementsToggle.checked;
            localStorage.setItem('voiceAnnouncementsEnabled', showVoiceAnnouncements.toString());
        }

        // Ensure MDL component is visually updated if applicable
        if (voiceAnnouncementsToggle.parentElement && typeof componentHandler !== 'undefined' && voiceAnnouncementsToggle.parentElement.MaterialSwitch) {
            if (showVoiceAnnouncements) {
                voiceAnnouncementsToggle.parentElement.MaterialSwitch.on();
            } else {
                voiceAnnouncementsToggle.parentElement.MaterialSwitch.off();
            }
        } else if (voiceAnnouncementsToggle.parentElement && voiceAnnouncementsToggle.parentElement.classList.contains('mdl-switch')) {
            // Fallback for MDL state if MaterialSwitch object isn't directly available or MDL isn't fully initialized yet.
             if (showVoiceAnnouncements) {
                voiceAnnouncementsToggle.parentElement.classList.add('is-checked');
            } else {
                voiceAnnouncementsToggle.parentElement.classList.remove('is-checked');
            }
        }

        // Event listener for the toggle
        voiceAnnouncementsToggle.addEventListener('change', function() {
            showVoiceAnnouncements = this.checked;
            // displayMessage, resetConnection, connect are expected to be global
            if (typeof displayMessage === 'function') {
                displayMessage(`System Message: Voice announcements ${showVoiceAnnouncements ? 'enabled' : 'disabled'}`);
            }
            localStorage.setItem('voiceAnnouncementsEnabled', showVoiceAnnouncements.toString());

            // Reinitialize the model with the new voice announcement setting
            if (typeof resetConnection === 'function') {
                resetConnection();
            }
            if (typeof displayMessage === 'function') {
                displayMessage("System Message: Reinitializing model with new voice settings...");
            }

            // Connect with a slight delay to ensure clean connection
            setTimeout(() => {
                if (typeof connect === 'function') {
                    connect();
                }
            }, 1000);
        });

        console.log('Voice announcements toggle initialized successfully');
    } else {
        console.error("Element with ID 'voiceAnnouncementsToggle' not found. Voice announcements handler will not initialize correctly.");
    }
}

// Function to allow other modules to check the state if needed,
// though reading from the toggle directly is often preferred.
function isVoiceAnnouncementsEnabled() {
    return showVoiceAnnouncements;
}

// Expose the initialization function via the namespace
window.AudioProcessingControlsAgentic.initializeVoiceAnnouncementsToggle = initializeVoiceAnnouncementsToggle; 