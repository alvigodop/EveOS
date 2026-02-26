/**
 * Loads the Connection Status Indicator HTML component and inserts it into the page.
 * Returns a Promise that resolves when the loading and insertion is complete.
 */
async function loadConnectionStatusIndicator() {
    const placeholder = document.getElementById('connection-status-placeholder');
    if (!placeholder) {
        console.warn('Placeholder for Connection Status Indicator not found!');
        return Promise.reject('Placeholder not found');
    }

    try {
        const htmlContent = `
<!-- Connection Status Indicator -->
<div class="connection-status" style="display: flex; align-items: center; gap: 8px;">
    <div id="connectionDot" class="connection-dot" style="
        width: 12px; 
        height: 12px; 
        border-radius: 50%; 
        background-color: #9e9e9e;
        transition: background-color 0.3s ease;
    "></div>
    <span id="connectionText" class="connection-text" style="
        color: #333;
        font-size: 14px;
        font-weight: 500;
    ">Not Connected</span>
</div>
`;
        placeholder.innerHTML = htmlContent;

        console.log('Connection Status Indicator HTML loaded successfully.');

        // After loading the HTML, initialize the connection status properly
        initializeConnectionStatusAfterLoad();

        // Notify the connection manager that elements are now available
        if (typeof window.markConnectionElementsAvailable === 'function') {
            window.markConnectionElementsAvailable();
        }

        // Also update the global webSocketConnectionManager to retry status updates
        if (typeof window.updateConnectionStatus === 'function') {
            // Call the global update function to sync status now that elements exist
            setTimeout(() => {
                if (typeof window.getCurrentConnectionStatus === 'function') {
                    const currentStatus = window.getCurrentConnectionStatus();
                    if (currentStatus && currentStatus.status) {
                        window.updateConnectionStatus(currentStatus.status, currentStatus.message);
                    }
                }
            }, 50);
        }

        return Promise.resolve();

    } catch (error) {
        console.error('Failed to load Connection Status Indicator HTML:', error);
        return Promise.reject(error);
    }
}

/**
 * Initializes the connection status after the HTML elements are loaded.
 * This ensures the status reflects the actual WebSocket connection state.
 */
function initializeConnectionStatusAfterLoad() {
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');

    if (!connectionDot || !connectionText) {
        console.warn('Connection status elements not found after loading HTML component');
        return;
    }

    // First, try to get the current status from the connection manager
    if (typeof window.getCurrentConnectionStatus === 'function') {
        const currentStatus = window.getCurrentConnectionStatus();
        if (currentStatus && currentStatus.status) {
            updateConnectionStatusElements(currentStatus.status, currentStatus.message);
            console.log('Connection status initialized from stored state:', currentStatus);
            return;
        }
    }

    // Fallback: Check if there's a global WebSocket connection to determine the current status
    if (typeof window.webSocket !== 'undefined' && window.webSocket) {
        const wsState = window.webSocket.readyState;

        switch (wsState) {
            case WebSocket.CONNECTING:
                updateConnectionStatusElements('connecting', 'Connecting...');
                break;
            case WebSocket.OPEN:
                updateConnectionStatusElements('connected', 'Connected');
                break;
            case WebSocket.CLOSING:
                updateConnectionStatusElements('disconnected', 'Disconnecting...');
                break;
            case WebSocket.CLOSED:
                updateConnectionStatusElements('disconnected', 'Disconnected');
                break;
            default:
                updateConnectionStatusElements('error', 'Unknown State');
        }
    } else {
        // No WebSocket connection exists, show appropriate status
        updateConnectionStatusElements('disconnected', 'Not Connected');
    }

    console.log('Connection status initialized after HTML load');
}

/**
 * Helper function to update the connection status elements directly
 */
function updateConnectionStatusElements(status, message) {
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');

    if (!connectionDot || !connectionText) {
        return;
    }

    switch (status) {
        case 'connecting':
            connectionDot.style.backgroundColor = '#ff9800'; // Orange
            connectionText.textContent = message || 'Connecting...';
            break;
        case 'connected':
            connectionDot.style.backgroundColor = '#4caf50'; // Green
            connectionText.textContent = message || 'Connected';
            break;
        case 'disconnected':
            connectionDot.style.backgroundColor = '#f44336'; // Red
            connectionText.textContent = message || 'Disconnected';
            break;
        case 'error':
            connectionDot.style.backgroundColor = '#f44336'; // Red
            connectionText.textContent = message || 'Connection Error';
            break;
        case 'waiting':
            connectionDot.style.backgroundColor = '#ff9800'; // Orange
            connectionText.textContent = message || 'Waiting for Server...';
            break;
        default:
            connectionDot.style.backgroundColor = '#9e9e9e'; // Gray
            connectionText.textContent = message || 'Unknown';
    }
}

// Export the function to be called by the group aggregator
window.loadConnectionStatusIndicator = loadConnectionStatusIndicator; 