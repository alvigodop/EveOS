/**
 * socketCoreLoader.js
 * 
 * Dynamically loads the modularized socket connection scripts in the correct order.
 */

console.log("socketCoreLoader.js loading...");

const SOCKET_CORE_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/client/connection_management/socket_core';

const socketCoreScripts = [
    `${SOCKET_CORE_BASE_PATH}/socketGlobalState.js?v=0.2.1`, // Load Global State FIRST
    `${SOCKET_CORE_BASE_PATH}/scc/eh/errorEventHandler.js?v=0.2.1`,
    `${SOCKET_CORE_BASE_PATH}/scc/eh/openEventHandler.js?v=0.2.0`,
    `${SOCKET_CORE_BASE_PATH}/scc/eh/closeEventHandler.js?v=0.2.3`,
    `${SOCKET_CORE_BASE_PATH}/scc/socketConnectionState.js`,
    `${SOCKET_CORE_BASE_PATH}/scc/socketLifecycle.js`,
    `${SOCKET_CORE_BASE_PATH}/scc/socketConnectionCoordinator.js`,
    `${SOCKET_CORE_BASE_PATH}/socketMessageRouter.js?v=0.2.4`,
    `${SOCKET_CORE_BASE_PATH}/audioPlayerUI.js`,
    `${SOCKET_CORE_BASE_PATH}/socketAudioLogic.js`,
    `${SOCKET_CORE_BASE_PATH}/serverStatusChecker.js?v=0.2.6`
];

// Load scripts sequentially to ensure dependencies are met
function loadSocketCoreScripts() {
    console.log("Loading Socket Core scripts...");

    // Load sequentially: this module chain has hard ordering dependencies.
    const loadSequentially = (index = 0) => {
        if (index >= socketCoreScripts.length) {
            console.log("socketCoreLoader.js finished. All socket core scripts loaded.");
            window.__GEMINI_SOCKET_READY = true;
            window.dispatchEvent(new CustomEvent('eve:gemini-socket-ready'));
            return;
        }

        const scriptPath = socketCoreScripts[index];
        const script = document.createElement('script');
        script.src = scriptPath;
        script.async = false;

        script.onload = () => loadSequentially(index + 1);
        script.onerror = (err) => {
            console.error(`Failed to load socket core script: ${scriptPath}`, err);
            loadSequentially(index + 1);
        };

        document.head.appendChild(script);
    };

    loadSequentially();
}

loadSocketCoreScripts();
