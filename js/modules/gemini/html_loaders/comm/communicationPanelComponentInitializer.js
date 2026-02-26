/**
 * Orchestrates the initialization of Communication Panel components.
 * Depends on communicationPanelScriptLoader.js
 */

async function initializeCommunicationPanelComponents() {
    console.log("communicationPanelComponentInitializer.js: initializeCommunicationPanelComponents started.");

    try {
        if (!window.communicationPanelScriptLoader) {
            throw new Error("communicationPanelScriptLoader not found");
        }

        // First, dynamically load all the individual UI loader aggregator scripts and simple component scripts
        await Promise.all([
            window.communicationPanelScriptLoader.loadAggregators(),
            window.communicationPanelScriptLoader.loadComponents()
        ]);
        console.log("communicationPanelComponentInitializer.js: All Communication Panel UI loader scripts loaded.");

        // Load the button group container first (this holds placeholders for all other buttons)
        if (typeof window.loadButtonGroupContainer === 'function') {
            await window.loadButtonGroupContainer();
            console.log('Button Group Container loaded.');
        } else {
            console.error('loadButtonGroupContainer function not found after dynamic loading.');
        }

        // Initialize Multimodal Communication Panel HTML Components
        if (typeof window.initializeMultimodalCommunicationHtmlComponents === 'function') {
            await window.initializeMultimodalCommunicationHtmlComponents();
            console.log('Multimodal Communication Panel HTML Components initialized.');
        } else {
            console.error('initializeMultimodalCommunicationHtmlComponents function not found after dynamic loading.');
        }

        // Initialize Text Input UI HTML Components
        if (typeof window.initializeTextInputUIHtmlComponents === 'function') {
            await window.initializeTextInputUIHtmlComponents();
            console.log('Text Input UI HTML Components initialized.');
        } else {
            console.error('initializeTextInputUIHtmlComponents function not found after dynamic loading.');
        }

        // Initialize System Message Toggle UI HTML Components
        if (typeof window.initializeSystemMessageToggleUIHtmlComponents === 'function') {
            await window.initializeSystemMessageToggleUIHtmlComponents();
            console.log('System Message Toggle UI HTML Components initialized.');
        } else {
            console.error('initializeSystemMessageToggleUIHtmlComponents function not found after dynamic loading.');
        }

        // Initialize Model Operations UI HTML Components
        if (typeof window.initializeModelOperationsUIHtmlComponents === 'function') {
            await window.initializeModelOperationsUIHtmlComponents();
            console.log('Model Operations UI HTML Components initialized.');
        } else {
            console.error('initializeModelOperationsUIHtmlComponents function not found after dynamic loading.');
        }

        // Initialize Past Chats UI HTML Components
        if (typeof window.initializePastChatsUIHtmlComponents === 'function') {
            await window.initializePastChatsUIHtmlComponents();
            console.log('Past Chats UI HTML Components initialized.');
        } else {
            console.error('initializePastChatsUIHtmlComponents function not found after dynamic loading.');
        }

        // Initialize Send Chat History UI HTML Components
        if (typeof window.initializeSendChatHistoryUIHtmlComponents === 'function') {
            await window.initializeSendChatHistoryUIHtmlComponents();
            console.log('Send Chat History UI HTML Components initialized.');
        } else {
            console.error('initializeSendChatHistoryUIHtmlComponents function not found after dynamic loading.');
        }

        // Initialize Clear Chat UI HTML Components
        if (typeof window.initializeClearChatUIHtmlComponents === 'function') {
            await window.initializeClearChatUIHtmlComponents();
            console.log('Clear Chat UI HTML Components initialized.');
        } else {
            console.error('initializeClearChatUIHtmlComponents function not found after dynamic loading.');
        }

        // Initialize Clear System Log UI HTML Components
        if (typeof window.initializeClearSystemLogUIHtmlComponents === 'function') {
            await window.initializeClearSystemLogUIHtmlComponents();
            console.log('Clear System Log UI HTML Components initialized.');
        } else {
            console.error('initializeClearSystemLogUIHtmlComponents function not found after dynamic loading.');
        }

    } catch (error) {
        console.error("Error in initializeCommunicationPanelComponents:", error);
    }

    console.log("communicationPanelComponentInitializer.js: initializeCommunicationPanelComponents finished.");
}

// Expose initialization function
window.initializeCommunicationPanelComponents = initializeCommunicationPanelComponents;
