// js/modules/gemini/Log_Interface_Display/Messaging_System_Log/server_reboot_button/serverRebootButtonHandler.js

// Define the namespace for server reboot functionality
window.LogInterfaceDisplay = window.LogInterfaceDisplay || {};
window.LogInterfaceDisplay.MessagingSystemLog = window.LogInterfaceDisplay.MessagingSystemLog || {};
window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton = window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton || {};

/**
 * Initializes the server reboot button functionality
 */
function initializeServerRebootButton() {
    const rebootButton = document.getElementById('rebootButton');

    if (rebootButton) {
        rebootButton.addEventListener('click', async () => {
            // Ensure displayMessage, resetConnection, and connect are available globally
            // or are properly imported if using a module system in the future.
            if (typeof displayMessage !== 'function') {
                console.error('displayMessage function is not available for server reboot button handler.');
                return;
            }
            if (typeof resetConnection !== 'function' || typeof connect !== 'function') {
                console.error('resetConnection or connect function is not available for server reboot button handler.');
                return;
            }

            displayMessage("System Message: Rebooting Main Server...", true);
            try {
                // Stop the main WebSocket server
                await fetch('/server-control/5', { method: 'POST' });
                // Wait for it to shut down
                await new Promise(resolve => setTimeout(resolve, 3000));
                // Start the main WebSocket server again
                await fetch('/server-control/2', { method: 'POST' });
                displayMessage("System Message: Main Server restarted. Reconnecting...", true);
                // Reset and reconnect the WebSocket
                resetConnection();
                connect();
            } catch (error) {
                console.error("Error restarting main server:", error);
                displayMessage("System Message: Failed to restart Main Server - " + error.message, true);
            }
        });
        console.log('Server reboot button handler initialized successfully');
    } else {
        console.error("Reboot button (rebootButton) not found in serverRebootButtonHandler.js");
    }
}

// Expose the initialization function via the namespace
window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton.initializeServerRebootButton = initializeServerRebootButton; 