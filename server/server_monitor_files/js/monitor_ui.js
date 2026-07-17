(function () {
    'use strict';

    const MAX_MESSAGES = 100;

    function displayMessage(message, isError) {
        const messageLog = document.getElementById('messageLog');
        if (!messageLog) return;
        const atBottom = messageLog.scrollHeight - messageLog.scrollTop
            <= messageLog.clientHeight + 50;
        const node = document.createElement('p');
        node.textContent = message;
        node.className = isError ? 'error-message' : 'system-message';
        messageLog.appendChild(node);
        while (messageLog.children.length > MAX_MESSAGES) {
            messageLog.firstElementChild.remove();
        }
        if (atBottom) messageLog.scrollTop = messageLog.scrollHeight;
    }

    function renderService(id, running, label) {
        const card = document.getElementById(id);
        if (!card) return;
        card.dataset.running = running ? 'true' : 'false';
        const value = card.querySelector('strong');
        if (value) value.textContent = label || (running ? 'Online' : 'Offline');
    }

    function renderSnapshot(snapshot) {
        const state = window.MonitorState;
        renderService('serviceControl', snapshot.control, snapshot.control ? 'Available' : 'Unavailable');
        renderService('serviceGemini', snapshot.gemini, snapshot.gemini ? 'Online' : 'Offline');
        renderService('serviceWeb', snapshot.web, snapshot.webLabel);
        const status = document.getElementById('serverStatus');
        if (status) {
            status.textContent = snapshot.gemini ? 'Gemini Online' : 'Gemini Offline';
            status.className = snapshot.gemini ? 'status-running' : 'status-stopped';
        }
        const toggle = document.getElementById('toggleGeminiBtn');
        if (toggle) {
            toggle.innerHTML = '<i class="material-icons">'
                + (snapshot.gemini ? 'stop' : 'play_arrow')
                + '</i> ' + (snapshot.gemini ? 'Stop Gemini' : 'Start Gemini');
        }
        const webAddress = document.getElementById('serviceWebAddress');
        if (webAddress) webAddress.textContent = state.EVEOS_URL;
        const detail = document.getElementById('status');
        if (detail) {
            detail.textContent = [
                'Control helper: ' + (snapshot.control ? 'available' : 'unavailable'),
                'Gemini Live: ' + (snapshot.gemini ? 'online' : 'offline'),
                'EveOS: ' + snapshot.webLabel
            ].join(' | ');
        }
    }

    function setBusy(button, busy) {
        if (!button) return;
        button.disabled = !!busy;
        button.classList.toggle('loading', !!busy);
    }

    function loadFrame() {
        const frame = document.getElementById('serverFrame');
        if (!frame) return Promise.reject(new Error('Frame element not found.'));
        return new Promise(function (resolve, reject) {
            frame.onload = function () { resolve(); };
            frame.onerror = function () { reject(new Error('Gemini interface failed to load.')); };
            const separator = window.MonitorState.INTERFACE_URL.includes('?') ? '&' : '?';
            frame.src = window.MonitorState.INTERFACE_URL + separator + 't=' + Date.now();
        });
    }

    async function refreshFrame() {
        try {
            await loadFrame();
            displayMessage('Gemini interface refreshed.');
        } catch (error) {
            displayMessage(error.message, true);
        }
    }

    window.MonitorUI = {
        displayMessage,
        renderSnapshot,
        setBusy,
        loadFrame,
        refreshFrame,
        initUI: function () {
            const frame = document.getElementById('serverFrame');
            if (frame) frame.src = window.MonitorState.INTERFACE_URL;
        }
    };
    window.refreshFrame = refreshFrame;
})();