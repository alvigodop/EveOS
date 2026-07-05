/**
 * Loads the Gemini Live Link card and wires modular context send actions.
 */

window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};

const GEMINI_LIVE_LINK_MODE_PROFILES = {
    brief: { label: 'Quick Scoped Brief', limit: 10, note: 'Lean card and bookmark names, counts, and a small useful sample.' },
    summary: { label: 'Rich Scoped Summary', limit: 30, note: 'Readable scoped sample with folders, bookmark identifiers, status, progress, ratings, URLs, and Nexus hints.' },
    deep: { label: 'Deep Scoped Snapshot', limit: 60, note: 'More complete tree sample for the selected scope without raw internal state dumps.' },
    full: { label: 'Complete Scoped Snapshot', limit: 90, note: 'Largest safe structured payload for the selected scope, chunked for Gemini Live.' }
};

const GEMINI_LIVE_LINK_SCOPE_DESCRIPTIONS = {
    auto: 'Auto follows the current EveOS surface. In normal tabs it uses the active tab branch; in card drill-ins it can scope to that card; in Unidex it can expose the global datapack.',
    'tab-current': 'Current Tab Only sends this tab name, path, visible cards, folders, bookmarks, notes, pins, and library links. Sub-tab paths may be named, but sub-tab contents are not included.',
    'tab-branch': 'Current Tab + Sub Tabs sends this tab and its visible sub-tab branch, preserving tab paths while keeping each card and folder tree separated.',
    card: 'Specific Card sends one selected card, its folders, root bookmarks, bookmark identifier/category pills, linked-library state, pins, URLs, notes, progress, and compact system-view hints.',
    all: 'Whole Datapack is only available from Unidex/global surfaces. Use it sparingly; it is chunked but still the largest scope.'
};

function _normalizeGeminiLiveLinkMode(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'json' || value === 'complete') return 'full';
    return GEMINI_LIVE_LINK_MODE_PROFILES[value] ? value : 'summary';
}

function _getGeminiLiveLinkModeProfile(mode) {
    const normalized = _normalizeGeminiLiveLinkMode(mode);
    return { id: normalized, ...GEMINI_LIVE_LINK_MODE_PROFILES[normalized] };
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

function _getGeminiLiveLinkApi() {
    return window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync || null;
}

function _isGeminiLiveLinkEnabled() {
    const cfg = _getGeminiLiveLinkConfig();
    if (cfg && typeof cfg.geminiLiveLinkEnabled === 'boolean') {
        return cfg.geminiLiveLinkEnabled;
    }
    return true;
}

function _getGeminiLiveLinkScopeMode() {
    return window.GeminiLiveLinkScopeRuntime?.getScopeMode?.() || 'auto';
}

function _isGeminiLiveLinkDataStreamEnabled() {
    return !!window.GeminiLiveLinkScopeRuntime?.isDataStreamEnabled?.();
}

function _isGeminiLiveLinkSettingsOpen() {
    const cfg = _getGeminiLiveLinkConfig();
    return !!cfg?.geminiLiveLinkSettingsOpen;
}

function _setGeminiLiveLinkSettingsOpen(open) {
    const cfg = _getGeminiLiveLinkConfig();
    const value = !!open;
    if (cfg) {
        cfg.geminiLiveLinkSettingsOpen = value;
        if (typeof saveConfig === 'function') saveConfig();
    }
    return value;
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

function _setGeminiLiveLinkScopeMode(mode) {
    return window.GeminiLiveLinkScopeRuntime?.setScopeMode?.(mode) || 'auto';
}

function _setGeminiLiveLinkSelectedCard(value) {
    window.GeminiLiveLinkScopeRuntime?.setSelectedCard?.(value);
}

function _setGeminiLiveLinkDataStreamEnabled(enabled) {
    return !!window.GeminiLiveLinkScopeRuntime?.setDataStreamEnabled?.(enabled);
}

function _getGeminiLiveLinkSelectedScope() {
    return window.GeminiLiveLinkScopeRuntime?.getSelectedScope?.()
        || { scope: 'workspace', workspaceId: String(_getGeminiLiveLinkConfig()?.activeWorkspace || 'main'), source: 'fallback' };
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

function _getGeminiLiveLinkActiveWorkspaceLabel(workspaceId) {
    const cfg = _getGeminiLiveLinkConfig() || {};
    const activeId = String(workspaceId || cfg.activeWorkspace || 'main');
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

function _buildPendingGeminiLiveLinkManifest(mode, selectedScope) {
    const scope = selectedScope || _getGeminiLiveLinkSelectedScope();
    const scopeMode = String(scope.scope || 'workspace').toLowerCase();
    const scopeLabel = scope.label || (scopeMode === 'all'
        ? 'Whole datapack'
        : (scopeMode === 'card' ? 'Specific card' : 'Selected tab scope'));
    const profile = _getGeminiLiveLinkModeProfile(mode || _getGeminiLiveLinkMode());
    return {
        mode: profile.id,
        scope: scopeLabel,
        scopeMode,
        source: scope.source || 'search-monitor',
        activeWorkspaceId: scope.workspaceId || String(_getGeminiLiveLinkConfig()?.activeWorkspace || 'main'),
        activeWorkspaceName: scope.workspaceId ? _getGeminiLiveLinkActiveWorkspaceLabel(scope.workspaceId) : 'All tabs',
        categoryName: scope.categoryName || '',
        sampleLimit: profile.limit,
        messageChars: 0,
        counts: null,
        route: ''
    };
}

function _formatGeminiLiveLinkModeLabel(mode) {
    return _getGeminiLiveLinkModeProfile(mode).label;
}

function _withGeminiLiveLinkTimeout(promise, timeoutMs, label) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => {
            reject(new Error(`${label || 'Operation'} timed out after ${Math.round(timeoutMs / 1000)}s.`));
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) window.clearTimeout(timer);
    });
}

function _refreshGeminiLiveLinkScopeOptions() {
    const select = document.getElementById('geminiLiveLinkScopeMode');
    if (!select) return;
    const current = _getGeminiLiveLinkScopeMode();
    const allowWhole = !!window.GeminiLiveLinkScopeRuntime?.isWholeDatapackAllowed?.();
    const options = [
        ['auto', 'Auto: Current Surface'],
        ['tab-current', 'Current Tab Only'],
        ['tab-branch', 'Current Tab + Sub Tabs'],
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

    manifestEl.innerHTML = `
        <div class="gemini-live-link-manifest-head">
            <span>${_escapeGeminiLiveLinkHtml(stateLabel || 'Inspectable relay manifest')}</span>
            <strong>${_escapeGeminiLiveLinkHtml(String(data.mode || 'summary').toUpperCase())}</strong>
        </div>
        <div class="gemini-live-link-manifest-grid">
            <span>Scope</span><b>${_escapeGeminiLiveLinkHtml(data.scope || 'current modular datapack')}</b>
            <span>Active tab</span><b>${_escapeGeminiLiveLinkHtml(data.activeWorkspaceName || data.activeWorkspaceId || 'main')}</b>
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

async function sendGeminiLiveLinkContext() {
    if (!_isGeminiLiveLinkEnabled()) {
        _setGeminiLiveLinkStatus('Enable EveOS Context Relay to send context.', true);
        return { ok: false, error: 'EveOS Context Relay is disabled.' };
    }

    const modeSelect = document.getElementById('geminiLiveLinkMode');
    const mode = _setGeminiLiveLinkMode(modeSelect?.value || _getGeminiLiveLinkMode());
    const profile = _getGeminiLiveLinkModeProfile(mode);
    const api = _getGeminiLiveLinkApi();

    if (!api?.sendContextToGemini) {
        _setGeminiLiveLinkStatus('Modular sync module is unavailable.', true);
        return { ok: false, error: 'Modular sync module is unavailable.' };
    }

    const selectedScope = _getGeminiLiveLinkSelectedScope();
    const scopeLabel = selectedScope?.label || selectedScope?.scope || 'selected scope';
    _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(mode, selectedScope), 'Preparing selected scope');
    _setGeminiLiveLinkStatus(`Preparing ${_formatGeminiLiveLinkModeLabel(mode)} for ${scopeLabel}...`, false);

    let result = null;
    try {
        result = await _withGeminiLiveLinkTimeout(
            api.sendContextToGemini(mode, profile.limit, { scope: selectedScope }),
            15000,
            'EveOS context preparation'
        );
    } catch (error) {
        const message = error?.message || String(error || 'Unknown relay error');
        _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(mode, selectedScope), 'Prepare failed');
        _setGeminiLiveLinkStatus(`Context relay failed: ${message}`, true);
        return { ok: false, error: message };
    }

    if (!result?.ok) {
        _renderGeminiLiveLinkManifest(result?.manifest || _buildPendingGeminiLiveLinkManifest(mode, selectedScope), 'Prepare failed');
        _setGeminiLiveLinkStatus(result?.error || 'Could not send selected EveOS context.', true);
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

    // Construct and append settings dialog if not already in document
    let dialog = document.getElementById('geminiLiveLinkSettingsDialog');
    if (!dialog) {
        const dialogDiv = document.createElement('div');
        dialogDiv.innerHTML = `
<dialog id="geminiLiveLinkSettingsDialog" class="mdl-dialog gemini-session-dialog" aria-labelledby="geminiLiveLinkSettingsTitle">
    <header class="gemini-session-dialog__header">
        <div>
            <span class="gemini-session-dialog__kicker">Agentic Functions</span>
            <h2 id="geminiLiveLinkSettingsTitle">Context Relay</h2>
            <p>Inspect what will be sent, then relay it into Gemini.</p>
        </div>
        <button type="button" id="geminiLiveLinkSettingsClose" class="gemini-session-dialog__icon" aria-label="Close settings">
            <i class="material-icons" aria-hidden="true">close</i>
        </button>
    </header>

    <div class="mdl-dialog__content gemini-session-dialog__content">
        <!-- Live Status and Manifest Stats -->
        <section class="gemini-session-section" style="margin-bottom: 20px;">
            <div id="geminiLiveLinkStatus" class="gemini-live-link-status" style="margin-bottom: 12px;">Ready. Review the manifest, then send EveOS context to Gemini.</div>
            <div id="geminiLiveLinkManifest" class="gemini-live-link-manifest" style="margin-bottom: 16px;"></div>
            
            <button id="geminiLiveLinkSendButton" class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored gemini-live-link-send" style="width: 100%; min-height: 44px; font-weight: 600; text-transform: none; font-size: 0.95rem; border-radius: 12px;">Send Selected Context</button>
        </section>

        <section class="gemini-session-section" aria-labelledby="contextRelayConfigHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Scoping & Detail</span>
                    <h3 id="contextRelayConfigHeading">Relay Behavior</h3>
                </div>
            </div>
            
            <div class="gemini-session-field-grid">
                <label class="gemini-session-field">
                    <span>Context Detail</span>
                    <select id="geminiLiveLinkMode">
                        <option value="brief">Quick Scoped Brief</option>
                        <option value="summary">Rich Scoped Summary</option>
                        <option value="deep">Deep Scoped Snapshot</option>
                        <option value="full">Complete Scoped Snapshot</option>
                    </select>
                </label>
                <label class="gemini-session-field">
                    <span>Context Scope</span>
                    <select id="geminiLiveLinkScopeMode">
                        <option value="auto">Auto: Current Surface</option>
                        <option value="tab-current">Current Tab Only</option>
                        <option value="tab-branch">Current Tab + Sub Tabs</option>
                        <option value="card">Specific Card</option>
                    </select>
                </label>
            </div>
            
            <div id="geminiLiveLinkCardScopeWrap" class="gemini-session-field gemini-session-field--wide" hidden style="margin-top: 12px;">
                <span>Select Card</span>
                <select id="geminiLiveLinkCardScope"></select>
            </div>
            
            <div id="geminiLiveLinkScopeExplain" class="gemini-session-help" style="margin-top: 12px;"></div>
        </section>

        <section class="gemini-session-section" aria-labelledby="contextRelayStreamHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Live Updates</span>
                    <h3 id="contextRelayStreamHeading">Data Stream</h3>
                </div>
                <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="geminiLiveLinkDataStreamToggle">
                    <input type="checkbox" id="geminiLiveLinkDataStreamToggle" class="mdl-switch__input">
                    <span class="gemini-session-switch-label">Streaming</span>
                </label>
            </div>
            <p class="gemini-session-help">
                Silently send matching Nexus/state updates for the selected scope. Scope decides what Gemini sees. Quick is lean, Rich is readable, Deep expands the selected tree, and Complete is the largest safe scoped snapshot.
            </p>
        </section>
    </div>

    <footer class="mdl-dialog__actions gemini-session-dialog__actions">
        <span class="gemini-session-dialog__save-note">Settings are applied immediately.</span>
        <button type="button" class="gemini-session-button gemini-session-button--primary" id="geminiLiveLinkSettingsSave">Done</button>
    </footer>
</dialog>
`;
        document.body.appendChild(dialogDiv.firstElementChild);
        dialog = document.getElementById('geminiLiveLinkSettingsDialog');
        if (typeof componentHandler !== 'undefined') {
            componentHandler.upgradeElements(dialog);
        }
        if (typeof dialog.showModal !== 'function' && typeof dialogPolyfill !== 'undefined') {
            dialogPolyfill.registerDialog(dialog);
        }

        // Bind close events
        const closeBtn = document.getElementById('geminiLiveLinkSettingsClose');
        const saveBtn = document.getElementById('geminiLiveLinkSettingsSave');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof dialog.close === 'function') dialog.close();
                else dialog.style.display = 'none';
            });
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (typeof dialog.close === 'function') dialog.close();
                else dialog.style.display = 'none';
            });
        }
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            if (typeof dialog.close === 'function') dialog.close();
            else dialog.style.display = 'none';
        });
    }

    const settingsButton = document.getElementById('geminiLiveLinkSettingsButton');
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            if (dialog) {
                if (typeof dialog.showModal === 'function') {
                    dialog.showModal();
                } else {
                    dialog.style.display = 'grid';
                }
            }
        });
    }

    const modeSelect = document.getElementById('geminiLiveLinkMode');
    if (modeSelect) {
        modeSelect.value = _getGeminiLiveLinkMode();
        modeSelect.addEventListener('change', () => {
            _setGeminiLiveLinkMode(modeSelect.value);
            _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(modeSelect.value), 'Mode changed');
            _setGeminiLiveLinkStatus(`Context detail set to ${_formatGeminiLiveLinkModeLabel(modeSelect.value)}.`, false);
        });
    }

    _refreshGeminiLiveLinkScopeOptions();
    const scopeSelect = document.getElementById('geminiLiveLinkScopeMode');
    if (scopeSelect) {
        scopeSelect.value = _getGeminiLiveLinkScopeMode();
        scopeSelect.addEventListener('change', () => {
            _setGeminiLiveLinkScopeMode(scopeSelect.value);
            _refreshGeminiLiveLinkCardOptions();
            _refreshGeminiLiveLinkScopeExplain(scopeSelect.value);
            _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(modeSelect?.value), 'Scope changed');
            _setGeminiLiveLinkStatus(`Context scope set to ${scopeSelect.options[scopeSelect.selectedIndex]?.text || scopeSelect.value}.`, false);
        });
    }

    const cardSelect = document.getElementById('geminiLiveLinkCardScope');
    if (cardSelect) {
        cardSelect.addEventListener('change', () => {
            _setGeminiLiveLinkSelectedCard(cardSelect.value);
            _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(modeSelect?.value), 'Card scope changed');
        });
    }

    const streamToggle = document.getElementById('geminiLiveLinkDataStreamToggle');
    if (streamToggle) {
        streamToggle.checked = _isGeminiLiveLinkDataStreamEnabled();
        streamToggle.addEventListener('change', () => {
            const enabled = _setGeminiLiveLinkDataStreamEnabled(streamToggle.checked);
            _setGeminiLiveLinkStatus(enabled
                ? 'Data Stream armed. Matching tab/card updates will be sent silently.'
                : 'Data Stream paused.', false);
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

    _refreshGeminiLiveLinkCardOptions();
    _bindGeminiLiveLinkDataStream();
    _applyGeminiLiveLinkEnabledState(_isGeminiLiveLinkEnabled());
    window.GeminiLiveLinkAssistRuntime?.update?.();
}

async function loadGeminiLiveLinkCard() {
    const placeholder = document.getElementById('gemini-live-link-card-placeholder');
    if (!placeholder) {
        console.error('Placeholder for Gemini Live Link card not found.');
        return Promise.reject(new Error('Gemini Live Link placeholder not found'));
    }

    try {
        const htmlContent = `
<div id="gemini-live-link-card" class="agentic-function-card gemini-live-link-card is-settings-collapsed">
    <div class="gemini-live-link-head">
        <div>
            <div class="gemini-live-link-kicker">EveOS Relay</div>
            <span class="gemini-live-link-title">EveOS Context Relay</span>
        </div>
        <div class="gemini-live-link-head-actions">
            <button type="button" id="geminiLiveLinkSettingsButton" class="gemini-live-link-settings-btn" aria-expanded="false" title="Show EveOS relay settings">
                <span class="material-icons">settings</span>
            </button>
            <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch gemini-live-link-toggle" for="geminiLiveLinkToggle" style="width:52px;height:32px;min-height:32px;flex:0 0 52px;">
                <input type="checkbox" id="geminiLiveLinkToggle" class="mdl-switch__input" checked>
                <span class="mdl-switch__label"></span>
            </label>
        </div>
    </div>
    <div class="gemini-agentic-card-copy">
        Choose a tab/card scope, inspect what will be sent, then relay it into Gemini.
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
