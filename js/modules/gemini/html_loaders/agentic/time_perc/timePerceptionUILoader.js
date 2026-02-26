/**
 * Loads the Time Perception card HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadTimePerceptionCard() {
    const placeholder = document.getElementById('time-perception-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Time Perception card not found!');
        return Promise.reject('Placeholder not found'); // Return a rejected promise
    }

    try {
        const htmlContent = `
<!-- Time Perception Card Component -->
<div class="agentic-function-card" style="background-color: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 200px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #333;">Time Perception</span>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="timePerceptionToggle">
            <input type="checkbox" id="timePerceptionToggle" class="mdl-switch__input">
            <span class="mdl-switch__label"></span>
        </label>
    </div>
    <div id="currentTimeDisplay" style="font-family: 'Roboto Mono', monospace; font-size: 14px; color: #666; text-align: center; margin-top: 5px;">
        --:--:--
    </div>
    <div style="font-size: 12px; color: #757575; margin-top: 8px;">
        Sends current time with each message to Gemini
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;
        // After loading, you might need to manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }
        return Promise.resolve(); // Resolve the promise on success

    } catch (error) {
        console.error('Failed to load Time Perception card:', error);
        return Promise.reject(error); // Return a rejected promise on error
    }
}

// Export the function to be called by pageInitializer.js
window.loadTimePerceptionCard = loadTimePerceptionCard; 