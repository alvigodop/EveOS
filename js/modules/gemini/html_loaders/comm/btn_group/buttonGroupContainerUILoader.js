// js/modules/gemini/html_loaders/comm_panel_load/button_group_container_html_loader/buttonGroupContainerUILoader.js
// Loads the Button Group Container HTML component

async function loadButtonGroupContainer() {
    try {
        const html = `
<!-- Voice Control Buttons Container -->
<div class="button-group">
    <div id="start-button-placeholder"></div>
    <div id="stop-button-placeholder"></div>
    <div id="screen-share-button-placeholder"></div>
    <div id="reinitiate-model-button-placeholder"></div>
    <div id="new-chat-button-placeholder"></div>
    <div id="toggle-conversation-history-button-placeholder"></div>
    <div id="system-message-toggle-placeholder" style="margin-left: 10px;"></div>
    <div id="send-history-button-placeholder" style="margin-left: 10px;"></div>
    <div id="clear-chat-button-placeholder"></div>
    <div id="clear-system-log-button-placeholder" style="margin-left: 10px;"></div>
    <div id="toggle-past-chats-button-placeholder"></div>
</div>
`;
        const placeholder = document.getElementById('button-group-container-placeholder');

        if (placeholder) {
            placeholder.innerHTML = html;

            // Upgrade MDL components within the loaded container
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(placeholder);
            }

            console.log('Button group container loaded successfully');
        } else {
            console.warn('Button group container placeholder not found');
        }
    } catch (error) {
        console.error('Error loading button group container:', error);
    }
}

// Export the function to be called by the group aggregator
window.loadButtonGroupContainer = loadButtonGroupContainer; 