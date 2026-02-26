/**
 * pastChatRenderer.js
 * Handles the DOM creation and rendering for the Past Chats list.
 */

window.PastChatsUI = window.PastChatsUI || {};

window.PastChatsUI.Renderer = {
    updateDisplay: function (pastChats) {
        const pastChatsLog = document.getElementById('pastChatsLog');
        if (!pastChatsLog) {
            console.warn('pastChatsLog element not found. Chat container may not be loaded yet.');
            return;
        }
        pastChatsLog.innerHTML = '';

        if (!pastChats || pastChats.length === 0) {
            this.renderEmptyState(pastChatsLog);
            return;
        }

        this.renderHeader(pastChatsLog);
        this.renderChatList(pastChatsLog, pastChats);
    },

    renderEmptyState: function (container) {
        const emptyMessage = document.createElement('div');
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '20px';
        emptyMessage.style.color = '#666';
        emptyMessage.textContent = 'No past chats available';
        container.appendChild(emptyMessage);
    },

    renderHeader: function (container) {
        const headerSection = document.createElement('div');
        headerSection.style.display = 'flex';
        headerSection.style.justifyContent = 'space-between';
        headerSection.style.alignItems = 'center';
        headerSection.style.padding = '10px';
        headerSection.style.marginBottom = '15px';
        headerSection.style.borderBottom = '2px solid #673ab7';

        const headerTitle = document.createElement('span');
        headerTitle.textContent = 'Past Chats';
        headerTitle.style.fontWeight = 'bold';
        headerTitle.style.fontSize = '18px';
        headerTitle.style.color = '#673ab7';

        const clearAllButton = document.createElement('button');
        clearAllButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--accent';
        clearAllButton.style.backgroundColor = '#f44336';
        clearAllButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">delete_sweep</i>Clear All Past Chats';

        // Delegate action to the handler
        clearAllButton.onclick = () => {
            if (window.PastChatsUI.Actions && window.PastChatsUI.Actions.confirmClearAll) {
                window.PastChatsUI.Actions.confirmClearAll();
            } else {
                console.error("PastChatsUI.Actions not loaded");
            }
        };

        headerSection.appendChild(headerTitle);
        headerSection.appendChild(clearAllButton);
        container.appendChild(headerSection);
    },

    renderChatList: function (container, pastChats) {
        pastChats.forEach((chat, index) => {
            const chatSection = document.createElement('div');
            chatSection.className = 'past-chat-section';

            const header = this.createChatHeader(chat, index);
            const content = document.createElement('div');
            // Sanitize or ensure content is safe if needed, but for now trusting stored HTML
            content.innerHTML = chat.content;

            chatSection.appendChild(header);
            chatSection.appendChild(content);
            container.appendChild(chatSection);
        });
    },

    createChatHeader: function (chat, index) {
        const header = document.createElement('div');
        header.style.marginBottom = '10px';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const info = document.createElement('span');
        info.textContent = `Voice: ${chat.voice || 'Unknown'} - ${chat.timestamp || 'No Date'}`;
        info.style.fontWeight = 'bold';
        info.style.color = '#673ab7';

        const buttonGroup = document.createElement('div');
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '10px';

        const loadButton = document.createElement('button');
        loadButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored';
        loadButton.style.backgroundColor = '#4CAF50';
        loadButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">restore</i>Load';
        loadButton.onclick = () => {
            if (window.PastChatsUI.Actions) window.PastChatsUI.Actions.loadChat(index);
        };

        const deleteButton = document.createElement('button');
        deleteButton.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--accent';
        deleteButton.style.backgroundColor = '#f44336';
        deleteButton.innerHTML = '<i class="material-icons" style="vertical-align: middle; margin-right: 4px;">delete</i>Delete';
        deleteButton.onclick = () => {
            if (window.PastChatsUI.Actions) window.PastChatsUI.Actions.deleteChat(index);
        };

        buttonGroup.appendChild(loadButton);
        buttonGroup.appendChild(deleteButton);

        header.appendChild(info);
        header.appendChild(buttonGroup);
        return header;
    }
};

console.log("pastChatRenderer.js loaded.");
