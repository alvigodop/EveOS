/**
 * Builds the Session Controls dialog used by the embedded Gemini workspace.
 */
async function loadSessionControlsSettingsDialog() {
    if (document.getElementById('sessionControlsDialog')) return;
    if (!document.body) throw new Error('Body element not found');

    const container = document.createElement('div');
    container.innerHTML = `
<dialog id="sessionControlsDialog" class="mdl-dialog gemini-session-dialog" aria-labelledby="sessionControlsTitle">
    <header class="gemini-session-dialog__header">
        <div>
            <span class="gemini-session-dialog__kicker">Agentic Functions</span>
            <h2 id="sessionControlsTitle">Session Controls</h2>
            <p>Connection rhythm, secure credentials, and Gemini response behavior.</p>
        </div>
        <button type="button" id="sessionControlsClose" class="gemini-session-dialog__icon" aria-label="Close session settings">
            <i class="material-icons" aria-hidden="true">close</i>
        </button>
    </header>

    <div class="mdl-dialog__content gemini-session-dialog__content">
        <section class="gemini-session-section" aria-labelledby="geminiConnectionHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Connection</span>
                    <h3 id="geminiConnectionHeading">Keep the live session steady</h3>
                </div>
                <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="keepAliveToggleSess">
                    <input type="checkbox" id="keepAliveToggleSess" class="mdl-switch__input">
                    <span class="gemini-session-switch-label">Keep alive</span>
                </label>
            </div>
            <div class="gemini-session-field-grid gemini-session-field-grid--three">
                <label class="gemini-session-field">
                    <span>Heartbeat</span>
                    <div class="gemini-session-input-unit">
                        <input type="number" id="heartbeatIntervalInputSess" min="5" max="300" value="60">
                        <span>sec</span>
                    </div>
                </label>
                <label class="gemini-session-field">
                    <span>Cleanup</span>
                    <div class="gemini-session-input-unit">
                        <input type="number" id="cleanupIntervalInputSess" min="5" max="3600" value="60">
                        <span>sec</span>
                    </div>
                </label>
                <label class="gemini-session-field">
                    <span>Response timeout</span>
                    <div class="gemini-session-input-unit">
                        <input type="number" id="responseTimeoutInputSess" min="30" max="300" value="75">
                        <span>sec</span>
                    </div>
                </label>
            </div>
        </section>

        <section class="gemini-session-section gemini-session-section--credential" aria-labelledby="geminiCredentialHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Credential Vault</span>
                    <h3 id="geminiCredentialHeading">Gemini API key</h3>
                </div>
                <span id="geminiCredentialBadge" class="gemini-session-status-badge" data-state="checking">Checking</span>
            </div>
            <div class="gemini-session-secret-row">
                <input type="password" id="apiKeyInputSess" name="gemini-api-key" autocomplete="new-password"
                    data-lpignore="true" data-1p-ignore="true" spellcheck="false"
                    placeholder="Paste a new API key to replace the saved credential">
                <button type="button" id="geminiApiKeyReveal" class="gemini-session-dialog__icon" aria-label="Show API key" aria-pressed="false">
                    <i class="material-icons" aria-hidden="true">visibility</i>
                </button>
            </div>
            <p id="geminiCredentialStatus" class="gemini-session-help" role="status" aria-live="polite">
                Checking the encrypted local credential vault...
            </p>
        </section>

        <section class="gemini-session-section" aria-labelledby="geminiModelHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Model</span>
                    <h3 id="geminiModelHeading">Response configuration</h3>
                </div>
            </div>
            <label class="gemini-session-field gemini-session-field--wide">
                <span>System instructions</span>
                <textarea id="systemInstructionInputSess" rows="4" placeholder="Persona, behavior, and response guidance..."></textarea>
            </label>
            <div class="gemini-session-field-grid">
                <label class="gemini-session-field gemini-session-field--wide">
                    <span>Gemini model</span>
                    <select id="modelSelectSess">
                        <option value="gemini-2.5-flash-native-audio-latest">Gemini 2.5 Flash Native Audio &mdash; 128K context (recommended)</option>
                        <option value="gemini-2.5-flash-preview-native-audio-dialog">Gemini 2.5 Flash Native Audio (preview) &mdash; 128K context</option>
                        <option value="gemini-2.0-flash-live-001">Gemini 2.0 Flash Live &mdash; 1M context</option>
                    </select>
                </label>
                <label class="gemini-session-field">
                    <span>Safety level</span>
                    <select id="safetyLevelSelectSess">
                        <option value="high">Default (High)</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="none">None (Permissive)</option>
                    </select>
                </label>
            </div>
            <div class="gemini-session-field-grid gemini-session-field-grid--four">
                <label class="gemini-session-field"><span>Temperature</span><input type="number" id="temperatureInputSess" min="0" max="2" step="0.1" value="0.9"></label>
                <label class="gemini-session-field"><span>Top K</span><input type="number" id="topKInputSess" min="1" value="1"></label>
                <label class="gemini-session-field"><span>Top P</span><input type="number" id="topPInputSess" min="0" max="1" step="0.1" value="1"></label>
                <label class="gemini-session-field"><span>Max tokens</span><input type="number" id="maxTokensInputSess" min="1" value="2048"></label>
            </div>
            <div class="gemini-session-field-grid">
                <label class="gemini-session-field gemini-session-field--wide">
                    <span>Mode 2 text-brain model</span>
                    <select id="textBrainModelSelectSess">
                        <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite &mdash; 1M context (recommended &middot; fastest, highest free quota)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash &mdash; 1M context (smarter &middot; lower free quota)</option>
                        <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite &mdash; 1M context</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash &mdash; 1M context</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro &mdash; 1M context (smartest &middot; very limited free quota)</option>
                    </select>
                </label>
            </div>
            <p class="gemini-session-help">The text brain runs only in <strong>Mode 2</strong> (Text Brain &rarr; Live Voice). Because it has a <strong>1M-token window</strong> versus the live model's <strong>128K</strong>, it can absorb the full EveOS context relay and hand the live model just the facts it needs to speak &mdash; so the live session never gets overloaded. Heavier models are smarter but hit free-tier limits faster; on a 429 the relay cools down and replies directly.</p>
        </section>

        <section class="gemini-session-section" aria-labelledby="geminiVoiceHeading">
            <div class="gemini-session-section__heading">
                <div>
                    <span class="gemini-session-section__kicker">Voice</span>
                    <h3 id="geminiVoiceHeading">Playback character</h3>
                </div>
            </div>
            <div class="gemini-session-field-grid">
                <label class="gemini-session-field"><span>Speaking rate</span><input type="number" id="speakingRateInputSess" min="0.25" max="4" step="0.05" value="1"></label>
                <label class="gemini-session-field"><span>Pitch</span><input type="number" id="pitchInputSess" min="-20" max="20" step="1" value="0"></label>
            </div>
        </section>
    </div>

    <footer class="mdl-dialog__actions gemini-session-dialog__actions">
        <span class="gemini-session-dialog__save-note">Model changes apply on the next Gemini connection.</span>
        <button type="button" class="gemini-session-button gemini-session-button--quiet" id="sessionControlsCancel">Cancel</button>
        <button type="button" class="gemini-session-button gemini-session-button--primary" id="sessionControlsSave">Save settings</button>
    </footer>
</dialog>`;

    document.body.appendChild(container.firstElementChild);
    const dialog = document.getElementById('sessionControlsDialog');
    if (typeof componentHandler !== 'undefined') componentHandler.upgradeElements(dialog);
    if (typeof dialog.showModal !== 'function' && typeof dialogPolyfill !== 'undefined') {
        dialogPolyfill.registerDialog(dialog);
    }
}

window.loadSessionControlsSettingsDialog = loadSessionControlsSettingsDialog;
