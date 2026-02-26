/**
 * monitor_server_actions.js
 * 
 * Logic for server control actions (restart, refresh).
 * Part of the modularized MonitorChecker.
 */

window.MonitorChecker = window.MonitorChecker || {};

// Add a function to force restart the Main Server if it's not responding
window.MonitorChecker.forceRestartMainServer = async function () {
    const ui = window.MonitorUI;
    const cmds = window.MonitorCommands;

    ui.displayMessage("System Message: Gemini Chat interface not connecting. Force restarting Main Server...");

    try {
        // First stop the Main Server
        if (cmds) await cmds.executeCommand('5');
        else console.error("MonitorCommands not loaded");

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Then start it again
        if (cmds) await cmds.executeCommand('2');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check if it's now working
        await window.MonitorChecker.checkServerStatus(true);

        // Refresh the frame
        ui.refreshFrame();

        ui.displayMessage("System Message: Main Server restarted. Checking connection status...");
    } catch (error) {
        console.error("Error restarting Main Server:", error);
        ui.displayMessage("System Message: Failed to restart Main Server. Please try manually.", true);
    }
};

// Modify the refreshGeminiDemo function to check for actual connectivity
window.MonitorChecker.refreshGeminiDemo = async function () {
    const state = window.MonitorState;
    const ui = window.MonitorUI;
    const cmds = window.MonitorCommands;

    console.log("Refreshing Gemini Demo...");
    ui.displayMessage("System Message: Refreshing Gemini Demo interface...");

    try {
        // First check if HTTP server is running
        const statusResponse = await fetch('http://localhost:8000/status', {
            method: 'HEAD',
            cache: 'no-store'
        });

        if (!statusResponse.ok) {
            ui.displayMessage("System Message: HTTP Server is not running. Starting server...", true);
            if (cmds) await cmds.executeCommand('3'); // Start HTTP server
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for server to start
        }

        // Check if Main Server is actually responding to WebSocket connections
        const mainServerRunning = state.serverStates.main.running;
        if (mainServerRunning) {
            // Verify it's actually accepting websocket connections
            const isConnected = await window.MonitorChecker.checkMainServerWebSocket();

            if (!isConnected) {
                ui.displayMessage("System Message: Main Server is reported as running but not accepting connections. Attempting to restart...", true);
                await window.MonitorChecker.forceRestartMainServer();
            }
        } else {
            // If Main Server is not running, start it
            ui.displayMessage("System Message: Main Server is not running. Starting server...");
            if (cmds) await cmds.executeCommand('2'); // Start Main server
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for server to start
        }

        const frame = document.getElementById('serverFrame');
        if (frame) {
            frame.src = 'about:blank';

            // Wait a moment before reloading
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Load the Gemini interface with a cache-busting parameter
            frame.src = `http://localhost:8000/gemini_chat_interface.html?t=${Date.now()}`;
        }

        ui.displayMessage("System Message: Gemini Demo interface refreshed");

        // Check server status after refresh
        setTimeout(window.MonitorChecker.checkServerStatus, 2000);

    } catch (error) {
        console.error("Error refreshing Gemini Demo:", error);
        ui.displayMessage("System Message: Failed to refresh Gemini Demo. Checking server status...", true);
        await window.MonitorChecker.checkServerStatus();
    }
};
