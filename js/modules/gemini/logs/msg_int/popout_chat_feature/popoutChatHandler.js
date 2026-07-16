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
    if (!document.getElementById('chatPopupModeStyle')) {
        const modeStyle = document.createElement('style');
        modeStyle.id = 'chatPopupModeStyle';
        modeStyle.textContent = [
            '#chatPopupModeHeader { flex: 0 0 auto; padding: 10px 48px 10px 16px; font-weight: 600;',
            'letter-spacing: 0.4px; color: var(--accent, #00d4ff); background: rgba(0, 212, 255, 0.06);',
            'border-bottom: 1px solid color-mix(in srgb, var(--accent, #00d4ff) 30%, transparent); }'
        ].join(' ');
        document.head.appendChild(modeStyle);
    }
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
    // 'live' = direct live-model chat (Search Monitor popout, unchanged behavior).
    // 'agent-space' = same routing as the main search bar's ask mode: Mode 2 text brain with
    // the [User is viewing: ...] surface prefix, so datapack-agentic chat works in the popout.
    let popupMode = 'live';
    const originalChatParent = chatContainer.parentNode;
    const originalInputParent = textInputSection.parentNode;
    let popupOverlay, popupContent;

    function getPopupTextInput() {
        return document.getElementById('textInput');
    }

    function applyMode(mode) {
        popupMode = mode === 'agent-space' ? 'agent-space' : 'live';
        if (!popupContent) return;
        popupContent.classList.toggle('agent-space-mode', popupMode === 'agent-space');
        let header = document.getElementById('chatPopupModeHeader');
        const input = getPopupTextInput();
        if (popupMode === 'agent-space') {
            if (!header) {
                header = document.createElement('div');
                header.id = 'chatPopupModeHeader';
                header.textContent = '✨ Agent Space Mode';
                popupContent.insertBefore(header, popupContent.firstChild);
            }
            if (input) input.placeholder = 'Ask about your datapack…';
        } else {
            if (header) header.remove();
            if (input) input.placeholder = 'Type your message...';
        }
    }

    // Capture-phase interception: in agent-space mode the popup's send controls route through
    // the ask-bar pipeline instead of the direct live-model send. Capture on the popup root
    // stops the stock send handlers before they ever see the event.
    function interceptAgentSpaceSend(event) {
        if (popupMode !== 'agent-space') return;
        const isSendClick = event.type === 'click'
            && event.target && typeof event.target.closest === 'function' && event.target.closest('#sendButton');
        const isEnterInInput = event.type === 'keydown' && event.key === 'Enter'
            && event.target && event.target.id === 'textInput';
        if (!isSendClick && !isEnterInInput) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const input = getPopupTextInput();
        const message = String((input && input.value) || '').trim();
        if (!message) return;
        const askBar = window.EveGeminiAskBar;
        if (!askBar || typeof askBar.sendQuestion !== 'function') {
            if (typeof window.showToast === 'function') {
                window.showToast('Agent Space routing is not ready yet.', 'warning');
            }
            return;
        }
        const result = askBar.sendQuestion(message);
        if (result && result.sent) {
            if (input) input.value = '';
        } else if (typeof window.showToast === 'function') {
            window.showToast('Gemini Live is not connected — open the Search Monitor Gemini workspace first.', 'warning');
        }
    }

    function openPopup(mode) {
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

        popupContent.addEventListener('click', interceptAgentSpaceSend, true);
        popupContent.addEventListener('keydown', interceptAgentSpaceSend, true);

        popupOpen = true;
        applyMode(mode);

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

        // Leaving agent-space mode with the popup: restore the stock input placeholder.
        applyMode('live');

        // Restore chat and input
        originalChatParent.appendChild(chatContainer);
        originalInputParent.appendChild(textInputSection);

        // Remove overlay and popup
        popupContent.remove();
        popupOverlay.remove();

        popupOpen = false;
    }

    popoutButton.addEventListener('click', (event) => {
        if (event) event.stopPropagation();
        // One-shot mode request (set by the Agent Space shortcut before triggering the click);
        // a direct click on the Search Monitor popout stays plain live mode.
        const requestedMode = window.__evePopoutOpenMode || 'live';
        window.__evePopoutOpenMode = null;
        if (!popupOpen) {
            openPopup(requestedMode);
        } else {
            closePopup();
        }
    });

    // Public API so entry points can open a specific mode without synthetic clicks.
    window.EvePopoutChat = {
        isOpen: function () { return popupOpen; },
        getMode: function () { return popupMode; },
        open: function (mode) {
            if (!popupOpen) openPopup(mode);
            else applyMode(mode);
        },
        close: closePopup,
        // Agent Space shortcut semantics: closed -> open in agent-space; open in live -> switch
        // mode in place; already in agent-space -> toggle closed.
        toggleAgentSpace: function () {
            if (!popupOpen) { openPopup('agent-space'); return 'opened'; }
            if (popupMode !== 'agent-space') { applyMode('agent-space'); return 'switched'; }
            closePopup();
            return 'closed';
        }
    };

    // Mark as initialized
    popoutButton.dataset.popoutInitialized = 'true';
    console.log('Popout chat feature initialization complete.');
}

// Expose the initialization function via the namespace
window.LogInterfaceDisplay.MessagingInterface.PopoutChatFeature.initializePopoutChatFeature = initializePopoutChatFeature; 