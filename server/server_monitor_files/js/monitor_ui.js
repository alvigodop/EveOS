/**
 * monitor_ui.js
 * 
 * UI manipulation functions for the Server Monitor.
 */

window.MonitorUI = {
    // Function to display messages in the message log
    displayMessage: function (message, isError = false) {
        const messageLog = document.getElementById('messageLog');
        if (!messageLog) return;

        // Check if user is scrolled to the bottom (allow 50px threshold)
        const isScrolledToBottom = messageLog.scrollHeight - messageLog.scrollTop <= messageLog.clientHeight + 50;

        const newMessage = document.createElement('p');
        newMessage.textContent = message;
        newMessage.className = isError ? 'error-message' : 'system-message';
        messageLog.appendChild(newMessage);

        // Only auto-scroll if the user was already at the bottom
        if (isScrolledToBottom) {
            messageLog.scrollTop = messageLog.scrollHeight;
        }
    },

    // Function to update button appearance based on server state
    updateButtonState: function (serverId, isRunning) {
        const button = document.getElementById(`start${serverId.charAt(0).toUpperCase() + serverId.slice(1)}Btn`);
        if (!button) return;

        const icon = button.querySelector('i');
        if (!icon) return;

        button.classList.remove('mdl-button--colored', 'mdl-button--accent');
        button.classList.add(isRunning ? 'mdl-button--accent' : 'mdl-button--colored');
        icon.textContent = isRunning ? 'stop' : 'play_arrow';

        // Update button text
        const serverName = serverId.charAt(0).toUpperCase() + serverId.slice(1);
        button.innerHTML = `<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">${icon.textContent}</i>${isRunning ? 'Stop' : 'Start'} ${serverName} Server`;

        // Update server state
        const previousState = window.MonitorState.serverStates[serverId].running;
        window.MonitorState.serverStates[serverId].running = isRunning;

        // If Main Server state changed from running to not running, we need to update the interface
        if (serverId === 'main' && previousState && !isRunning) {
            // Main server was running and now it's not
            window.MonitorUI.displayMessage("System Message: Main Server status changed to stopped. Updating interface.");

            // Update the interface status
            const geminiStatus = document.querySelector('.gemini-status');
            if (geminiStatus) {
                geminiStatus.textContent = 'Gemini Chat Interface: Not Connected';
                geminiStatus.className = 'gemini-status status-stopped';
            } else {
                // Create status element if it doesn't exist
                const statusContainer = document.createElement('div');
                statusContainer.className = 'gemini-status status-stopped';
                statusContainer.textContent = 'Gemini Chat Interface: Not Connected';
                const header = document.querySelector('.header');
                if (header) header.appendChild(statusContainer);
            }
        }
    },

    // Function to load the frame with proper error handling
    loadFrame: async function () {
        return new Promise((resolve, reject) => {
            const frame = document.getElementById('serverFrame');
            if (!frame) {
                reject(new Error("Frame element not found"));
                return;
            }

            // Set up load handler
            frame.onload = () => {
                console.log("Frame loaded successfully");
                resolve();
            };

            // Set up error handler
            frame.onerror = (error) => {
                console.error("Frame failed to load:", error);
                reject(error);
            };

            // Load the frame
            frame.src = 'http://localhost:8000/gemini_chat_interface.html?t=' + Date.now();
        });
    },

    // Function to refresh frame with proper error handling
    refreshFrame: async function () {
        console.log("Refreshing frame...");
        const frame = document.getElementById('serverFrame');
        if (!frame) return;

        frame.src = 'about:blank';

        // Wait a moment before reloading
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await window.MonitorUI.loadFrame();
            window.MonitorUI.displayMessage("Frame refreshed successfully");
        } catch (error) {
            console.error("Error refreshing frame:", error);
            window.MonitorUI.displayMessage("Failed to refresh frame. Retrying server check...", true);
            if (window.MonitorChecker) await window.MonitorChecker.checkServerStatus();
        }
    },

    // Initialize common UI elements
    initUI: function () {
        // Add Gemini status indicator if missing
        const headerDiv = document.querySelector('.header');
        if (headerDiv && !document.querySelector('.gemini-status')) {
            const geminiStatus = document.createElement('div');
            geminiStatus.className = 'gemini-status status-stopped';
            geminiStatus.textContent = 'Gemini Chat Interface: Not Connected';
            geminiStatus.style.marginTop = '10px';
            geminiStatus.style.padding = '8px 12px';
            geminiStatus.style.borderRadius = '4px';
            geminiStatus.style.fontWeight = 'bold';
            headerDiv.appendChild(geminiStatus);
        }

        // Add a repair button
        const controlsDiv = document.querySelector('.controls');
        if (controlsDiv && !controlsDiv.querySelector('.refresh-btn')) {
            const repairButton = document.createElement('button');
            repairButton.className = 'button refresh-btn';
            repairButton.style.backgroundColor = '#ff9800';
            repairButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">build</i> Repair Connection';
            if (window.MonitorChecker && window.MonitorChecker.forceRestartMainServer) {
                repairButton.addEventListener('click', window.MonitorChecker.forceRestartMainServer);
            }
            controlsDiv.appendChild(repairButton);
        }
    }
};
