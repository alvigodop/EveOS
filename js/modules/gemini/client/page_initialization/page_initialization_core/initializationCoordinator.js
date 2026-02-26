/**
 * initializationCoordinator.js
 * Orchestrates the page initialization sequence: SVG Init -> HTML Load -> Connectivity.
 */

window.PageInitializationCore = window.PageInitializationCore || {};

window.PageInitializationCore.Coordinator = {
    start: async function () {
        console.log("Initialization Coordinator: Starting sequence...");

        const Core = window.PageInitializationCore;

        // 1. Initial SVG Setup & Messages
        Core.SvgLifecycle.init();
        Core.ConnectivityStartup.showInitialMessage();
        Core.ConnectivityStartup.preInitReset();

        console.log("Audio context initialization deferred until user interaction");

        // 2. Load HTML Components
        try {
            await Core.DisplayLoader.loadHtmlComponents();

            // 3. Post-Load SVG Fixes
            // Apply fixes after all newly loaded components are in DOM
            setTimeout(() => {
                Core.SvgLifecycle.runFixes();
            }, 200);

            // 4. Start Connectivity & Restore State
            Core.ConnectivityStartup.init();

        } catch (error) {
            console.error("Initialization Coordinator: Failed to load HTML components.", error);
        }
    }
};

console.log("initializationCoordinator.js loaded.");
