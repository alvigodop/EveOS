/**
 * connectivityStartup.js
 * Handles post-load connectivity initialization and state restoration.
 */

window.PageInitializationCore = window.PageInitializationCore || {};

window.PageInitializationCore.ConnectivityStartup = {
    init: function () {
        console.log('HTML components loaded. Starting WebSocket connection...');

        // Connection Logic with Polling
        const maxAttempts = 150;
        let attempts = 0;

        const attemptConnect = () => {
            const connectFn =
                (typeof window.connect === 'function' && window.connect) ||
                (window.SocketConnectionCore && typeof window.SocketConnectionCore.connect === 'function'
                    ? window.SocketConnectionCore.connect.bind(window.SocketConnectionCore)
                    : null);

            if (connectFn) {
                if (typeof window.displayMessage === 'function') {
                    window.displayMessage("System Message: Attempting to connect to server automatically...", true);
                }
                connectFn();
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    // console.log(`Waiting for window.connect... (${attempts}/${maxAttempts})`);
                    setTimeout(attemptConnect, 100);
                } else {
                    console.error("Failed to find window.connect after maximum attempts. Connection scripts might not have loaded.");
                    if (typeof window.displayMessage === 'function') {
                        window.displayMessage("System Error: Connection scripts failed to load.", true);
                    }
                }
            }
        };

        setTimeout(attemptConnect, 200);

        // Restore chat history
        console.log('HTML components loaded. Attempting to restore chat from localStorage...');
        let chatRestored = false;
        if (typeof window.restoreChatFromLocalStorage === 'function') {
            chatRestored = window.restoreChatFromLocalStorage();
        }
        if (chatRestored) {
            if (typeof window.displayMessage === 'function') {
                window.displayMessage("System Message: Chat history restored from browser storage", true);
            }
        }

        // Update past chats display
        if (typeof window.updatePastChatsDisplay === 'function') {
            window.updatePastChatsDisplay();
        }
    },

    preInitReset: function () {
        const coreReset =
            window.SocketConnectionCore && typeof window.SocketConnectionCore.resetConnection === 'function'
                ? window.SocketConnectionCore.resetConnection.bind(window.SocketConnectionCore)
                : null;

        if (coreReset) {
            coreReset();
        }
    },

    showInitialMessage: function () {
        if (typeof window.displayMessage === 'function') {
            window.displayMessage("System Message: Initializing automatic connection to server...", true);
        }
    }
};

console.log("connectivityStartup.js loaded.");
