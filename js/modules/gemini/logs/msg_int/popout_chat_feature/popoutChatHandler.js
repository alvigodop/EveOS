// Ensure the namespace exists
window.LogInterfaceDisplay = window.LogInterfaceDisplay || {};
window.LogInterfaceDisplay.MessagingInterface = window.LogInterfaceDisplay.MessagingInterface || {};
window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature = window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature || {};

/**
 * Initializes the popout chat feature.
 * Finds the necessary elements and attaches the event listener to the popout button.
 */
function initializePopoutChatFeature() {
    console.log('Initializing popout chat feature.');
    const popoutButton = document.getElementById('popoutButton');
    const chatContainer = document.querySelector('.chat-container');
    const textInputSection = document.querySelector('.text-input-section');

    if (!popoutButton || !chatContainer || !textInputSection) {
        console.error('Required elements for popout feature not found. Popout feature will not be fully initialized.');
        return;
    }

    // Prevent multiple initializations
    if (popoutButton.dataset.popoutInitialized === 'true') {
        console.log('Popout chat feature already initialized.');
        return;
    }

    let popupOpen = false;
    const originalChatParent = chatContainer.parentNode;
    const originalInputParent = textInputSection.parentNode;
    let popupOverlay, popupContent;

    function openPopup() {
        if (popupOpen) return;

        // Ensure original parents are valid before using them used for restoration
        if (!originalChatParent || !originalInputParent) {
            console.error('Original parent elements for chat/input not found. Cannot create popout.');
            return;
        }

        // Create overlay
        popupOverlay = document.createElement('div');
        popupOverlay.id = 'chatPopupOverlay';
        popupOverlay.addEventListener('click', closePopup); // Click overlay to close

        // Create popup content container
        popupContent = document.createElement('div');
        popupContent.id = 'chatPopup';

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.id = 'popoutCloseButton';
        closeBtn.className = 'mdl-button mdl-js-button mdl-button--icon';
        closeBtn.innerHTML = '<i class="material-icons">close</i>';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            closePopup();
        });
        popupContent.appendChild(closeBtn);

        // Move chat and input into popup
        // We use a wrapper for the chat part to ensure it scrolls
        const chatWrapper = document.createElement('div');
        chatWrapper.className = 'popup-chat-wrapper';
        chatWrapper.style.flex = '1';
        chatWrapper.style.minHeight = '0'; // Critical for nested flex scrolling
        chatWrapper.style.overflow = 'hidden'; // Container doesn't scroll, child does
        chatWrapper.style.display = 'flex';
        chatWrapper.style.flexDirection = 'column';

        chatWrapper.appendChild(chatContainer);
        popupContent.appendChild(chatWrapper);

        popupContent.appendChild(textInputSection);

        // Append overlay and popup
        document.body.appendChild(popupOverlay);
        document.body.appendChild(popupContent);

        popupOpen = true;

        // Force scroll to bottom of the chatLog after it's in the popup
        requestAnimationFrame(() => {
            const chatLog = document.getElementById('chatLog');
            if (chatLog) {
                chatLog.scrollTop = chatLog.scrollHeight;
                /* Also ensure the container isn't scrolled, just in case */
                if (chatContainer) chatContainer.scrollTop = 0;
            }
        });
    }

    function closePopup() {
        if (!popupOpen) return;

        // Ensure elements needed for closing are present
        if (!originalChatParent || !originalInputParent || !chatContainer || !textInputSection || !popupContent || !popupOverlay) {
            console.error('Cannot close popout, some elements are missing.');
            // Try to recover state if possible or just remove popup
            if (popupContent) popupContent.remove();
            if (popupOverlay) popupOverlay.remove();
            popupOpen = false;
            return;
        }

        // Restore chat and input
        originalChatParent.appendChild(chatContainer);
        originalInputParent.appendChild(textInputSection);

        // Remove overlay and popup
        popupContent.remove();
        popupOverlay.remove();

        popupOpen = false;
    }

    popoutButton.addEventListener('click', () => {
        if (!popupOpen) {
            openPopup();
        } else {
            closePopup();
        }
    });

    // Mark as initialized
    popoutButton.dataset.popoutInitialized = 'true';
    console.log('Popout chat feature initialization complete.');
}

// Expose the initialization function via the namespace
window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature.initializePopoutChatFeature = initializePopoutChatFeature; 