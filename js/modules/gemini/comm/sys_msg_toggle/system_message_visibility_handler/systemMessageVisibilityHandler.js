window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.SystemMessageToggleCommunicationPanel = window.CommunicationPanel.SystemMessageToggleCommunicationPanel || {};

window.CommunicationPanel.SystemMessageToggleCommunicationPanel.initializeSystemMessageToggleHandler = function() {
    const systemMessagesToggle = document.getElementById('systemMessagesToggle');
    const systemLog = document.getElementById('systemLog');

    if (!systemMessagesToggle) {
        console.warn('System messages toggle not found. Will try again after a delay.');
        // Retry after a short delay to allow for async HTML loading
        setTimeout(() => {
            window.CommunicationPanel.SystemMessageToggleCommunicationPanel.initializeSystemMessageToggleHandler();
        }, 500);
        return;
    }

    if (!systemLog) {
        console.debug('System log element not found. Toggle will work but visibility changes may not be immediate.');
        // Continue with initialization even without system log - it might be loaded later
    }

    // FORCE ENABLE system messages - clear any bad localStorage
    console.log(`[System Toggle Debug] Forcing system messages to be enabled...`);
    
    // Clear any potentially problematic localStorage
    const storedState = localStorage.getItem('systemMessagesToggleState');
    console.log(`[System Toggle Debug] Previous stored state: ${storedState}`);
    
    // Force enable system messages
    const showSystemMessages = true;
    systemMessagesToggle.checked = true;
    localStorage.setItem('systemMessagesToggleState', 'true');
    
    console.log(`[System Toggle Debug] System messages FORCED to enabled state: ${showSystemMessages}`);

    // Ensure MDL visual state is correct
    // Check if componentHandler is available and the element has been upgraded by MDL
    if (window.componentHandler && systemMessagesToggle.parentElement && systemMessagesToggle.parentElement.classList.contains('is-upgraded')) {
        if (systemMessagesToggle.parentElement.MaterialSwitch) {
            systemMessagesToggle.parentElement.MaterialSwitch.on();
        }
    } else if (systemMessagesToggle.parentElement && systemMessagesToggle.parentElement.classList.contains('mdl-switch')) {
        // Fallback for MDL state if MaterialSwitch object isn't directly available or not upgraded yet
        systemMessagesToggle.parentElement.classList.add('is-checked');
    }
    
    // Set initial visibility of the system log if it exists
    if (systemLog) {
        systemLog.style.display = 'block';
        console.log(`[System Toggle Debug] System log visibility set to block`);
    }

    // Add event listener for the toggle
    systemMessagesToggle.addEventListener('change', function() {
        const newState = this.checked;
        localStorage.setItem('systemMessagesToggleState', newState.toString());
        
        console.log(`[System Toggle Debug] Toggle changed to: ${newState}`);
        
        // Update system log visibility if it exists
        const currentSystemLog = document.getElementById('systemLog');
        if (currentSystemLog) {
            currentSystemLog.style.display = newState ? 'block' : 'none';
        }
        
        // displayMessage function is expected to be globally available or part of a namespace
        // Assuming it's available as window.displayMessage or similar as per other modules
        if (typeof window.displayMessage === 'function') {
            window.displayMessage(`System Message: System messages ${newState ? 'enabled' : 'disabled'}`, true);
        } else if (window.LogInterfaceDisplay && window.LogInterfaceDisplay.MessagingLog && typeof window.LogInterfaceDisplay.MessagingLog.displayMessage === 'function') {
            window.LogInterfaceDisplay.MessagingLog.displayMessage(`System Message: System messages ${newState ? 'enabled' : 'disabled'}`, true);
        } else {
            console.log(`System messages ${newState ? 'enabled' : 'disabled'}`);
        }
    });
    
    console.log(`System Message Toggle Handler initialized. FORCED State: ${showSystemMessages}`);
}; 