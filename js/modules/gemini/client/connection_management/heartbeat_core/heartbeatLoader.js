/**
 * heartbeatLoader.js
 * Dynamically loads the modularized heartbeat core scripts.
 */

(function loadHeartbeatCoreScripts() {
    console.log("heartbeatLoader.js loading...");

    const SOCKET_HEARTBEAT_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/client/connection_management/heartbeat_core';

    const scripts = [
        `${SOCKET_HEARTBEAT_PATH}/ping_pong/socketCleanup.js`,
        `${SOCKET_HEARTBEAT_PATH}/ping_pong/pingPongHandlers.js`,
        `${SOCKET_HEARTBEAT_PATH}/ping_pong/connectionHealthMonitor.js`,
        `${SOCKET_HEARTBEAT_PATH}/ping_pong/socketEventWrappers.js`,
        `${SOCKET_HEARTBEAT_PATH}/ping_pong/nativePingPongCoordinator.js`
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

    // Load scripts sequentially to ensure order (though they are mostly independent)
    async function loadAllHeartbeatScripts() {
        console.log("Loading Heartbeat Core scripts...");
        try {
            for (const script of scripts) {
                await loadScript(script);
            }
            console.log("heartbeatLoader.js finished. All heartbeat core scripts loaded.");
        } catch (error) {
            console.error("Critical Error loading heartbeat core scripts:", error);
        }
    }

    loadAllHeartbeatScripts();

})();
