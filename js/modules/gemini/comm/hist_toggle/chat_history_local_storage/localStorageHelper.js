// js/modules/gemini/chat_history_local_storage/localStorageHelper.js - Functions for saving and restoring chat history from localStorage

console.log("js/modules/gemini/chat_history_local_storage/localStorageHelper.js started loading");

function saveChatToLocalStorage() {
    // Save the current chat log to localStorage
    const chatLog = document.getElementById('chatLog');
    if (chatLog) {
        const container = chatLog.querySelector('.chat-messages-container') || chatLog;
        localStorage.setItem('geminiChatHistory', container.innerHTML);
        console.log('Chat history saved to localStorage');
    } else {
        console.error('chatLog element not found when trying to save to localStorage');
    }
}

function restoreChatFromLocalStorage() {
    // Restore chat log from localStorage if available
    const savedChat = localStorage.getItem('geminiChatHistory');
    const chatLog = document.getElementById('chatLog');

    if (savedChat && chatLog) {
        const container = chatLog.querySelector('.chat-messages-container') || chatLog;
        container.innerHTML = savedChat;
        container.scrollTop = container.scrollHeight;
        console.log('Chat history restored from localStorage');
        return true;
    }

    if (!chatLog) {
        console.error('chatLog element not found when trying to restore from localStorage');
        // Try to wait for the chatLog element to be available
        waitForChatLogAndRestore(savedChat);
    }

    return false;
}

function waitForChatLogAndRestore(savedChat) {
    if (!savedChat) return;

    let attempts = 0;
    const maxAttempts = 10;
    const checkInterval = 500; // 500ms between checks

    const checkForChatLog = () => {
        attempts++;
        const chatLog = document.getElementById('chatLog');

        if (chatLog && savedChat) {
            const container = chatLog.querySelector('.chat-messages-container') || chatLog;
            container.innerHTML = savedChat;
            container.scrollTop = container.scrollHeight;
            console.log('Chat history restored from localStorage (after waiting)');
            return true;
        }

        if (attempts < maxAttempts) {
            console.log(`Waiting for chatLog element... (attempt ${attempts}/${maxAttempts})`);
            setTimeout(checkForChatLog, checkInterval);
        } else {
            console.error(`chatLog element not found after ${maxAttempts} attempts. Chat history restoration skipped.`);
        }
    };

    setTimeout(checkForChatLog, checkInterval);
}

// Export functions to global scope
window.saveChatToLocalStorage = saveChatToLocalStorage;
window.restoreChatFromLocalStorage = restoreChatFromLocalStorage;

console.log("js/modules/gemini/chat_history_local_storage/localStorageHelper.js finished loading"); 