/**
 * Loads the Gemini Live Link card and wires modular context send actions.
 */

window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};

function _normalizeGeminiLiveLinkMode(mode) {
    return String(mode || '').toLowerCase() === 'full' ? 'full' : 'summary';
}

function _getGeminiLiveLinkConfig() {
    if (window.eveState?.config) return window.eveState.config;
    if (typeof config !== 'undefined') return config;
    return window.config || null;
}

function _getGeminiLiveLinkMode() {
    const cfg = _getGeminiLiveLinkConfig();
    return _normalizeGeminiLiveLinkMode(cfg?.modularGeminiMode || 'summary');
}

function _isGeminiLiveLinkEnabled() {
    const cfg = _getGeminiLiveLinkConfig();
    if (cfg && typeof cfg.geminiLiveLinkEnabled === 'boolean') {
        return cfg.geminiLiveLinkEnabled;
    }
    return true;
}

function _setGeminiLiveLinkMode(mode) {
    const normalized = _normalizeGeminiLiveLinkMode(mode);
    const cfg = _getGeminiLiveLinkConfig();
    if (cfg) {
        cfg.modularGeminiMode = normalized;
        if (typeof saveConfig === 'function') {
            saveConfig();
        }
    }
    return normalized;
}

function _setGeminiLiveLinkEnabled(enabled) {
    const value = !!enabled;
    const cfg = _getGeminiLiveLinkConfig();
    if (cfg) {
        cfg.geminiLiveLinkEnabled = value;
        if (typeof saveConfig === 'function') {
            saveConfig();
        }
    }
    return value;
}

function _setGeminiLiveLinkStatus(message, isError) {
    const statusEl = document.getElementById('geminiLiveLinkStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', !!isError);
}

function _applyGeminiLiveLinkEnabledState(enabled) {
    const isEnabled = !!enabled;
    const toggle = document.getElementById('geminiLiveLinkToggle');
    const modeSelect = document.getElementById('geminiLiveLinkMode');
    const sendButton = document.getElementById('geminiLiveLinkSendButton');
    const controls = document.getElementById('geminiLiveLinkControls');
    const statusEl = document.getElementById('geminiLiveLinkStatus');

    if (toggle) toggle.checked = isEnabled;
    if (modeSelect) modeSelect.disabled = !isEnabled;
    if (sendButton) sendButton.disabled = !isEnabled;
    if (controls) {
        controls.style.display = isEnabled ? 'block' : 'none';
        controls.setAttribute('aria-hidden', isEnabled ? 'false' : 'true');
    }
    if (statusEl) {
        statusEl.classList.toggle('is-collapsed', !isEnabled);
    }

    if (!isEnabled) {
        _setGeminiLiveLinkStatus('Gemini Live Link paused.', false);
    } else {
        _setGeminiLiveLinkStatus('Ready. Send active data-pack context to Gemini.', false);
    }
}

async function sendGeminiLiveLinkContext() {
    if (!_isGeminiLiveLinkEnabled()) {
        _setGeminiLiveLinkStatus('Enable Gemini Live Link to send context.', true);
        return { ok: false, error: 'Gemini Live Link is disabled.' };
    }

    const modeSelect = document.getElementById('geminiLiveLinkMode');
    const mode = _setGeminiLiveLinkMode(modeSelect?.value || _getGeminiLiveLinkMode());

    if (!window.EveDataStore?.ModularSync?.sendContextToGemini) {
        _setGeminiLiveLinkStatus('Modular sync module is unavailable.', true);
        return { ok: false, error: 'Modular sync module is unavailable.' };
    }

    _setGeminiLiveLinkStatus(`Sending ${mode} context...`, false);
    const result = await window.EveDataStore.ModularSync.sendContextToGemini(mode, 30);
    if (!result?.ok) {
        _setGeminiLiveLinkStatus(result?.error || 'Could not send context.', true);
        return result;
    }

    if (result.sent) {
        _setGeminiLiveLinkStatus(`Sent ${mode} context to Gemini chat.`, false);
        return result;
    }
    if (result.copied) {
        _setGeminiLiveLinkStatus('Context copied to clipboard.', false);
        return result;
    }

    _setGeminiLiveLinkStatus('Context prepared.', false);
    return result;
}

async function initializeGeminiLiveLinkCard() {
    const root = document.getElementById('gemini-live-link-card');
    if (!root || root.dataset.bound === '1') {
        return;
    }
    root.dataset.bound = '1';

    const modeSelect = document.getElementById('geminiLiveLinkMode');
    if (modeSelect) {
        modeSelect.value = _getGeminiLiveLinkMode();
        modeSelect.addEventListener('change', () => {
            _setGeminiLiveLinkMode(modeSelect.value);
            _setGeminiLiveLinkStatus(`Mode set to ${_normalizeGeminiLiveLinkMode(modeSelect.value)}.`, false);
        });
    }

    const toggle = document.getElementById('geminiLiveLinkToggle');
    if (toggle) {
        toggle.checked = _isGeminiLiveLinkEnabled();
        toggle.addEventListener('change', () => {
            const enabled = _setGeminiLiveLinkEnabled(toggle.checked);
            _applyGeminiLiveLinkEnabledState(enabled);
        });
    }

    const sendButton = document.getElementById('geminiLiveLinkSendButton');
    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            sendButton.disabled = true;
            try {
                await sendGeminiLiveLinkContext();
            } finally {
                sendButton.disabled = !_isGeminiLiveLinkEnabled();
            }
        });
    }

    _applyGeminiLiveLinkEnabledState(_isGeminiLiveLinkEnabled());
}

async function loadGeminiLiveLinkCard() {
    const placeholder = document.getElementById('gemini-live-link-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Gemini Live Link card not found.');
        return Promise.reject(new Error('Gemini Live Link placeholder not found'));
    }

    try {
        const htmlContent = `
<div id="gemini-live-link-card" class="agentic-function-card gemini-live-link-card">
    <div class="gemini-live-link-head">
        <div>
            <div class="gemini-live-link-kicker">Context Relay</div>
            <span class="gemini-live-link-title">Gemini Live Link</span>
        </div>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="geminiLiveLinkToggle">
            <input type="checkbox" id="geminiLiveLinkToggle" class="mdl-switch__input" checked>
            <span class="mdl-switch__label"></span>
        </label>
    </div>
    <div id="geminiLiveLinkStatus" class="gemini-live-link-status"></div>
    <div id="geminiLiveLinkControls" class="gemini-live-link-controls" style="display:block;">
        <div class="gemini-live-link-row">
            <div class="gemini-live-link-select-wrap">
                <label for="geminiLiveLinkMode" class="gemini-live-link-label">Context Mode</label>
                <select id="geminiLiveLinkMode" class="gemini-live-link-select">
                    <option value="summary">Summary</option>
                    <option value="full">Full JSON</option>
                </select>
            </div>
            <button id="geminiLiveLinkSendButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored gemini-live-link-send">Send</button>
        </div>
        <div class="gemini-live-link-help">
            Sends active data-pack context into the Gemini chat session.
        </div>
    </div>
</div>
`;
        placeholder.innerHTML = htmlContent;

        if (typeof componentHandler !== 'undefined' && componentHandler.upgradeElements) {
            componentHandler.upgradeElements(placeholder);
        }

        await initializeGeminiLiveLinkCard();
        return Promise.resolve();
    } catch (error) {
        console.error('Failed to load Gemini Live Link card:', error);
        return Promise.reject(error);
    }
}

window.GeminiLiveLinkAgentic.sendContextToGemini = sendGeminiLiveLinkContext;
window.GeminiLiveLinkAgentic.initializeGeminiLiveLinkCard = initializeGeminiLiveLinkCard;
window.loadGeminiLiveLinkCard = loadGeminiLiveLinkCard;
