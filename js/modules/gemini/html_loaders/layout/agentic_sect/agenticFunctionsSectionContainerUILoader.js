/**
 * Loads the Agentic Functions Section Container HTML component
 */

async function loadAgenticFunctionsSectionContainer() {
    console.log('agenticFunctionsSectionContainerUILoader.js: Loading Agentic Functions Section Container...');

    try {
        const html = `
<!-- Agentic Functions Section Container -->
<div class="agentic-functions" style="padding: 15px; background-color: #f5f5f5; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h4 style="margin-top: 0; margin-bottom: 10px; color: #3f51b5;">Agentic Functions</h4>
    <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        <!-- Placeholder for Time Perception Card - Loaded by JavaScript -->
        <div id="time-perception-card-placeholder"></div>
        <!-- Placeholder for Conversation Memory Card - Loaded by JavaScript -->
        <div id="conversation-memory-card-placeholder"></div>
        <!-- Add AI Self-talk toggle as a card in the Agentic Functions section -->
        <div id="ai-self-talk-card-placeholder"></div>

        <!-- Audio Processing Controls -->
        <div id="audio-processing-controls-card-placeholder"></div>
        <!-- Session Controls card -->
        <div id="session-controls-card-placeholder"></div>
        <!-- Screen Capture Interval card placeholder -->
        <div id="screen-capture-settings-card-placeholder"></div>
    </div>
</div>
`;
        const placeholder = document.getElementById('agentic-functions-section-placeholder');

        if (placeholder) {
            placeholder.innerHTML = html;
            console.log('agenticFunctionsSectionContainerUILoader.js: Agentic Functions Section Container loaded successfully.');

            // Upgrade any MDL components in the loaded HTML
            if (typeof componentHandler !== 'undefined' && componentHandler.upgradeElements) {
                componentHandler.upgradeElements(placeholder);
                console.log('agenticFunctionsSectionContainerUILoader.js: MDL components upgraded.');
            }
        } else {
            console.error('agenticFunctionsSectionContainerUILoader.js: Placeholder element with ID "agentic-functions-section-placeholder" not found.');
        }

    } catch (error) {
        console.error('agenticFunctionsSectionContainerUILoader.js: Error loading Agentic Functions Section Container:', error);
    }
}

// Export the function globally for use by other scripts
window.loadAgenticFunctionsSectionContainer = loadAgenticFunctionsSectionContainer; 