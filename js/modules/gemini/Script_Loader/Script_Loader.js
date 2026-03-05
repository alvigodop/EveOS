// js/modules/gemini/Script_Loader/Script_Loader.js
// Centralized Script Loader for Gemini Chat Interface.
// Loads Gemini child modules lazily to avoid blocking initial app startup.

console.log('js/modules/gemini/Script_Loader/Script_Loader.js started loading');

const APP_ROOT = window.GEMINI_APP_ROOT || '';
const BASE_PATHS = {
    AGENTIC: APP_ROOT + 'js/modules/gemini/agentic',
    CLIENT_CORE: APP_ROOT + 'js/modules/gemini/client',
    LOG_INTERFACE: APP_ROOT + 'js/modules/gemini/logs',
    COMM_PANEL: APP_ROOT + 'js/modules/gemini/comm'
};

const AUTO_BOOT_IDLE_TIMEOUT_MS = 4000;
const AUTO_BOOT_FALLBACK_DELAY_MS = 1500;

// Order matters: Core -> Components -> Features -> UI
const masterScriptList = [
    // Debugging
    APP_ROOT + 'js/modules/gemini/debugTranscription.js',

    // 1. Client Core Control
    APP_ROOT + 'js/modules/gemini/comm/send_hist/chat_history_local_storage/localStorageHelper.js',
    `${BASE_PATHS.CLIENT_CORE}/application_state_management/applicationStateManager.js`,
    `${BASE_PATHS.CLIENT_CORE}/page_initialization/error_filtering/errorFilter.js`,
    `${BASE_PATHS.CLIENT_CORE}/page_initialization/svg_fixing/svgFixerLoader.js`,
    `${BASE_PATHS.CLIENT_CORE}/page_initialization/page_initialization_core/pageInitializerLoader.js`,
    `${BASE_PATHS.CLIENT_CORE}/themeToggle.js`,
    `${BASE_PATHS.CLIENT_CORE}/response_handling/responseClass.js`,
    `${BASE_PATHS.CLIENT_CORE}/connection_management/connection_status_core/connectionStatusLoader.js`,
    `${BASE_PATHS.CLIENT_CORE}/connection_management/idleDetector.js`,
    `${BASE_PATHS.CLIENT_CORE}/connection_management/heartbeat_core/heartbeatLoader.js`,
    `${BASE_PATHS.CLIENT_CORE}/connection_management/autoSetupHandler.js`,
    `${BASE_PATHS.CLIENT_CORE}/connection_management/socket_core/socketCoreLoader.js`,
    `${BASE_PATHS.CLIENT_CORE}/connection_management/waitForConnection.js`,

    // 2. Agentic Functions
    `${BASE_PATHS.AGENTIC}/audio_proc/audio_proc.js`,
    `${BASE_PATHS.AGENTIC}/self_talk/self_talk.js`,
    `${BASE_PATHS.AGENTIC}/scr_cap/scr_cap.js`,
    `${BASE_PATHS.AGENTIC}/sess_ctrl/sess_ctrl.js`,
    `${BASE_PATHS.AGENTIC}/conv_mem/conv_mem.js`,
    `${BASE_PATHS.AGENTIC}/time_perc/time_perc.js`,

    // 3. Log Interface Display
    `${BASE_PATHS.LOG_INTERFACE}/msg_log/msg_log.js`,
    `${BASE_PATHS.LOG_INTERFACE}/sys_log/sys_log.js`,
    `${BASE_PATHS.LOG_INTERFACE}/msg_int/msg_int.js`,
    `${BASE_PATHS.LOG_INTERFACE}/msg_int/popout_chat_feature/popoutChatHandler.js`,
    `${BASE_PATHS.LOG_INTERFACE}/msg_int/text_message_operations/textMessageSender.js`,
    `${BASE_PATHS.LOG_INTERFACE}/msg_int/text_input_handling/textInputHandler.js`,

    // 4. Communication Panel
    `${BASE_PATHS.COMM_PANEL}/mm_panel/Multimodal_Commuication_Panel.js`,
    `${BASE_PATHS.COMM_PANEL}/new_chat/Start_New_Chat_Commuication_Panel.js`,
    `${BASE_PATHS.COMM_PANEL}/clear_chat/Clear_Chat_Communication_Panel.js`,
    `${BASE_PATHS.COMM_PANEL}/clear_sys_log/Clear_System_Log_Commuication_Panel.js`,
    `${BASE_PATHS.COMM_PANEL}/past_chats/Toggle_Past_Chats_Commuication_Panel.js`,
    `${BASE_PATHS.COMM_PANEL}/sys_msg_toggle/System_Message_Toggle_Commuication_Panel.js`,
    `${BASE_PATHS.COMM_PANEL}/reinit_model/Reinitiate_Model_Commuication_Panel.js`,

    // 5. Aggregator Modules
    APP_ROOT + 'js/modules/gemini/client/Client_Core_Control.js',
    APP_ROOT + 'js/modules/gemini/agentic/Agentic_js_Functions.js',
    APP_ROOT + 'js/modules/gemini/logs/Log_Interface_Display.js',
    APP_ROOT + 'js/modules/gemini/comm/Communication_Panel.js'
];

let bootStarted = false;

function normalizeScriptPath(path) {
    return String(path || '').replace(/^https?:\/\/[^/]+\//i, '/');
}

function hasScriptTag(path) {
    const target = normalizeScriptPath(path);
    const scripts = document.querySelectorAll('script[src]');
    for (const script of scripts) {
        if (normalizeScriptPath(script.getAttribute('src')) === target) {
            return true;
        }
    }
    return false;
}

function shouldEagerBoot() {
    try {
        const qs = new URLSearchParams(window.location.search || '');
        if (qs.get('geminiBoot') === 'eager') return true;
        return window.localStorage && window.localStorage.getItem('eve.geminiBoot') === 'eager';
    } catch (e) {
        return false;
    }
}

function loadAllScripts() {
    console.log('Script_Loader: Starting to load all application scripts...');

    const deduped = [];
    const seen = new Set();
    for (const path of masterScriptList) {
        const key = normalizeScriptPath(path);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(path);
    }

    let loadedCount = 0;
    const totalScripts = deduped.length;

    deduped.forEach(scriptPath => {
        if (hasScriptTag(scriptPath)) {
            loadedCount++;
            return;
        }

        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;

        script.onload = () => {
            loadedCount++;
            if (loadedCount % 5 === 0 || loadedCount === totalScripts) {
                console.log(`Script_Loader: Progress ${loadedCount}/${totalScripts}`);
            }
        };

        script.onerror = (e) => {
            console.error(`ERROR: Failed to load script: ${scriptPath}`, e);
        };

        document.head.appendChild(script);
    });

    console.log(`Script_Loader: All ${totalScripts} script tags appended to head.`);
}

function startGeminiBoot(reason) {
    if (bootStarted) return;
    bootStarted = true;
    window.__GEMINI_BOOT_STARTED = true;
    console.log(`Script_Loader: Starting Gemini module load (${reason || 'auto'})`);
    loadAllScripts();
}

function scheduleDeferredBoot() {
    const run = () => {
        if (window.__GEMINI_BOOT_REQUESTED) {
            startGeminiBoot('requested');
            return;
        }

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => startGeminiBoot('idle'), { timeout: AUTO_BOOT_IDLE_TIMEOUT_MS });
            return;
        }

        window.setTimeout(() => startGeminiBoot('timeout-fallback'), AUTO_BOOT_FALLBACK_DELAY_MS);
    };

    if (document.readyState === 'complete') {
        run();
    } else {
        window.addEventListener('load', run, { once: true });
    }
}

// Expose manual trigger for on-demand startup from gemini-init.js.
window.__loadGeminiScriptsNow = function () {
    window.__GEMINI_BOOT_REQUESTED = true;
    startGeminiBoot('manual');
};

if (window.__GEMINI_BOOT_REQUESTED || shouldEagerBoot()) {
    startGeminiBoot(window.__GEMINI_BOOT_REQUESTED ? 'pre-requested' : 'eager');
} else {
    scheduleDeferredBoot();
}
