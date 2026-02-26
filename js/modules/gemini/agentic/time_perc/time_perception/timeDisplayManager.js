// js/modules/gemini/agentic/Time_Perception_Agentic/time_perception/timeDisplayManager.js

// Define the namespace if it doesn't exist
window.TimePerceptionAgentic = window.TimePerceptionAgentic || {};

let timeModule_currentTimeInterval = null;
let timeModule_timePerceptionEnabled = false; // Internal state for this module

function updateCurrentTimeDisplay() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const displayElement = document.getElementById('currentTimeDisplay');
    if (displayElement) {
        displayElement.textContent = timeString;
    }
}

// This function will now be called by pageInitializer.js AFTER the HTML is loaded
function initializeTimePerceptionFeature() {
    const timePerceptionToggle = document.getElementById('timePerceptionToggle');
    if (!timePerceptionToggle) {
        console.warn("Time Perception Toggle (timePerceptionToggle) not found in the DOM after HTML load. Time perception feature will not be initialized.");
        // Ensure display is default if toggle is missing
        const displayElement = document.getElementById('currentTimeDisplay');
        if (displayElement) {
            displayElement.textContent = '--:--:--';
        }
        return;
    }

    // Restore from localStorage
    const storedTimePerception = localStorage.getItem('timePerceptionEnabled');
    if (storedTimePerception === 'true') {
        timeModule_timePerceptionEnabled = true;
    } else {
        // Explicitly ensure it's off by default and in storage
        timeModule_timePerceptionEnabled = false;
        localStorage.setItem('timePerceptionEnabled', 'false');
    }

    timePerceptionToggle.checked = timeModule_timePerceptionEnabled;
    // Ensure MDL UI for the toggle is updated
    // Adding a slight delay here as well, similar to pageInitializer's overall approach
    setTimeout(() => {
        if (timePerceptionToggle.parentElement && typeof timePerceptionToggle.parentElement.MaterialSwitch === 'object') {
            if (timeModule_timePerceptionEnabled) {
                if (!timePerceptionToggle.parentElement.classList.contains('is-checked')) {
                    timePerceptionToggle.parentElement.MaterialSwitch.on();
                }
            } else {
                if (timePerceptionToggle.parentElement.classList.contains('is-checked')) {
                    timePerceptionToggle.parentElement.MaterialSwitch.off();
                }
            }
        } else {
            // Fallback for when MDL might not be ready immediately
            if (timePerceptionToggle.parentElement) {
                if (timeModule_timePerceptionEnabled) {
                    timePerceptionToggle.parentElement.classList.add('is-checked');
                } else {
                    timePerceptionToggle.parentElement.classList.remove('is-checked');
                }
            }
        }
        if (timeModule_timePerceptionEnabled) {
            updateCurrentTimeDisplay();
            if (timeModule_currentTimeInterval) clearInterval(timeModule_currentTimeInterval);
            timeModule_currentTimeInterval = setInterval(updateCurrentTimeDisplay, 1000);
        } else {
            if (timeModule_currentTimeInterval) {
                clearInterval(timeModule_currentTimeInterval);
                timeModule_currentTimeInterval = null;
            }
            const displayElement = document.getElementById('currentTimeDisplay');
            if (displayElement) {
                displayElement.textContent = '--:--:--';
            }
        }
    }, 50); // Small delay to allow MDL upgrade


    timePerceptionToggle.addEventListener('change', function () {
        timeModule_timePerceptionEnabled = this.checked;
        localStorage.setItem('timePerceptionEnabled', timeModule_timePerceptionEnabled ? 'true' : 'false');

        if (timeModule_timePerceptionEnabled) {
            updateCurrentTimeDisplay();
            if (timeModule_currentTimeInterval) clearInterval(timeModule_currentTimeInterval);
            timeModule_currentTimeInterval = setInterval(updateCurrentTimeDisplay, 1000);
        } else {
            if (timeModule_currentTimeInterval) {
                clearInterval(timeModule_currentTimeInterval);
                timeModule_currentTimeInterval = null;
            }
            const displayElement = document.getElementById('currentTimeDisplay');
            if (displayElement) {
                displayElement.textContent = '--:--:--';
            }
        }
    });
}

// Expose functionality to the TimePerceptionAgentic global object
window.TimePerceptionAgentic.isTimePerceptionEnabled = function () {
    return timeModule_timePerceptionEnabled;
};

// Expose the initialization function
window.TimePerceptionAgentic.initializeTimePerceptionFeature = initializeTimePerceptionFeature; 