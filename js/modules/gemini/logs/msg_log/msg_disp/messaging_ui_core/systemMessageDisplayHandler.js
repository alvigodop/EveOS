/**
 * systemMessageDisplayHandler.js
 * Handles display, filtering, and buffering of system messages.
 */

window.MessagingLog = window.MessagingLog || {};

window.MessagingLog.SystemMessageDisplayHandler = {
    lastSystemMessage: '',
    lastStatusUpdate: 0,
    pendingSystemMessages: [],

    handleMessage: function (message) {
        // Double check against global toggle
        const systemMessagesToggle = document.getElementById('systemMessagesToggle');
        let showSystemMessagesFromToggle = true;

        if (systemMessagesToggle) {
            showSystemMessagesFromToggle = systemMessagesToggle.checked;
        } else {
            const storedState = localStorage.getItem('systemMessagesToggleState');
            if (storedState !== null) {
                showSystemMessagesFromToggle = storedState === 'true';
            }
        }

        console.log(`[SystemHandler] Processing: "${message.substring(0, 50)}..." Toggle: ${showSystemMessagesFromToggle}`);

        if (!showSystemMessagesFromToggle) {
            return;
        }

        // Check for specific error keywords to delegate/highlight
        if (this.isErrorMessage(message)) {
            if (typeof handleQuotaError === 'function') {
                handleQuotaError(message);
            }
        }

        // Prevent rapid duplicates (debounce)
        if (message === this.lastSystemMessage && Date.now() - this.lastStatusUpdate < 1000) {
            return;
        }

        this.lastSystemMessage = message;
        this.lastStatusUpdate = Date.now();

        this.createAndAppendSystemMessage(message);
    },

    isErrorMessage: function (message) {
        const lower = message.toLowerCase();
        return lower.includes("quota") ||
            lower.includes("deadline_exceeded") ||
            lower.includes("timed out") ||
            lower.includes("error") ||
            lower.includes("failed");
    },

    createAndAppendSystemMessage: function (message) {
        const newMessage = document.createElement("div");
        const timestamp = new Date().toLocaleTimeString();

        newMessage.className = "system-message";

        // Apply categories
        if (message.includes("Connection")) newMessage.classList.add("connection");
        else if (message.includes("voice")) newMessage.classList.add("voice");
        else if (message.startsWith("[SYSTEM:")) {
            newMessage.classList.add("context");
            newMessage.style.backgroundColor = "#e8f5e9";
            newMessage.style.borderLeftColor = "#4CAF50";
        } else if (this.isErrorMessage(message)) {
            newMessage.classList.add("error");
            newMessage.style.backgroundColor = "#ffebee";
            newMessage.style.borderLeftColor = "#ff4444";
        } else {
            newMessage.classList.add("status");
        }

        newMessage.textContent = `[${timestamp}] ${message}`;

        const systemLog = document.getElementById('systemLog');
        if (!systemLog) {
            this.pendingSystemMessages.push({ element: newMessage, message, timestamp });
            console.log(`[SystemHandler] Buffered message. Pending count: ${this.pendingSystemMessages.length}`);
            setTimeout(() => this.flushPendingMessages(), 500);
            return;
        }

        let messagesContainer = systemLog.querySelector('.system-messages-container');
        if (!messagesContainer) {
            messagesContainer = document.createElement('div');
            messagesContainer.className = 'system-messages-container';
            systemLog.appendChild(messagesContainer);
        }

        messagesContainer.appendChild(newMessage);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Prune old messages
        while (messagesContainer.children.length > 50) {
            messagesContainer.removeChild(messagesContainer.children[0]);
        }
    },

    flushPendingMessages: function () {
        const systemLog = document.getElementById('systemLog');
        if (!systemLog || this.pendingSystemMessages.length === 0) return;

        console.log(`[SystemHandler] Flushing ${this.pendingSystemMessages.length} pending messages.`);

        let messagesContainer = systemLog.querySelector('.system-messages-container');
        if (!messagesContainer) {
            messagesContainer = document.createElement('div');
            messagesContainer.className = 'system-messages-container';
            systemLog.appendChild(messagesContainer);
        }

        this.pendingSystemMessages.forEach(item => {
            messagesContainer.appendChild(item.element);
        });

        this.pendingSystemMessages = [];
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
};

console.log("systemMessageDisplayHandler.js loaded.");
