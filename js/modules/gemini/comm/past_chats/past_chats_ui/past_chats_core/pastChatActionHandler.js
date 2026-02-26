/**
 * pastChatActionHandler.js
 * Handles actions related to past chats: Loading, Deleting, and Clearing.
 */

window.PastChatsUI = window.PastChatsUI || {};

window.PastChatsUI.Actions = {
    confirmClearAll: function () {
        if (confirm("Are you sure you want to clear all past chats? This cannot be undone.")) {
            // Update global state if it exists, otherwise assume 'pastChats' is global
            if (typeof pastChats !== 'undefined') {
                // Modifying global array directly as per legacy pattern
                pastChats.length = 0; // Clear array in place
            } else {
                console.error("Global 'pastChats' array not found.");
                return;
            }

            if (window.PastChatsUI.Renderer) {
                window.PastChatsUI.Renderer.updateDisplay(pastChats);
            }

            if (window.MessagingLog && window.MessagingLog.displayMessage) {
                window.MessagingLog.displayMessage("System Message: All past chats cleared");
            }

            // Send command to clear server-side history
            if (typeof webSocket !== 'undefined' && webSocket && webSocket.readyState === WebSocket.OPEN) {
                webSocket.send(JSON.stringify({ command: "clear_history" }));
            }
        }
    },

    deleteChat: function (index) {
        if (confirm("Are you sure you want to delete this chat history?")) {
            if (typeof pastChats !== 'undefined') {
                pastChats.splice(index, 1);
            }

            if (window.PastChatsUI.Renderer) {
                window.PastChatsUI.Renderer.updateDisplay(pastChats);
            }

            if (window.MessagingLog && window.MessagingLog.displayMessage) {
                window.MessagingLog.displayMessage("System Message: Chat history entry deleted");
            }
        }
    },

    loadChat: function (index) {
        if (typeof pastChats === 'undefined' || !pastChats[index]) {
            console.error("Chat not found at index:", index);
            return;
        }

        if (confirm("Do you want to load this past conversation for reference? It will appear in a separate section.")) {
            const chatContent = pastChats[index].content;
            const messages = Array.from(new DOMParser().parseFromString(chatContent, 'text/html').body.children);

            // Display the previous conversation in the separate section
            const previousConversationContent = document.getElementById('previousConversationContent');
            if (previousConversationContent) {
                this.renderLoadedChat(previousConversationContent, messages);
            } else {
                console.error("previousConversationContent element not found");
            }
        }
    },

    renderLoadedChat: function (container, messages) {
        container.innerHTML = '';

        // Add header first
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.marginBottom = '15px';
        headerDiv.style.paddingTop = '10px';
        headerDiv.style.position = 'sticky';
        headerDiv.style.top = '0';
        headerDiv.style.backgroundColor = 'white';
        headerDiv.style.zIndex = '1';

        const headerTitle = document.createElement('span');
        headerTitle.textContent = 'Loaded Past Conversation:';
        headerTitle.style.color = '#673ab7';
        headerTitle.style.fontWeight = 'bold';

        headerDiv.appendChild(headerTitle);
        container.appendChild(headerDiv);

        // Add messages
        messages.forEach(message => {
            const newMessage = document.createElement('div');
            newMessage.className = 'chat-message';
            if (message.classList.contains('user-message')) {
                newMessage.classList.add('previous-user-message');
                newMessage.textContent = '[User]: ' + message.textContent;
            } else {
                newMessage.classList.add('previous-gemini-message');
                newMessage.textContent = '[Gemini]: ' + message.textContent;
            }
            container.appendChild(newMessage);
        });

        this.renderControls(container);

        // Show the previous conversation section
        const prevLog = document.getElementById('previousConversationLog');
        if (prevLog) prevLog.style.display = 'block';

        if (window.MessagingLog && window.MessagingLog.displayMessage) {
            window.MessagingLog.displayMessage("System Message: Past chat loaded for reference");
        }
    },

    renderControls: function (container) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'previous-chat-controls';

        const clearButton = document.createElement('button');
        clearButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--accent';
        clearButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">clear_all</i>Clear';
        // Assuming global clearPreviousChat exists from 'previousConversationClearHandler.js' or similar
        clearButton.onclick = () => {
            if (typeof clearPreviousChat === 'function') {
                clearPreviousChat();
            } else {
                console.warn("clearPreviousChat function not found globally.");
            }
        };

        const editButton = document.createElement('button');
        editButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored';
        editButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">edit</i>Edit';
        // Assuming global editPreviousChat exists
        editButton.onclick = () => {
            if (typeof editPreviousChat === 'function') {
                editPreviousChat();
            } else {
                console.warn("editPreviousChat function not found globally.");
            }
        };

        const sendContextButton = document.createElement('button');
        sendContextButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored';
        sendContextButton.style.backgroundColor = '#4CAF50';
        sendContextButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">send</i>Send as Context';
        sendContextButton.onclick = () => {
            if (window.ConversationMemoryAgentic && window.ConversationMemoryAgentic.sendChatHistory) {
                window.ConversationMemoryAgentic.sendChatHistory();
            } else {
                console.warn("ConversationMemoryAgentic.sendChatHistory not found.");
            }
        };

        controlsDiv.appendChild(clearButton);
        controlsDiv.appendChild(editButton);
        controlsDiv.appendChild(sendContextButton);
        container.appendChild(controlsDiv);
    }
};

console.log("pastChatActionHandler.js loaded.");
