/**
 * Loads the Agentic Functions Section Container HTML component
 */
async function loadAgenticFunctionsSectionContainer() {
    console.log('agenticFunctionsSectionContainerUILoader.js: Loading Agentic Functions Section Container...');

    try {
        const html = `
<!-- Agentic Functions Section Container -->
<div class="agentic-functions gemini-agentic-shell" data-collapsible-section="agentic">
    <div class="gemini-agentic-shell-head" data-collapsible-header>
        <div>
            <div class="gemini-agentic-shell-kicker">Agentic Functions</div>
            <h4 class="gemini-agentic-shell-title">Context and Workspace Controls</h4>
        </div>
        <div class="gemini-agentic-shell-pill">Live</div>
    </div>
    <div data-collapsible-body>
        <div class="gemini-agentic-shell-copy">Keep contextual tools, memory relays, and session controls available without leaving the Gemini workspace.</div>
        <div class="gemini-agentic-grid">
            <!-- Placeholder for Time Perception Card - Loaded by JavaScript -->
            <div id="time-perception-card-placeholder"></div>
            <!-- Placeholder for Conversation Memory Card - Loaded by JavaScript -->
            <div id="conversation-memory-card-placeholder"></div>
            <!-- Placeholder for Gemini Live Link Card - Loaded by JavaScript -->
            <div id="gemini-live-link-card-placeholder"></div>
            <!-- Add AI Self-talk toggle as a card in the Agentic Functions section -->
            <div id="ai-self-talk-card-placeholder"></div>
            <!-- Audio Processing Controls -->
            <div id="audio-processing-controls-card-placeholder"></div>
            <!-- Sonic Forge paid-feature visibility -->
            <div id="sonic-forge-manager-card-placeholder"></div>
            <!-- Session Controls card -->
            <div id="session-controls-card-placeholder"></div>
            <!-- Screen Capture Interval card placeholder -->
            <div id="screen-capture-settings-card-placeholder"></div>
        </div>
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
