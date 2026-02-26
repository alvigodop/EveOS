/**
 * monitor_loader.js
 * 
 * This file acts as the single entry point for loading the Server Monitor's resources.
 * It dynamically injects the stylesheet and the logic script.
 * 
 * This approach keeps the main HTML file clean and strictly modular.
 */

(function loadMonitorResources() {
    console.log("Loading Server Monitor resources...");

    const basePath = "server_monitor_files";

    // 1. Inject CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${basePath}/css/monitor_styles.css`;
    document.head.appendChild(link);
    console.log("Monitor styles injected.");

    // 2. Load Logic Script
    // 2. Load Modules
    const modules = [
        'monitor_state.js',
        'monitor_ui.js',
        'monitor_checker_modules/monitor_checker_loader.js',
        'monitor_commands.js',
        'monitor_logic.js'
    ];

    function loadScript(index) {
        if (index >= modules.length) {
            console.log("All monitor scripts loaded.");
            return;
        }

        const script = document.createElement('script');
        script.src = `${basePath}/js/${modules[index]}`;
        script.onload = () => loadScript(index + 1);
        script.onerror = (e) => console.error(`Failed to load ${modules[index]}:`, e);
        document.body.appendChild(script);
    }

    loadScript(0);

})();
