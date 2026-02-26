// js/modules/gemini/conversation_history_operations/fullConversationHistoryClearer.js

function clearConversationHistory() {
    if (confirm("Are you sure you want to clear the conversation history?")) {
        // Reset history state but keep the log visible
        historyLoaded = false;
        historyMessages = new Set();
        historyMessageOrder = [];
        
        // Clear content but add a message
        const previousConversationContent = document.getElementById('previousConversationContent');
        previousConversationContent.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <p>History has been cleared</p>
            </div>`;
        
        // Send clear history command to server
        if (webSocket && webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(JSON.stringify({ command: "clear_history" }));
        }
        
        displayMessage("System Message: Conversation history cleared");
    }
} 