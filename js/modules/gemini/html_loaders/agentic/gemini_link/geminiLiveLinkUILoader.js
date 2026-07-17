/**
 * Loads the Gemini Live Link card and wires modular context send actions.
 */
window.GeminiLiveLinkAgentic = window.GeminiLiveLinkAgentic || {};

(function () {
    const agentic = window.GeminiLiveLinkAgentic;
    const state = agentic.uiState;
    const card = agentic.uiCard;
    if (!state || !card) throw new Error('[GeminiLiveLink] UI helper modules missing.');
    const {
        _getGeminiLiveLinkModeProfile,
        _getGeminiLiveLinkConfig,
        _getGeminiLiveLinkMode,
        _getGeminiLiveLinkApi,
        _isGeminiLiveLinkEnabled,
        _getGeminiLiveLinkScopeMode,
        _isGeminiLiveLinkDataStreamEnabled,
        _isGeminiLiveLinkSettingsOpen,
        _setGeminiLiveLinkSettingsOpen,
        _setGeminiLiveLinkMode,
        _setGeminiLiveLinkEnabled,
        _setGeminiLiveLinkScopeMode,
        _setGeminiLiveLinkSelectedCard,
        _setGeminiLiveLinkDataStreamEnabled,
        _getGeminiLiveLinkSelectedScope,
        _formatGeminiLiveLinkNumber,
        _buildPendingGeminiLiveLinkManifest,
        _formatGeminiLiveLinkModeLabel,
        _withGeminiLiveLinkTimeout
    } = state;
    const {
        _refreshGeminiLiveLinkScopeOptions,
        _refreshGeminiLiveLinkScopeExplain,
        _refreshGeminiLiveLinkCardOptions,
        _renderGeminiLiveLinkManifest,
        _summarizeGeminiLiveLinkResult,
        _setGeminiLiveLinkStatus,
        _bindGeminiLiveLinkDataStream,
        _applyGeminiLiveLinkSettingsState,
        _applyGeminiLiveLinkEnabledState
    } = card;
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
                <div class="gemini-session-section__heading-text">
                    <span class="gemini-session-section__kicker">Live Updates</span>
                    <h3 id="contextRelayStreamHeading">Data Stream</h3>
                </div>
                <div class="gemini-session-heading-switch">
                    <span class="gemini-session-switch-inline-label">Streaming</span>
                    <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="geminiLiveLinkDataStreamToggle">
                        <input type="checkbox" id="geminiLiveLinkDataStreamToggle" class="mdl-switch__input">
                    </label>
                </div>
            </div>
            <p class="gemini-session-help">
                Silently streams scoped state updates to Gemini as they happen. Scope decides
                which changes ship; every update carries real tab, card, and bookmark names plus
                what changed and why &mdash; watch the live flow via Insight Gathering in the
                Agent Space.
            </p>
        </section>

        <section class="gemini-session-section" aria-labelledby="contextRelaySelectiveHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Selective Send</span>
                    <h3 id="contextRelaySelectiveHeading">Send Just One Layer</h3>
                </div>
            </div>
            <p class="gemini-session-help">
                Each button sends only that layer for the surface you are on <strong>right now</strong>.
                &ldquo;This Tab&rdquo; buttons send just the current tab's own layer;
                &ldquo;+ Sub&#8319;&rdquo; buttons include the whole sub-tab chain at every depth
                (the Unidex overview always covers the whole datapack). Contents buttons also ship
                each bookmark's details &mdash; identifiers, status, library info, notes, tags &mdash;
                all sent silently.
            </p>
            <div class="gemini-session-field-grid" style="margin-top: 12px; gap: 10px;">
                <button type="button" class="gemini-session-button" id="geminiSelectiveTabsBtn" data-selective-kind="tabs" style="width: 100%;">Tab &amp; Sub-Tab Names</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveTabTreeBtn" data-selective-kind="tab-tree" style="width: 100%;">Full Tab Tree Names</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveCardsCurrentBtn" data-selective-kind="cards-current" style="width: 100%;">Card Names &mdash; This Tab</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveCardsBtn" data-selective-kind="cards" style="width: 100%;">Cards + Sub&#8319; Tab Cards</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveBookmarksCurrentBtn" data-selective-kind="bookmarks-current" style="width: 100%;">Bookmarks &amp; Folders &mdash; This Tab</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveBookmarksBtn" data-selective-kind="bookmarks" style="width: 100%;">Bookmarks &amp; Folders + Sub&#8319;</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveBookmarkContentsCurrentBtn" data-selective-kind="bookmark-contents-current" style="width: 100%;">+ Contents &mdash; This Tab</button>
                <button type="button" class="gemini-session-button" id="geminiSelectiveBookmarkContentsBtn" data-selective-kind="bookmark-contents" style="width: 100%;">+ Contents + Sub&#8319;</button>
            </div>
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
                // Rebuild the scope selects + manifest from LIVE config every time the dialog opens,
                // so the Scope/Active-tab summary reflects the tab you're on RIGHT NOW. Previously
                // it only rendered at load / on control changes, so after switching tabs it showed
                // the old tab until a full page reload.
                _refreshGeminiLiveLinkScopeOptions();
                _refreshGeminiLiveLinkCardOptions();
                _renderGeminiLiveLinkManifest(_buildPendingGeminiLiveLinkManifest(), 'Ready to prepare');
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

    // Selective sends: ship exactly one layer (tab names / full tab tree / card names /
    // bookmarks + folders) for the surface the user is on right now.
    ['geminiSelectiveTabsBtn', 'geminiSelectiveTabTreeBtn', 'geminiSelectiveCardsCurrentBtn', 'geminiSelectiveCardsBtn', 'geminiSelectiveBookmarksCurrentBtn', 'geminiSelectiveBookmarksBtn', 'geminiSelectiveBookmarkContentsCurrentBtn', 'geminiSelectiveBookmarkContentsBtn'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.addEventListener('click', () => {
            const api = _getGeminiLiveLinkApi();
            if (typeof api?.sendSelectiveContext !== 'function') {
                _setGeminiLiveLinkStatus('Selective context module is unavailable.', true);
                return;
            }
            const result = api.sendSelectiveContext(button.dataset.selectiveKind || 'tabs');
            if (!result?.sent) {
                _setGeminiLiveLinkStatus(result?.reason === 'socket-offline'
                    ? 'Gemini Live is offline — connect a session first, then resend.'
                    : 'Selective send failed.', true);
                return;
            }
            const folderNote = result.folderCount ? ` + ${_formatGeminiLiveLinkNumber(result.folderCount)} folders` : '';
            _setGeminiLiveLinkStatus(
                `Sent ${_formatGeminiLiveLinkNumber(result.count)} ${result.unit}${result.count === 1 ? '' : 's'}${folderNote} `
                + `for ${result.surface} (${_formatGeminiLiveLinkNumber(result.chars)} chars, ${result.route === 'text-brain' ? 'Mode 2 text brain' : 'live session'}).`,
                false
            );
        });
    });

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
})();
