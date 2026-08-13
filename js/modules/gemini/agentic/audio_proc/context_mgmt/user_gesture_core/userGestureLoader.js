/**
 * userGestureLoader.js
 * Dynamically loads the modularized user gesture handling scripts.
 */

console.log("userGestureLoader.js loading...");

const USER_GESTURE_CORE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/agentic/audio_proc/context_mgmt/user_gesture_core';

const userGestureScripts = [
    `${USER_GESTURE_CORE_PATH}/gestureDetection.js?v=da3efa07f197`,
    `${USER_GESTURE_CORE_PATH}/unlockingLogic.js?v=dd726b819ca4`,
    `${USER_GESTURE_CORE_PATH}/gestureListeners.js?v=595d637b3be9`,
    `${USER_GESTURE_CORE_PATH}/emergencyUnlock.js?v=8ecbfe959cab`,
    `${USER_GESTURE_CORE_PATH}/userGestureCoordinator.js?v=e9013bcc10e1`
];

function loadUserGestureScripts() {
    const fragment = document.createDocumentFragment();
    userGestureScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

loadUserGestureScripts();

console.log("userGestureLoader.js finished.");
