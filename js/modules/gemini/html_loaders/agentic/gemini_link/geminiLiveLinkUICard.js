/** Rendering and live-state updates for the Gemini Live Link agentic card. */
window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};

(function () {
    const agentic = window.GeminiLiveLinkAgentic;
    if (agentic.uiCard) return;
    const state = agentic.uiState;
    if (!state) throw new Error('[GeminiLiveLink] UI state helpers missing.');    const {
        GEMINI_LIVE_LINK_SCOPE_DESCRIPTIONS,
        _getGeminiLiveLinkScopeMode,
        _getGeminiLiveLinkConfig,
        _getGeminiLiveLinkApi,
        _getGeminiLiveLinkSelectedScope,
        _getGeminiLiveLinkRouteLabel,
        _isGeminiLiveLinkEnabled,
        _isGeminiLiveLinkDataStreamEnabled,
        _setGeminiLiveLinkScopeMode,
        _setGeminiLiveLinkSelectedCard,
        _buildPendingGeminiLiveLinkManifest,
        _formatGeminiLiveLinkNumber,
        _escapeGeminiLiveLinkHtml
    } = state;
function _refreshGeminiLiveLinkScopeOptions() {
    const select = document.getElementById('geminiLiveLinkScopeMode');
    if (!select) return;
    const current = _getGeminiLiveLinkScopeMode();
    const allowWhole = !!window.GeminiLiveLinkScopeRuntime?.isWholeDatapackAllowed?.();
    const options = [
        ['auto', 'Auto: Current Surface'],
        ['tab-current', 'Current Tab Only'],
        ['tab-branch', 'Current Tab + Sub Tabs'],
        ['group', 'Current Group'],
        ['card', 'Specific Card']
    ];
    if (allowWhole) options.push(['all', 'Whole Datapack']);
    select.innerHTML = options.map(([value, label]) => `<option value="${value}">${_escapeGeminiLiveLinkHtml(label)}</option>`).join('');
    const nextValue = options.some(([value]) => value === current) ? current : 'auto';
    select.value = nextValue;
    if (nextValue !== current) _setGeminiLiveLinkScopeMode(nextValue);
    _refreshGeminiLiveLinkScopeExplain(nextValue);
}

function _refreshGeminiLiveLinkScopeExplain(mode) {
    const explain = document.getElementById('geminiLiveLinkScopeExplain');
    if (!explain) return;
    const selectedMode = mode || document.getElementById('geminiLiveLinkScopeMode')?.value || _getGeminiLiveLinkScopeMode();
    explain.textContent = GEMINI_LIVE_LINK_SCOPE_DESCRIPTIONS[selectedMode] || GEMINI_LIVE_LINK_SCOPE_DESCRIPTIONS.auto;
}

function _refreshGeminiLiveLinkCardOptions() {
    const select = document.getElementById('geminiLiveLinkCardScope');
    const scopeMode = document.getElementById('geminiLiveLinkScopeMode')?.value || _getGeminiLiveLinkScopeMode();
    const cfg = _getGeminiLiveLinkConfig() || {};
    const cardWrap = document.getElementById('geminiLiveLinkCardScopeWrap');
    if (cardWrap) cardWrap.hidden = scopeMode !== 'card';
    if (!select) return;
    const api = _getGeminiLiveLinkApi();
    const optionScope = window.GeminiLiveLinkScopeRuntime?.getCardOptionScope?.() || _getGeminiLiveLinkSelectedScope();
    const options = api?.getGeminiContextCardOptions?.({ scope: optionScope }) || [];
    const currentValue = `${cfg.geminiContextSelectedCardWorkspaceId || ''}::${cfg.geminiContextSelectedCardCategory || ''}`;
    select.innerHTML = options.length
        ? options.map((item) => {
            const value = `${item.workspaceId}::${item.categoryName}`;
            return `<option value="${_escapeGeminiLiveLinkHtml(value)}">${_escapeGeminiLiveLinkHtml(item.categoryName)} (${_escapeGeminiLiveLinkHtml(item.workspaceId)}, ${item.count})</option>`;
        }).join('')
        : '<option value="">No cards in selected scope</option>';
    if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
        select.value = currentValue;
    } else if (select.value) {
        _setGeminiLiveLinkSelectedCard(select.value);
    }
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

    const activeHeaderHtml = data.activeGroupName
        ? `<span>Active group</span><b>${_escapeGeminiLiveLinkHtml(data.activeGroupName)}</b>`
        : `<span>Active tab</span><b>${_escapeGeminiLiveLinkHtml(data.activeWorkspaceName || data.activeWorkspaceId || 'main')}</b>`;

    manifestEl.innerHTML = `
        <div class="gemini-live-link-manifest-head">
            <span>${_escapeGeminiLiveLinkHtml(stateLabel || 'Inspectable relay manifest')}</span>
            <strong>${_escapeGeminiLiveLinkHtml(String(data.mode || 'summary').toUpperCase())}</strong>
        </div>
        <div class="gemini-live-link-manifest-grid">
            <span>Scope</span><b>${_escapeGeminiLiveLinkHtml(data.scope || 'current modular datapack')}</b>
            ${activeHeaderHtml}
            ${data.categoryName ? `<span>Card</span><b>${_escapeGeminiLiveLinkHtml(data.categoryName)}</b>` : ''}
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

let _geminiLiveLinkStreamBound = false;
let _geminiLiveLinkStreamTimer = 0;
let _geminiLiveLinkPendingDetail = null;

function _bindGeminiLiveLinkDataStream() {
    if (_geminiLiveLinkStreamBound) return;
    _geminiLiveLinkStreamBound = true;
    window.addEventListener('eve:state-mutated', function (event) {
        if (!_isGeminiLiveLinkEnabled() || !_isGeminiLiveLinkDataStreamEnabled()) return;
        _geminiLiveLinkPendingDetail = event.detail || {};
        if (_geminiLiveLinkStreamTimer) window.clearTimeout(_geminiLiveLinkStreamTimer);
        _geminiLiveLinkStreamTimer = window.setTimeout(function () {
            _geminiLiveLinkStreamTimer = 0;
            const api = _getGeminiLiveLinkApi();
            const result = api?.sendDataStreamToGemini?.(_geminiLiveLinkPendingDetail, {
                scope: _getGeminiLiveLinkSelectedScope()
            });
            if (result?.sent) _setGeminiLiveLinkStatus('Data Stream sent a silent scoped update to Gemini.', false);
        }, 900);
    });
}

function _applyGeminiLiveLinkSettingsState() {
    const button = document.getElementById('geminiLiveLinkSettingsButton');
    const isEnabled = _isGeminiLiveLinkEnabled();
    if (button) {
        button.disabled = !isEnabled;
        button.title = 'Configure Context Relay';
    }
}

function _applyGeminiLiveLinkEnabledState(enabled) {
    const isEnabled = !!enabled;
    const root = document.getElementById('gemini-live-link-card');
    const toggle = document.getElementById('geminiLiveLinkToggle');
    const settingsButton = document.getElementById('geminiLiveLinkSettingsButton');

    const modeSelect = document.getElementById('geminiLiveLinkMode');
    const scopeSelect = document.getElementById('geminiLiveLinkScopeMode');
    const cardSelect = document.getElementById('geminiLiveLinkCardScope');
    const streamToggle = document.getElementById('geminiLiveLinkDataStreamToggle');
    const sendButton = document.getElementById('geminiLiveLinkSendButton');
    const statusEl = document.getElementById('geminiLiveLinkStatus');

    if (root) root.classList.toggle('is-relay-paused', !isEnabled);
    if (toggle) toggle.checked = isEnabled;
    if (settingsButton) settingsButton.disabled = !isEnabled;
    if (modeSelect) modeSelect.disabled = !isEnabled;
    if (scopeSelect) scopeSelect.disabled = !isEnabled;
    if (cardSelect) cardSelect.disabled = !isEnabled;
    if (streamToggle) streamToggle.disabled = !isEnabled;
    if (sendButton) sendButton.disabled = !isEnabled;
    if (statusEl) statusEl.classList.toggle('is-collapsed', !isEnabled);

    if (!isEnabled) {
        _setGeminiLiveLinkStatus('EveOS Context Relay paused.', false);
    } else {
        _setGeminiLiveLinkStatus('Ready. Review the manifest, then send EveOS context to Gemini.', false);
    }
    _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(), isEnabled ? 'Ready to prepare' : 'Relay paused');
    _applyGeminiLiveLinkSettingsState();
}
    agentic.uiCard = Object.freeze({
        _refreshGeminiLiveLinkScopeOptions,
        _refreshGeminiLiveLinkScopeExplain,
        _refreshGeminiLiveLinkCardOptions,
        _renderGeminiLiveLinkManifest,
        _summarizeGeminiLiveLinkResult,
        _setGeminiLiveLinkStatus,
        _bindGeminiLiveLinkDataStream,
        _applyGeminiLiveLinkSettingsState,
        _applyGeminiLiveLinkEnabledState
    });
})();