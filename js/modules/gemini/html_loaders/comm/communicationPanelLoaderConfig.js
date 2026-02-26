/**
 * Configuration for Communication Panel UI HTML loaders.
 */

// Define the base path for Communication Panel UI HTML loaders
// Note: This path is relative to the root of the server/site
const COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm';

// List of individual UI loader aggregator scripts for Communication Panel components
const communicationPanelUILoaderAggregatorScripts = [
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/mm_comm_load/multimodal_communication_html_loaders.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/input_ui/text_input_ui_html_loaders.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/sys_msg/system_message_toggle_ui_html_loaders.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/model_ops/model_operations_ui_html_loaders.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/past_chats/past_chats_ui_html_loaders.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/send_hist/send_chat_history_html_loader.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/clear_chat/clear_chat_ui_html_loaders.js`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/clear_sys/clear_system_log_ui_html_loaders.js`
    // Add other UI loader aggregator scripts for Communication Panel components here in the future
];

// List of individual component UI loader scripts (for simple components that don't need aggregators)
const communicationPanelUILoaderScripts = [
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/btn_group/buttonGroupContainerUILoader.js`
];

// Expose configuration to window
window.communicationPanelLoaderConfig = {
    basePath: COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH,
    aggregatorScripts: communicationPanelUILoaderAggregatorScripts,
    loaderScripts: communicationPanelUILoaderScripts
};
