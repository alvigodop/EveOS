// js/modules/gemini/comm/sys_msg_toggle/System_Message_Toggle_Commuication_Panel.js - Manages the loading of system message toggle functionality modules

console.log("js/modules/gemini/comm/sys_msg_toggle/System_Message_Toggle_Commuication_Panel.js started loading");

// Define the base path for system message toggle modules
const SYSTEM_MESSAGE_TOGGLE_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/sys_msg_toggle';

// Define the scripts to load for system message toggle functionality
const systemMessageToggleScripts = [
    `${SYSTEM_MESSAGE_TOGGLE_BASE_PATH}/system_message_visibility_handler/systemMessageVisibilityHandler.js`, // Manages the toggle for showing or hiding system messages.
];

// Create a namespace for System Message Toggle functionality
window.SystemMessageTogglePanel = window.SystemMessageTogglePanel || {};

// Function to load all system message toggle scripts
function loadSystemMessageToggleScripts() {
    const fragment = document.createDocumentFragment();

    systemMessageToggleScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });

    document.head.appendChild(fragment);
}

// Initialize the loading of system message toggle scripts
loadSystemMessageToggleScripts(); 