/**
 * connectionStatusLoader.js
 * Dynamically loads the modularized connection status scripts.
 */

(function loadConnectionStatusScripts() {
    console.log("connectionStatusLoader.js loading...");

    const COMPONENT_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/client/connection_management/connection_status_core';

    const scripts = [
        `${COMPONENT_BASE_PATH}/connectionState.js?v=cdfdd45ef7a6`,
        `${COMPONENT_BASE_PATH}/connectionUIUpdater.js?v=264c569702f1`,
        `${COMPONENT_BASE_PATH}/connectionStatusCoordinator.js?v=8c03e5e17fe3`
    ];

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.type = 'text/javascript';
            script.defer = true;
            script.onload = () => {
                console.log(`${src} loaded.`);
                resolve();
            };
            script.onerror = (err) => {
                console.error(`Failed to load script: ${src}`, err);
                reject(err);
            };
            document.head.appendChild(script);
        });
    }

    // Load scripts sequentially to ensure dependencies are met
    async function loadAllScripts() {
        console.log("Loading Connection Status Core scripts...");
        try {
            for (const script of scripts) {
                await loadScript(script);
            }
            console.log("connectionStatusLoader.js finished. All modules loaded.");
        } catch (error) {
            console.error("Critical Error loading connection status modules:", error);
        }
    }

    loadAllScripts();

})();
