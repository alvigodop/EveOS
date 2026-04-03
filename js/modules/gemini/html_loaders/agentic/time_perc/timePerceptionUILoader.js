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
<div class="agentic-function-card gemini-agentic-card gemini-agentic-card--time">
    <div class="gemini-agentic-card-head">
        <div>
            <div class="gemini-agentic-card-kicker">Clock Context</div>
            <span class="gemini-agentic-card-title">Time Perception</span>
        </div>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="timePerceptionToggle">
            <input type="checkbox" id="timePerceptionToggle" class="mdl-switch__input">
            <span class="mdl-switch__label"></span>
        </label>
    </div>
    <div id="currentTimeDisplay" class="gemini-agentic-card-value">
        --:--:--
    </div>
    <div class="gemini-agentic-card-copy">
        Sends current time with each message to Gemini.
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
