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

function _formatGeminiLiveLinkNumber(value) {
    const number = Number(value) || 0;
    return number.toLocaleString();
}

function _escapeGeminiLiveLinkHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function _getGeminiLiveLinkActiveWorkspaceLabel() {
    const cfg = _getGeminiLiveLinkConfig() || {};
    const activeId = String(cfg.activeWorkspace || 'main');
    const workspace = Array.isArray(cfg.workspaces)
        ? cfg.workspaces.find((item) => String(item?.id || '') === activeId)
        : null;
    return workspace?.name || activeId;
}

function _getGeminiLiveLinkRouteLabel(route) {
    if (route === 'websocket') return 'Live WebSocket';
    if (route === 'queued-websocket') return 'Queued for WebSocket';
    if (route === 'clipboard') return 'Clipboard fallback';
    if (window.webSocket && window.webSocket.readyState === WebSocket.OPEN) return 'Live WebSocket';
    if (typeof window.waitForConnection === 'function') return 'Auto-queue if offline';
    return 'Clipboard fallback';
}

function _buildPendingGeminiLiveLinkManifest(mode) {
    return {
        mode: _normalizeGeminiLiveLinkMode(mode || _getGeminiLiveLinkMode()),
        scope: 'current modular datapack',
        activeWorkspaceName: _getGeminiLiveLinkActiveWorkspaceLabel(),
        sampleLimit: 30,
        messageChars: 0,
        counts: null,
        route: ''
    };
}

function _renderGeminiLiveLinkManifest(manifest, stateLabel) {
    const manifestEl = document.getElementById('geminiLiveLinkManifest');
    if (!manifestEl) return;
    const data = manifest || _buildPendingGeminiLiveLinkManifest();
    const counts = data.counts || {};
    const countSummary = data.counts
        ? `${_formatGeminiLiveLinkNumber(counts.bookmarks)} bookmarks / ${_formatGeminiLiveLinkNumber(counts.cards)} cards`
        : 'Counts appear after prepare';
    const sizeSummary = data.messageChars
        ? `${_formatGeminiLiveLinkNumber(data.messageChars)} chars`
        : 'Not generated yet';

    manifestEl.innerHTML = `
        <div class="gemini-live-link-manifest-head">
            <span>${_escapeGeminiLiveLinkHtml(stateLabel || 'Inspectable relay manifest')}</span>
            <strong>${_escapeGeminiLiveLinkHtml(String(data.mode || 'summary').toUpperCase())}</strong>
        </div>
        <div class="gemini-live-link-manifest-grid">
            <span>Scope</span><b>${_escapeGeminiLiveLinkHtml(data.scope || 'current modular datapack')}</b>
            <span>Active tab</span><b>${_escapeGeminiLiveLinkHtml(data.activeWorkspaceName || data.activeWorkspaceId || 'main')}</b>
            <span>Contents</span><b>${_escapeGeminiLiveLinkHtml(countSummary)}</b>
            <span>Size / route</span><b>${_escapeGeminiLiveLinkHtml(`${sizeSummary} · ${_getGeminiLiveLinkRouteLabel(data.route)}`)}</b>
        </div>
    `;
}

function _summarizeGeminiLiveLinkResult(result) {
    const manifest = result?.manifest || {};
    const counts = manifest.counts || {};
    const bits = [
        `${manifest.mode || result?.mode || 'summary'} mode`,
        `${_formatGeminiLiveLinkNumber(manifest.messageChars)} chars`
    ];
    if (counts.bookmarks || counts.cards) {
        bits.push(`${_formatGeminiLiveLinkNumber(counts.bookmarks)} bookmarks`);
        bits.push(`${_formatGeminiLiveLinkNumber(counts.cards)} cards`);
    }
    bits.push(_getGeminiLiveLinkRouteLabel(result?.route));
    return bits.join(' · ');
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
        _setGeminiLiveLinkStatus('EveOS Context Relay paused.', false);
    } else {
        _setGeminiLiveLinkStatus('Ready. Review the manifest, then send EveOS context to Gemini.', false);
    }
    _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(), isEnabled ? 'Ready to prepare' : 'Relay paused');
}

async function sendGeminiLiveLinkContext() {
    if (!_isGeminiLiveLinkEnabled()) {
        _setGeminiLiveLinkStatus('Enable EveOS Context Relay to send context.', true);
        return { ok: false, error: 'EveOS Context Relay is disabled.' };
    }

    const modeSelect = document.getElementById('geminiLiveLinkMode');
    const mode = _setGeminiLiveLinkMode(modeSelect?.value || _getGeminiLiveLinkMode());

    if (!window.EveDataStore?.ModularSync?.sendContextToGemini) {
        _setGeminiLiveLinkStatus('Modular sync module is unavailable.', true);
        return { ok: false, error: 'Modular sync module is unavailable.' };
    }

    _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(mode), 'Preparing payload');
    _setGeminiLiveLinkStatus(`Preparing ${mode} EveOS context snapshot...`, false);
    const result = await window.EveDataStore.ModularSync.sendContextToGemini(mode, 30);
    if (!result?.ok) {
        _setGeminiLiveLinkStatus(result?.error || 'Could not send context.', true);
        return result;
    }

    _renderGeminiLiveLinkManifest(result.manifest, result.queued ? 'Queued payload' : (result.copied ? 'Copied payload' : 'Sent payload'));
    if (result.sent) {
        _setGeminiLiveLinkStatus(`${result.queued ? 'Queued' : 'Sent'} EveOS context: ${_summarizeGeminiLiveLinkResult(result)}.`, false);
        return result;
    }
    if (result.copied) {
        _setGeminiLiveLinkStatus(`Gemini offline; copied context: ${_summarizeGeminiLiveLinkResult(result)}.`, false);
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
            _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(modeSelect.value), 'Mode changed');
            _setGeminiLiveLinkStatus(`Payload mode set to ${_normalizeGeminiLiveLinkMode(modeSelect.value)}.`, false);
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
            <div class="gemini-live-link-kicker">EveOS Relay</div>
            <span class="gemini-live-link-title">EveOS Context Relay</span>
            <div class="gemini-live-link-subtitle">Prepare an inspectable EveOS snapshot, then send it into the Gemini session.</div>
        </div>
        <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-live-link-toggle" for="geminiLiveLinkToggle">
            <input type="checkbox" id="geminiLiveLinkToggle" class="mdl-switch__input" checked>
            <span class="mdl-switch__label"></span>
        </label>
    </div>
    <div id="geminiLiveLinkStatus" class="gemini-live-link-status"></div>
    <div id="geminiLiveLinkManifest" class="gemini-live-link-manifest"></div>
    <div id="geminiLiveLinkControls" class="gemini-live-link-controls" style="display:block;">
        <div class="gemini-live-link-row">
            <div class="gemini-live-link-select-wrap">
                <label for="geminiLiveLinkMode" class="gemini-live-link-label">Payload Mode</label>
                <select id="geminiLiveLinkMode" class="gemini-live-link-select">
                    <option value="summary">Summary</option>
                    <option value="full">Full JSON</option>
                </select>
            </div>
            <button id="geminiLiveLinkSendButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored gemini-live-link-send">Send EveOS Context</button>
        </div>
        <div class="gemini-live-link-help">
            Summary sends counts and representative samples. Full JSON sends the complete modular snapshot. The manifest above shows the route and size before the relay leaves EveOS.
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
