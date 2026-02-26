// mdlLayoutWrapperUILoader.js
// Loads the MDL layout wrapper HTML component into the document body

async function loadMdlLayoutWrapper() {
    console.log('[MDL Layout Wrapper] Loading MDL layout wrapper component...');

    try {
        const htmlContent = `
<!-- MDL Layout Wrapper Component -->
<div class="mdl-layout mdl-js-layout mdl-layout--fixed-header">
    <!-- Page Header Placeholder -->
    <div id="page-header-placeholder"></div>
    <main class="mdl-layout__content">
        <!-- Main Content Area Placeholder -->
        <div id="main-content-area-placeholder"></div>
    </main>
</div>
`;

        // Insert the MDL layout wrapper into the container if it exists, otherwise body
        const container = document.getElementById('gemini-ui-root') || document.body;
        container.insertAdjacentHTML('beforeend', htmlContent);

        // Remove loading state if it exists
        const loadingState = document.getElementById('app-loading-state');
        if (loadingState) {
            loadingState.remove();
        }

        console.log('[MDL Layout Wrapper] HTML content inserted into body');

        // Wait for Material Design Lite to be available and upgrade components
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(document.body);
            console.log('[MDL Layout Wrapper] MDL components upgraded');
        } else {
            console.warn('[MDL Layout Wrapper] componentHandler not available, skipping upgrade');
        }

        console.log('[MDL Layout Wrapper] MDL layout wrapper component loaded successfully');
        return Promise.resolve();

    } catch (error) {
        console.error('[MDL Layout Wrapper] Error loading MDL layout wrapper component:', error);
        return Promise.reject(error);
    }
}

// Export the function globally
window.loadMdlLayoutWrapper = loadMdlLayoutWrapper; 