function handleQuotaError(errorMessage) {
    console.error("Quota or deadline error detected:", errorMessage);
    
    // Show the reboot button
    const rebootButton = document.getElementById('rebootButton');
    if (rebootButton) {
        rebootButton.style.display = 'block';
    }
    
    // Add the error to the system log
    const systemLog = document.getElementById('systemLog');
    
    // Create messages container if it doesn't exist
    let messagesContainer = systemLog.querySelector('.system-messages-container');
    if (!messagesContainer) {
        messagesContainer = document.createElement('div');
        messagesContainer.className = 'system-messages-container';
        systemLog.appendChild(messagesContainer);
    }
    
    // Create a more detailed error message
    const quotaError = document.createElement('div');
    quotaError.className = 'system-message error';
    quotaError.style.backgroundColor = '#ffebee';
    quotaError.style.borderLeftColor = '#ff4444';
    quotaError.innerHTML = `
        <strong>API Quota Exceeded or Deadline Error</strong><br>
        This usually happens when:<br>
        1. Too many concurrent sessions are active<br>
        2. A request took too long to process<br>
        3. The server is under heavy load<br><br>
        Try restarting the server by clicking the <strong>Reboot Server</strong> button above.
    `;
    
    messagesContainer.appendChild(quotaError);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

console.log("js/modules/gemini/Log_Interface_Display/Messaging_System_Log/error_handling_ui/quotaErrorHandler.js finished loading"); 