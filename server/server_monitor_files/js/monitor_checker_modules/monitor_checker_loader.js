/**
 * monitor_checker_loader.js
 * 
 * Aggregator loader for the modularized Monitor Checker components.
 * Loads status check logic and server action logic.
 */

(function loadMonitorCheckerModules() {
    const basePath = "server_monitor_files/js/monitor_checker_modules";

    // Define the modules to load in order
    const modules = [
        "monitor_status_check.js?v=d2fec59cf250",
        "monitor_server_actions.js?v=cdb410b064ef"
    ];

    console.log("Loading Monitor Checker modules...");

    function loadScript(index) {
        if (index >= modules.length) {
            console.log("All Monitor Checker modules loaded.");
            return;
        }

        const scriptPath = `${basePath}/${modules[index]}`;
        const script = document.createElement('script');
        script.src = scriptPath;
        script.onload = () => {
            console.log(`${modules[index]} loaded.`);
            loadScript(index + 1);
        };
        script.onerror = (e) => console.error(`Failed to load ${modules[index]}:`, e);
        document.body.appendChild(script);
    }

    loadScript(0);
})();
