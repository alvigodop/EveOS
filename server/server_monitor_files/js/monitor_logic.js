/**
 * monitor_logic.js
 * 
 * Main entry point for the Server Monitor.
 * Connects the modularized components:
 * - monitor_state.js
 * - monitor_ui.js
 * - monitor_checker.js
 * - monitor_commands.js
 */

// Initialize event listeners
function initEventListeners() {
    const cmds = window.MonitorCommands;
    if (!cmds) return;

    // Update button event listeners with better error handling
    const startLauncherBtn = document.getElementById('startLauncherBtn');
    if (startLauncherBtn) {
        startLauncherBtn.addEventListener('click', async () => {
            const serverId = 'launcher';
            const isRunning = window.MonitorState.serverStates[serverId].running;
            const command = isRunning ? '4' : '1';
            await cmds.executeCommand(command, serverId);
        });
    }

    const startMainBtn = document.getElementById('startMainBtn');
    if (startMainBtn) {
        startMainBtn.addEventListener('click', async () => {
            const serverId = 'main';
            const isRunning = window.MonitorState.serverStates[serverId].running;
            const command = isRunning ? '5' : '2';
            await cmds.executeCommand(command, serverId);
        });
    }

    const startHttpBtn = document.getElementById('startHttpBtn');
    if (startHttpBtn) {
        startHttpBtn.addEventListener('click', async () => {
            const serverId = 'http';
            const isRunning = window.MonitorState.serverStates[serverId].running;
            const command = isRunning ? '6' : '3';
            await cmds.executeCommand(command, serverId);
        });
    }

    const stopAllBtn = document.getElementById('stopAllBtn');
    if (stopAllBtn) {
        stopAllBtn.addEventListener('click', async () => {
            try {
                window.MonitorUI.displayMessage("System Message: Stopping all servers...");
                await cmds.executeCommand('7', null, true);
            } catch (error) {
                console.error('Error stopping all servers:', error);
                window.MonitorUI.displayMessage(`System Message: Error stopping servers - ${error.message}`, true);
            }
        });
    }

    const startAllBtn = document.getElementById('startAllBtn');
    if (startAllBtn) {
        startAllBtn.addEventListener('click', async () => {
            try {
                window.MonitorUI.displayMessage("System Message: Starting all servers...");
                await cmds.executeCommand('8', null, true);
            } catch (error) {
                console.error('Error starting all servers:', error);
                window.MonitorUI.displayMessage(`System Message: Error starting servers - ${error.message}`, true);
            }
        });
    }

    const restartAllBtn = document.getElementById('restartAllBtn');
    if (restartAllBtn) {
        restartAllBtn.addEventListener('click', async () => {
            try {
                window.MonitorUI.displayMessage("System Message: Restarting all servers...");
                const ui = window.MonitorUI;
                const state = window.MonitorState;

                // Stop all servers
                await cmds.executeCommand('7');
                Object.keys(state.serverStates).forEach(serverId => {
                    ui.updateButtonState(serverId, false);
                });
                // Wait before starting
                await new Promise(resolve => setTimeout(resolve, 3000));
                // Start all servers
                await cmds.executeCommand('8');
                Object.keys(state.serverStates).forEach(serverId => {
                    ui.updateButtonState(serverId, true);
                });
                // Force a final status check
                setTimeout(window.MonitorChecker.checkServerStatus, 2000);
            } catch (error) {
                console.error('Error restarting servers:', error);
                window.MonitorUI.displayMessage(`System Message: Error during restart - ${error.message}`, true);
            }
        });
    }

    // Add event listener to check status when page visibility changes (tab becomes active)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Force a status check when the page becomes visible again
            if (window.MonitorChecker) window.MonitorChecker.checkServerStatus(true);
        }
    });

}

// Initialize status checking on load
window.onload = async function () {
    try {
        const ui = window.MonitorUI;
        const checker = window.MonitorChecker;
        const state = window.MonitorState;

        // Initialize UI components
        ui.initUI();

        // Initialize listeners
        initEventListeners();

        // Display initial message while checking status
        ui.displayMessage("System Message: Initializing monitor...");

        // Immediately check server status on page load
        await checker.checkServerStatus(true);

        // Check if Main Server is actually accepting connections
        if (state.serverStates.main.running) {
            const isConnected = await checker.checkMainServerWebSocket();
            if (!isConnected) {
                ui.displayMessage("System Message: Main Server is not properly accepting connections. Will attempt auto-restart...", true);

                // Schedule a restart after a short delay
                setTimeout(checker.forceRestartMainServer, 2000);
            } else {
                // Update Gemini status if WebSocket is working
                const geminiStatus = document.querySelector('.gemini-status');
                if (geminiStatus) {
                    geminiStatus.textContent = 'Gemini Chat Interface: Connected';
                    geminiStatus.className = 'gemini-status status-running';
                }
                ui.displayMessage("System Message: Main Server is running and accepting connections.");
            }
        }

        // Set up periodic status checks
        setInterval(() => checker.checkServerStatus(), state.CHECK_INTERVAL);

        // Set up periodic WebSocket connection check for Main Server
        setInterval(async () => {
            if (state.serverStates.main.running) {
                const isConnected = await checker.checkMainServerWebSocket();
                const geminiStatus = document.querySelector('.gemini-status');

                if (geminiStatus) {
                    if (isConnected) {
                        geminiStatus.textContent = 'Gemini Chat Interface: Connected';
                        geminiStatus.className = 'gemini-status status-running';
                    } else {
                        geminiStatus.textContent = 'Gemini Chat Interface: Not Connected';
                        geminiStatus.className = 'gemini-status status-stopped';
                    }
                }

                // If not connected but reported as running, schedule a restart
                if (!isConnected && !window.MonitorState.isRestartingMainServer) {
                    ui.displayMessage("System Message: Main Server is reported as running but not accepting connections. Will attempt auto-restart...", true);
                    // Set a flag to prevent multiple simultaneous restart attempts
                    window.MonitorState.isRestartingMainServer = true;
                    await checker.forceRestartMainServer();
                    // Reset the flag after restart attempt
                    setTimeout(() => { window.MonitorState.isRestartingMainServer = false; }, 10000);
                }
            }
        }, 15000); // Check WebSocket connectivity every 15 seconds

        // Display ready message
        ui.displayMessage("System Message: Monitor ready. Use the buttons above to control servers.");

    } catch (error) {
        console.error("Error during initialization:", error);
        if (window.MonitorUI) window.MonitorUI.displayMessage("System Message: Error checking server status. Please ensure HTTP server is running.", true);
    }
};
