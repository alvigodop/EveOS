/**
 * socketCoreLoader.js
 * 
 * Dynamically loads the modularized socket connection scripts in the correct order.
 */

console.log("socketCoreLoader.js loading...");

const SOCKET_CORE_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/client/connection_management/socket_core';

const socketCoreScripts = [
    `${SOCKET_CORE_BASE_PATH}/socketGlobalState.js`, // Load Global State FIRST
    `${SOCKET_CORE_BASE_PATH}/scc/eh/errorEventHandler.js`,
    `${SOCKET_CORE_BASE_PATH}/scc/eh/openEventHandler.js`, // Load Open Event Handler
    `${SOCKET_CORE_BASE_PATH}/scc/socketLifecycle.js`,
    `${SOCKET_CORE_BASE_PATH}/scc/socketConnectionCoordinator.js`,
    `${SOCKET_CORE_BASE_PATH}/socketMessageRouter.js`,
    `${SOCKET_CORE_BASE_PATH}/audioPlayerUI.js`,
    `${SOCKET_CORE_BASE_PATH}/socketAudioLogic.js`,
    `${SOCKET_CORE_BASE_PATH}/serverStatusChecker.js`
];

// Load scripts sequentially to ensure dependencies are met
function loadSocketCoreScripts() {
    console.log("Loading Socket Core scripts...");

    // We can use the same approach as Client_Core_Control/Client_Core_Control.js,
    // but we need to ensure they are loaded and executed in order.
    // Given they just attach to window, parallel loading with defer might be fine,
    // but sequential ensures safety if we had strict dependencies during IIFE execution.
    // However, none of the IIFEs execute critical logic immediately that depends on others
    // except for `State` reference. `defer` preserves order.

    const fragment = document.createDocumentFragment();
    socketCoreScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        document.head.appendChild(script);
    });
}

loadSocketCoreScripts();

console.log("socketCoreLoader.js finished.");
