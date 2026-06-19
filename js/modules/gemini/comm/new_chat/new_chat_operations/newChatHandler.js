function confirmStartNewChat() {
    const message = 'Start a new chat? Current chat will be saved to past chats.';
    if (typeof window.showConfirmWithTitle === 'function') {
        return window.showConfirmWithTitle('Start New Chat', message, {
            confirmLabel: 'Start Chat',
            cancelLabel: 'Cancel',
            kind: 'gemini-new-chat-confirm'
        });
    }
    if (typeof window.showConfirm === 'function') {
        return window.showConfirm(message, {
            title: 'Start New Chat',
            confirmLabel: 'Start Chat',
            cancelLabel: 'Cancel',
            kind: 'gemini-new-chat-confirm'
        });
    }

    return new Promise((resolve) => {
        const existing = document.getElementById('gemini-new-chat-confirm');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'gemini-new-chat-confirm';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);';
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="gemini-new-chat-confirm-title" style="width:min(420px,calc(100vw - 32px));border:1px solid rgba(0,212,255,.35);border-radius:18px;background:linear-gradient(145deg,rgba(15,22,31,.98),rgba(4,8,13,.98));box-shadow:0 22px 60px rgba(0,0,0,.5),0 0 28px rgba(0,212,255,.13);padding:20px;color:#e8f7ff;font-family:inherit;">
                <h3 id="gemini-new-chat-confirm-title" style="margin:0 0 10px;color:#7fe9ff;font-size:1rem;letter-spacing:.08em;text-transform:uppercase;">Start New Chat</h3>
                <p style="margin:0 0 18px;color:rgba(232,247,255,.82);line-height:1.45;">${message}</p>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" data-action="cancel" style="border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(255,255,255,.06);color:#e8f7ff;padding:9px 14px;cursor:pointer;">Cancel</button>
                    <button type="button" data-action="confirm" style="border:1px solid rgba(0,212,255,.45);border-radius:12px;background:linear-gradient(135deg,#12c9f4,#0789b4);color:#00151d;font-weight:800;padding:9px 14px;cursor:pointer;">Start Chat</button>
                </div>
            </div>`;
        function finish(value) {
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown, true);
            resolve(value);
        }
        function onKeyDown(event) {
            if (event.key === 'Escape') finish(false);
            if (event.key === 'Enter') finish(true);
        }
        overlay.addEventListener('click', (event) => {
            const action = event.target?.dataset?.action;
            if (action === 'confirm') finish(true);
            if (action === 'cancel' || event.target === overlay) finish(false);
        });
        document.addEventListener('keydown', onKeyDown, true);
        document.body.appendChild(overlay);
        overlay.querySelector('[data-action="confirm"]')?.focus();
    });
}

async function startNewChat() {
    const confirmed = await confirmStartNewChat();
    if (!confirmed) return;
    try {
        const chatLog = document.getElementById('chatLog');
        const currentChat = chatLog ? chatLog.innerHTML : '';

        if (currentChat && currentChat.trim()) {
            const timestamp = new Date().toLocaleString();
            const voiceSelectElement = document.getElementById('voiceSelect');
            const voiceValue = voiceSelectElement ? voiceSelectElement.value : 'default';

            if (typeof window.pastChats !== 'undefined') {
                window.pastChats.push({ timestamp, voice: voiceValue, content: currentChat });
            } else {
                console.error("Global 'window.pastChats' array not found. Chat history not saved.");
            }

            if (typeof window.updatePastChatsDisplay === 'function') {
                window.updatePastChatsDisplay();
            } else {
                console.warn("Global 'updatePastChatsDisplay' function not found.");
            }
        }

        if (chatLog) chatLog.innerHTML = '';

        const prevLog = document.getElementById('previousConversationLog');
        if (prevLog) prevLog.style.display = 'none';

        localStorage.removeItem('geminiChatHistory');

        if (typeof window.resetConnection === 'function') {
            window.resetConnection();
        } else {
            console.error("Global 'resetConnection' function not found.");
        }

        if (typeof window.displayMessage === 'function') {
            window.displayMessage('System Message: Starting new chat...');
        } else {
            console.warn("Global 'displayMessage' function not found.");
        }

        setTimeout(() => {
            if (typeof window.connect === 'function') {
                window.connect();
            } else {
                console.error("Global 'connect' function not found.");
            }
        }, 1000);
    } catch (error) {
        console.error('Error in startNewChat:', error);
    }
}

window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.StartNewChatCommunicationPanel = window.CommunicationPanel.StartNewChatCommunicationPanel || {};

window.CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler = function () {
    const newChatButton = document.getElementById('newChatButton');
    if (newChatButton) {
        if (newChatButton.dataset.newChatBound === '1') return;
        newChatButton.dataset.newChatBound = '1';
        newChatButton.addEventListener('click', startNewChat);
        console.log('New Chat Button event listener attached by initializeNewChatHandler.');
    } else {
        console.error('New Chat Button (newChatButton) not found when attempting to attach listener in initializeNewChatHandler.');
    }
};

if (document.getElementById('newChatButton')) {
    window.CommunicationPanel.StartNewChatCommunicationPanel.initializeNewChatHandler();
}