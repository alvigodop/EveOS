/**
 * Handles sending the content of the 'chatLog' element (current conversation) as context to the model.
 */

// Ensure the CommunicationPanel and SendChatHistoryCommunicationPanel namespaces exist
window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.SendChatHistoryCommunicationPanel = window.CommunicationPanel.SendChatHistoryCommunicationPanel || {};

// Function to send the current chat history from the main chat log
function sendChatHistory(webSocket) {
    const chatLog = document.getElementById('chatLog');
    const sendHistoryButton = document.getElementById('sendHistoryButton');

    if (chatLog && chatLog.innerHTML.trim() !== '') {
        // Extract all chat messages from the chat log
        const chatMessages = chatLog.querySelectorAll('.chat-message');
        
        console.log(`Found ${chatMessages.length} chat messages in the chat log`);
        
        if (chatMessages.length > 0) {
            let historyText = '';
            let messageCount = 0;
            
            // Build the history text from all chat messages
            chatMessages.forEach((messageElement, index) => {
                const messageContent = messageElement.querySelector('.message-content');
                const timestamp = messageElement.querySelector('.message-timestamp');
                
                if (messageContent) {
                    let messageText = '';
                    
                    // Determine the message type and format accordingly
                    if (messageElement.classList.contains('user-message')) {
                        messageText = `YOU: ${messageContent.textContent}`;
                    } else if (messageElement.classList.contains('gemini-message')) {
                        messageText = `GEMINI: ${messageContent.textContent}`;
                    } else {
                        messageText = messageContent.textContent;
                    }
                    
                    // Add timestamp if available
                    if (timestamp) {
                        historyText += `[${timestamp.textContent}] ${messageText}\n`;
                    } else {
                        historyText += `${messageText}\n`;
                    }
                    
                    messageCount++;
                    console.log(`Message ${index + 1}: ${messageText.substring(0, 50)}...`);
                } else {
                    console.warn(`Message ${index + 1} has no content element`);
                }
            });
            
            console.log(`Extracted ${messageCount} messages from chat history`);
            console.log(`Full history text (first 200 chars): ${historyText.substring(0, 200)}...`);
            
            if (historyText.trim()) {
                // Format the history with a clear context prefix
                const contextMessage = `[SYSTEM CONTEXT - Chat History]:\n${historyText.trim()}`;
                
                // Use the proper realtime_input format that the server expects
                const payload = {
                    realtime_input: {
                        media_chunks: [{
                            mime_type: "text/plain",
                            data: contextMessage
                        }]
                    },
                    is_system_context: true, // Flag to indicate this is context, not a user message
                    is_system_message: false, // This is not a system message to be ignored
                    timestamp: new Date().toISOString()
                };
                
                if (webSocket && webSocket.readyState === WebSocket.OPEN) {
                    webSocket.send(JSON.stringify(payload));
                    if (typeof displayMessage === 'function') {
                        displayMessage(`Sent current chat history as context to AI (${messageCount} messages).`, true);
                    }
                    console.log('Sent current chat history as context to AI:', contextMessage);
                } else {
                    console.error('WebSocket not open. Cannot send chat history context.');
                    if (typeof displayMessage === 'function') {
                        displayMessage('Error: WebSocket not open. Cannot send chat history context.', true);
                    }
                }
            } else {
                if (typeof displayMessage === 'function') {
                    displayMessage('No text content in chat history to send.', true);
                }
                console.log('No text content in chat history to send.');
            }
        } else {
            if (typeof displayMessage === 'function') {
                displayMessage('No chat messages found in the current conversation.', true);
            }
            console.log('No chat messages found in the current conversation.');
        }
    } else {
        console.log('Chat log not found or is empty.');
        if (typeof displayMessage === 'function') {
            displayMessage('No current chat history found or it is empty.', true);
        }
    }
}

// Initialization function to set up the Send Chat History button handler
function initializeChatHistorySender() {
    console.log('initializeChatHistorySender called.');
    const sendHistoryButton = document.getElementById('sendHistoryButton');
    
    if (sendHistoryButton) {
        sendHistoryButton.addEventListener('click', function() {
            console.log('Send Chat History button clicked.');
            if (window.webSocket) {
                sendChatHistory(window.webSocket);
            } else {
                console.error('Global webSocket instance not found. Cannot send chat history.');
                if (typeof displayMessage === 'function') {
                    displayMessage('Error: WebSocket connection not available.', true);
                }
            }
        });
        console.log('Send Chat History button event listener added.');
    } else {
        console.error('Send Chat History button not found.');
    }
}

// Expose the functions in the namespace
window.CommunicationPanel.SendChatHistoryCommunicationPanel.sendChatHistory = sendChatHistory;
window.CommunicationPanel.SendChatHistoryCommunicationPanel.initializeChatHistorySender = initializeChatHistorySender; 