/**
 * initializationCoordinator.js
 * Orchestrates the page initialization sequence: SVG Init -> HTML Load -> Connectivity.
 */

window.PageInitializationCore = window.PageInitializationCore || {};
let coordinatorPromise = null;

window.PageInitializationCore.Coordinator = {
    start: function () {
        if (coordinatorPromise) return coordinatorPromise;

        coordinatorPromise = (async function () {
            console.log("Initialization Coordinator: Starting sequence...");

            const Core = window.PageInitializationCore;

            // 1. Initial SVG Setup & Messages
            Core.SvgLifecycle.init();
            Core.ConnectivityStartup.showInitialMessage();
            Core.ConnectivityStartup.preInitReset();

            console.log("Audio context initialization deferred until user interaction");

            // 2. Load HTML Components
            await Core.DisplayLoader.loadHtmlComponents();

            // 3. Post-Load SVG Fixes
            // Apply fixes after all newly loaded components are in DOM
            setTimeout(() => {
                Core.SvgLifecycle.runFixes();
            }, 200);

            // 4. Start Connectivity & Restore State
            await Core.ConnectivityStartup.init();
            const detail = {
                readyAt: Date.now(),
                textInputReady: !!document.getElementById('textInput'),
                sendButtonReady: !!document.getElementById('sendButton')
            };
            window.__GEMINI_WORKSPACE_READY = detail;
            window.dispatchEvent(new CustomEvent('eve:gemini-workspace-ready', { detail }));
            return detail;
        })().catch(function (error) {
            console.error("Initialization Coordinator: Failed to load HTML components.", error);
            coordinatorPromise = null;
            throw error;
        });

        window.__GEMINI_WORKSPACE_PROMISE = coordinatorPromise;
        return coordinatorPromise;
    }
};

console.log("initializationCoordinator.js loaded.");
