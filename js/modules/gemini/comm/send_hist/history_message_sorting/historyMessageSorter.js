// js/modules/gemini/history_message_sorting/historyMessageSorter.js

// Add function to sort and display history messages
function sortAndDisplayHistoryMessages() {
    const previousConversationContent = document.getElementById('previousConversationContent');
    
    // Get all message elements
    const messageElements = previousConversationContent.querySelectorAll('.chat-message');
    
    // Convert to array for sorting
    const messagesArray = Array.from(messageElements);
    
    // Sort by timestamp if available
    messagesArray.sort((a, b) => {
        const aTimestamp = a.querySelector('.message-timestamp');
        const bTimestamp = b.querySelector('.message-timestamp');
        
        if (!aTimestamp || !bTimestamp) return 0;
        
        // parseTimestamp is expected to be globally available from timestampParser.js
        const aDate = parseTimestamp(aTimestamp.textContent);
        const bDate = parseTimestamp(bTimestamp.textContent);
        
        return aDate - bDate;
    });
    
    // Remove all messages
    messageElements.forEach(el => el.remove());
    
    // Add back in sorted order
    messagesArray.forEach(msg => {
        previousConversationContent.appendChild(msg);
    });
} 