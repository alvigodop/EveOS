/**
 * pageInitializerLoader.js
 * Dynamically loads the modularized page initialization scripts in the correct order.
 */

console.log("pageInitializerLoader.js loading...");

const COMPONENT_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/client/page_initialization/page_initialization_core';

const pageInitScripts = [
    `${COMPONENT_BASE_PATH}/svgLifecycle.js`,
    `${COMPONENT_BASE_PATH}/displayLoader.js`,
    `${COMPONENT_BASE_PATH}/connectivityStartup.js`,
    `${COMPONENT_BASE_PATH}/initializationCoordinator.js`
];

function loadPageInitScripts() {
    const fragment = document.createDocumentFragment();
    let loadedCount = 0;

    pageInitScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = () => {
            loadedCount++;
            if (loadedCount === pageInitScripts.length) {
                // All scripts loaded, set up the entry point
                setupEntryPoint();
            }
        };
        fragment.appendChild(script);
    });

    document.head.appendChild(fragment);
}

function setupEntryPoint() {
    const entryPoint = () => {
        if (window.PageInitializationCore && window.PageInitializationCore.Coordinator) {
            // Short delay to ensure DOM is ready and other scripts (like svgFixer) have executed
            setTimeout(() => {
                window.PageInitializationCore.Coordinator.start();
            }, 100);
        } else {
            console.error("PageInitializationCore not fully loaded.");
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', entryPoint);
    } else {
        entryPoint();
    }
}

loadPageInitScripts();

console.log("pageInitializerLoader.js finished.");
