/**
 * Configuration for Communication Panel UI HTML loaders.
 */

// Define the base path for Communication Panel UI HTML loaders
// Note: This path is relative to the root of the server/site
const COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH = (window.GEMINI_APP_ROOT || '') + 'js/modules/gemini/html_loaders/comm';

// List of individual UI loader aggregator scripts for Communication Panel components
const communicationPanelUILoaderAggregatorScripts = [
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/mm_comm_load/multimodal_communication_html_loaders.js?v=994c5bc493e4`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/input_ui/text_input_ui_html_loaders.js?v=043471d1de2d`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/sys_msg/system_message_toggle_ui_html_loaders.js?v=1e924c26dfeb`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/model_ops/model_operations_ui_html_loaders.js?v=5dd80c1e152e`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/past_chats/past_chats_ui_html_loaders.js?v=7e4c46cd5b1b`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/send_hist/send_chat_history_html_loader.js?v=302b394fdf9b`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/clear_chat/clear_chat_ui_html_loaders.js?v=d92f1710c5df`,
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/clear_sys/clear_system_log_ui_html_loaders.js?v=f3cea8eff974`
    // Add other UI loader aggregator scripts for Communication Panel components here in the future
];

// List of individual component UI loader scripts (for simple components that don't need aggregators)
const communicationPanelUILoaderScripts = [
    `${COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH}/btn_group/buttonGroupContainerUILoader.js?v=8d18af378001`
];

// Expose configuration to window
window.communicationPanelLoaderConfig = {
    basePath: COMMUNICATION_PANEL_UI_HTML_LOADERS_BASE_PATH,
    aggregatorScripts: communicationPanelUILoaderAggregatorScripts,
    loaderScripts: communicationPanelUILoaderScripts
};
