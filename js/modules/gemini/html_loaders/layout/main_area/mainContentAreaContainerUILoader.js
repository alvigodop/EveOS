/**
 * Loads the Main Content Area Container HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadMainContentAreaContainer() {
    const placeholder = document.getElementById('main-content-area-placeholder');
    if (!placeholder) {
        console.error('Main content area placeholder not found!');
        return Promise.reject('Main content area placeholder not found');
    }

    try {
        const htmlContent = `
<div class="app-container">
    <div class="demo-box">
        <div class="page-content">
            <div class="demo-content">
                <div class="left-column">
                    <div id="video-section-placeholder" class="video-section"></div>
                    <!-- Agentic Functions Section Placeholder -->
                    <div id="agentic-functions-section-placeholder" class="agentic-functions"></div>
                </div>

                <div class="right-column">
                    <!-- Chat Container Placeholder -->
                    <div id="chat-container-placeholder" class="chat-container"></div>
                    <!-- Text Input Section Placeholder -->
                    <div id="text-input-section-placeholder" class="text-input-section"></div>
                </div>

                <!-- Agentic Functions Dialog Placeholders -->
                <div id="screen-capture-settings-dialog-placeholder"></div>
                <div id="session-controls-settings-dialog-placeholder"></div>
                <div id="ai-self-talk-settings-dialog-placeholder"></div>
                <div id="audio-settings-dialog-placeholder"></div>
            </div>
        </div>
    </div>
</div>
`;

        // Insert the HTML content into the placeholder
        placeholder.innerHTML = htmlContent;

        // After loading, upgrade MDL components within the loaded HTML
        // Add defensive check for componentHandler availability
        if (typeof window.componentHandler !== 'undefined' && window.componentHandler && window.componentHandler.upgradeElements) {
            try {
                componentHandler.upgradeElements(placeholder);
                console.log('Main Content Area Container: MDL components upgraded successfully');
            } catch (mdlError) {
                console.warn('Main Content Area Container: Error upgrading MDL components:', mdlError);
                // Continue anyway - this is not a critical failure
            }
        } else {
            console.warn('Main Content Area Container: componentHandler not available for upgrading MDL components');
        }

        console.log('Main Content Area Container loaded successfully');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Main Content Area Container:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the layout loader
window.loadMainContentAreaContainer = loadMainContentAreaContainer; 