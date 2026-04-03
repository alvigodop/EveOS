window.CommunicationPanel = window.CommunicationPanel || {};
window.CommunicationPanel.SystemMessageToggleCommunicationPanel =
    window.CommunicationPanel.SystemMessageToggleCommunicationPanel || {};

window.CommunicationPanel.SystemMessageToggleCommunicationPanel.initializeSystemMessageToggleHandler = function () {
    const STORAGE_KEY = 'systemMessagesToggleState';
    const RETRY_DELAY_MS = 350;

    const systemMessagesToggle = document.getElementById('systemMessagesToggle');
    if (!systemMessagesToggle) {
        window.setTimeout(function () {
            window.CommunicationPanel.SystemMessageToggleCommunicationPanel.initializeSystemMessageToggleHandler();
        }, RETRY_DELAY_MS);
        return;
    }

    const getStoredState = function () {
        try {
            const stored = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
            if (stored === 'false') return false;
            if (stored === 'true') return true;
        } catch (error) {
            console.warn('System message toggle: failed reading state', error);
        }
        return true;
    };

    const persistState = function (value) {
        try {
            if (window.localStorage) {
                window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
            }
        } catch (error) {
            console.warn('System message toggle: failed storing state', error);
        }
    };

    const syncVisibility = function (showSystemMessages) {
        const systemLogPlaceholder = document.getElementById('system-log-display-placeholder');
        const systemLog = document.getElementById('systemLog');

        if (systemLogPlaceholder) {
            systemLogPlaceholder.style.display = showSystemMessages ? '' : 'none';
            systemLogPlaceholder.setAttribute('aria-hidden', showSystemMessages ? 'false' : 'true');
        }

        if (systemLog) {
            systemLog.style.display = '';
            systemLog.setAttribute('aria-hidden', showSystemMessages ? 'false' : 'true');
        }
    };

    const initialState = getStoredState();
    systemMessagesToggle.checked = initialState;
    syncVisibility(initialState);

    if (systemMessagesToggle.dataset.systemToggleBound === '1') {
        window.setTimeout(function () {
            syncVisibility(systemMessagesToggle.checked);
        }, RETRY_DELAY_MS);
        return;
    }

    systemMessagesToggle.dataset.systemToggleBound = '1';
    systemMessagesToggle.addEventListener('change', function () {
        const nextState = !!systemMessagesToggle.checked;
        persistState(nextState);
        syncVisibility(nextState);

        if (typeof window.displayMessage === 'function') {
            window.displayMessage(
                'System Message: System messages ' + (nextState ? 'enabled' : 'disabled'),
                true
            );
        }
    });

    window.setTimeout(function () {
        syncVisibility(systemMessagesToggle.checked);
    }, RETRY_DELAY_MS);
};
