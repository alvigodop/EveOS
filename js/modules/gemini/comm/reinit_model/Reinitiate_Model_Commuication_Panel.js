// js/modules/gemini/comm/reinit_model/Reinitiate_Model_Commuication_Panel.js
// Manages all model reinitialization and setup functionality

console.log("js/modules/gemini/comm/reinit_model/Reinitiate_Model_Commuication_Panel.js started loading");

// Define namespace for Reinitiate Model Communication Panel
window.ReinitiateModelCommuicationPanel = window.ReinitiateModelCommuicationPanel || {};

// Define the base path for model reinitialization modules
const MODEL_REINIT_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/comm/reinit_model';

// Scripts to load for model reinitialization functionality
const modelReinitScripts = [
    // Core Model Initialization
    `${MODEL_REINIT_BASE_PATH}/model_initialization/modelInitializer.js`,
    `${MODEL_REINIT_BASE_PATH}/model_setup_communication/model_setup_core/setupMessageCreator.js?v=0.2.0`,
    `${MODEL_REINIT_BASE_PATH}/model_setup_communication/model_setup_core/sessionFlowManager.js`,
    `${MODEL_REINIT_BASE_PATH}/model_setup_communication/initialSetupMessageHandler.js`
];

// Function to load all model reinitialization scripts
function loadModelReinitScripts() {
    const fragment = document.createDocumentFragment();
    modelReinitScripts.forEach(scriptPath => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        fragment.appendChild(script);
    });
    document.head.appendChild(fragment);
}

// Function to initialize the model reinitialization module
function initializeModelReinitModule() {
    // Initialize the module's functionality
    window.ReinitiateModelCommuicationPanel = {
        // Model Initialization Functions
        reinitializeModel: window.reinitializeModel || null,
        sendInitialSetupMessage: window.sendInitialSetupMessage || null
    };

    console.log("Model reinitialization panel initialized");
}

// Load scripts
loadModelReinitScripts();

// Initialize after a short delay to ensure scripts are loaded
setTimeout(initializeModelReinitModule, 500);

console.log("js/modules/gemini/comm/reinit_model/Reinitiate_Model_Commuication_Panel.js finished loading and initial execution");
