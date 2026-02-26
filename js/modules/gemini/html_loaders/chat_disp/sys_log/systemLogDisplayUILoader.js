/**
 * Loads the System Log Display HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadSystemLogDisplay() {
    const placeholder = document.getElementById('system-log-display-placeholder');
    if (!placeholder) {
        console.error('Placeholder for System Log Display not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<div id="systemLog" class="mdl-shadow--2dp">
    <div class="system-header">
        <span>System Messages</span>
        <button id="rebootButton" class="mdl-button mdl-js-button" style="display: none;">
            <i class="material-icons">refresh</i>
            Reboot Server
        </button>
    </div>
    <div class="system-messages-container"></div>
</div>
`;
        placeholder.innerHTML = htmlContent;

        // Manually upgrade MDL components within the loaded HTML
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(placeholder);
        }

        // Initialize the server reboot button functionality after loading
        if (window.LogInterfaceDisplay &&
            window.LogInterfaceDisplay.MessagingSystemLog &&
            window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton &&
            typeof window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton.initializeServerRebootButton === 'function') {
            window.LogInterfaceDisplay.MessagingSystemLog.ServerRebootButton.initializeServerRebootButton();
            console.log('Server reboot button initialized after system log display HTML loaded');
        }

        // Initialize system log display and flush any pending messages
        if (typeof window.initializeSystemLogDisplay === 'function') {
            window.initializeSystemLogDisplay();
            console.log('System log display initialized and pending messages flushed');
        }

        // Debug system message functionality
        setTimeout(() => {
            console.log('=== SYSTEM MESSAGE DEBUG START ===');

            // Check if system log element exists
            const systemLog = document.getElementById('systemLog');
            console.log('System log element found:', !!systemLog);

            // Check if system message toggle exists and its state
            const systemMessagesToggle = document.getElementById('systemMessagesToggle');
            console.log('System toggle element found:', !!systemMessagesToggle);
            if (systemMessagesToggle) {
                console.log('System toggle checked state:', systemMessagesToggle.checked);
                console.log('System toggle localStorage state:', localStorage.getItem('systemMessagesToggleState'));
            }

            // Check if displayMessage function exists
            console.log('displayMessage function available:', typeof window.displayMessage);

            // Test system message functionality
            if (typeof window.displayMessage === 'function') {
                console.log('Testing system message display...');
                window.displayMessage("System Message: DEBUGGING - System log functionality test - this message verifies the system log is working", true);

                // Also test with forced visibility
                setTimeout(() => {
                    const messagesContainer = systemLog?.querySelector('.system-messages-container');
                    if (messagesContainer) {
                        console.log('Messages container found, children count:', messagesContainer.children.length);
                        console.log('Messages container HTML:', messagesContainer.innerHTML.substring(0, 200));
                    } else {
                        console.log('Messages container not found!');
                    }

                    // Force a system message bypass toggle
                    if (systemLog) {
                        const timestamp = new Date().toLocaleTimeString();
                        const newMessage = document.createElement("div");
                        newMessage.className = "system-message status";
                        newMessage.textContent = `[${timestamp}] FORCED MESSAGE: System log display working - toggle bypassed`;

                        let messagesContainer = systemLog.querySelector('.system-messages-container');
                        if (!messagesContainer) {
                            messagesContainer = document.createElement('div');
                            messagesContainer.className = 'system-messages-container';
                            systemLog.appendChild(messagesContainer);
                        }
                        messagesContainer.appendChild(newMessage);
                        console.log('Forced message added directly to DOM');
                    }
                }, 500);
            }

            console.log('=== SYSTEM MESSAGE DEBUG END ===');
        }, 200);

        // Initialize system log display with a message
        if (window.MessagingSystemLog && typeof window.MessagingSystemLog.displayMessage === 'function') {
            window.MessagingSystemLog.displayMessage('System Message: System log display initialized');
        }

        console.log('System Log Display component loaded and upgraded successfully');
        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load System Log Display:', error);
        return Promise.reject(error);
    }
}

// Export the function to be called by the group aggregator
window.loadSystemLogDisplay = loadSystemLogDisplay; 