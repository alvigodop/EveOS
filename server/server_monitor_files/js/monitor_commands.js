/**
 * monitor_commands.js
 * 
 * Logic for executing commands to control servers.
 */

window.MonitorCommands = {
    // Enhanced command execution
    executeCommand: async function (command, serverId = null, isStopAll = false) {
        const state = window.MonitorState;
        const ui = window.MonitorUI;

        let button = null;
        try {
            // Handle button states
            if (isStopAll) {
                button = document.getElementById('stopAllBtn');
            } else if (serverId) {
                button = document.getElementById(`start${serverId.charAt(0).toUpperCase() + serverId.slice(1)}Btn`);
            }

            if (button) {
                button.disabled = true;
                button.classList.add('loading');
            }

            const action = serverId ?
                (state.serverStates[serverId].running ? 'Stopping' : 'Starting') :
                (command === '7' ? 'Stopping' : command === '8' ? 'Starting' : 'Managing');
            const target = serverId ? `${serverId} server` : 'all servers';
            ui.displayMessage(`System Message: ${action} ${target}...`);

            console.log(`Executing command ${command} for ${serverId || 'all'} servers`);

            try {
                const response = await fetch(`http://localhost:8000/server-control/${command}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    const result = await response.json().catch(() => ({ message: 'Unknown error occurred' }));
                    throw new Error(result.message || `Server returned ${response.status}`);
                }

                // Update button states based on the action
                if (command === '7') { // Stop All
                    Object.keys(state.serverStates).forEach(id => {
                        state.serverStates[id].running = false;
                        ui.updateButtonState(id, false);
                    });
                } else if (command === '8') { // Start All
                    Object.keys(state.serverStates).forEach(id => {
                        state.serverStates[id].running = true;
                        ui.updateButtonState(id, true);
                    });
                } else if (serverId) {
                    const newState = !state.serverStates[serverId].running;
                    ui.updateButtonState(serverId, newState);
                }

                ui.displayMessage(`System Message: Successfully ${action.toLowerCase()} ${target}`);
            } catch (error) {
                throw new Error(`Failed to ${action.toLowerCase()} ${target}: ${error.message}`);
            }

            // Wait a moment then check all statuses
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (window.MonitorChecker) await window.MonitorChecker.checkServerStatus();

        } catch (error) {
            console.error('Error executing command:', error);
            ui.displayMessage(`System Message: ${error.message}`, true);

            // Revert button states on error
            if (command === '7') { // Stop All failed
                Object.keys(state.serverStates).forEach(id => {
                    ui.updateButtonState(id, state.serverStates[id].running);
                });
            } else if (command === '8') { // Start All failed
                Object.keys(state.serverStates).forEach(id => {
                    ui.updateButtonState(id, state.serverStates[id].running);
                });
            } else if (serverId) {
                ui.updateButtonState(serverId, state.serverStates[serverId].running);
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.classList.remove('loading');
            }
        }
    }
};
