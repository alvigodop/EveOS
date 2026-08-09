// Session Controls settings, including secure Gemini credential handoff.
(function () {
    'use strict';

    window.SessionControlsAgentic = window.SessionControlsAgentic || {};

    const LIVE_DEFAULT = window.EveGeminiModelRegistry?.defaults?.live || 'gemini-3.1-flash-live-preview';
    const TEXT_BRAIN_DEFAULT = window.EveGeminiModelRegistry?.defaults?.textBrain || 'gemini-3.5-flash-lite';

    const STORAGE_FIELDS = {
        heartbeatInput: ['heartbeatIntervalSec', '60'],
        cleanupInput: ['cleanupInterval', '60'],
        responseTimeoutInput: ['responseTimeout', '75'],
        modelSelect: ['selectedModel', LIVE_DEFAULT],
        textBrainModelSelect: ['textBrainModel', TEXT_BRAIN_DEFAULT],
        temperatureInput: ['generationTemperature', '0.9'],
        topKInput: ['generationTopK', '1'],
        topPInput: ['generationTopP', '1'],
        maxTokensInput: ['generationMaxTokens', '2048'],
        systemInstructionInput: ['systemInstruction', ''],
        safetyLevelSelect: ['safetyLevel', 'high'],
        speakingRateInput: ['speakingRate', '1.0'],
        pitchInput: ['pitch', '0']
    };

    function getElements() {
        return {
            button: document.getElementById('sessionControlsSettingsButton'),
            dialog: document.getElementById('sessionControlsDialog'),
            saveBtn: document.getElementById('sessionControlsSave'),
            cancelBtn: document.getElementById('sessionControlsCancel'),
            closeBtn: document.getElementById('sessionControlsClose'),
            keepAliveToggle: document.getElementById('keepAliveToggleSess'),
            heartbeatInput: document.getElementById('heartbeatIntervalInputSess'),
            cleanupInput: document.getElementById('cleanupIntervalInputSess'),
            responseTimeoutInput: document.getElementById('responseTimeoutInputSess'),
            modelSelect: document.getElementById('modelSelectSess'),
            textBrainModelSelect: document.getElementById('textBrainModelSelectSess'),
            temperatureInput: document.getElementById('temperatureInputSess'),
            topKInput: document.getElementById('topKInputSess'),
            topPInput: document.getElementById('topPInputSess'),
            maxTokensInput: document.getElementById('maxTokensInputSess'),
            apiKeyInput: document.getElementById('apiKeyInputSess'),
            apiKeyReveal: document.getElementById('geminiApiKeyReveal'),
            credentialStatus: document.getElementById('geminiCredentialStatus'),
            credentialBadge: document.getElementById('geminiCredentialBadge'),
            systemInstructionInput: document.getElementById('systemInstructionInputSess'),
            safetyLevelSelect: document.getElementById('safetyLevelSelectSess'),
            speakingRateInput: document.getElementById('speakingRateInputSess'),
            pitchInput: document.getElementById('pitchInputSess'),
            liveModelSummary: document.getElementById('liveModelCapabilitySummary'),
            textBrainModelSummary: document.getElementById('textBrainModelCapabilitySummary'),
            usageReset: document.getElementById('geminiUsageReset'),
            liveTokenTotal: document.getElementById('geminiLiveTokenTotal'),
            liveTokenDetail: document.getElementById('geminiLiveTokenDetail'),
            textBrainTokenTotal: document.getElementById('geminiTextBrainTokenTotal'),
            textBrainTokenDetail: document.getElementById('geminiTextBrainTokenDetail'),
            combinedTokenTotal: document.getElementById('geminiCombinedTokenTotal'),
            combinedTokenDetail: document.getElementById('geminiCombinedTokenDetail')
        };
    }

    function safeStorageGet(key, fallback) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch (error) {
            return fallback;
        }
    }

    function safeStorageSet(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (error) {
            console.warn(`[SessionControls] Could not persist ${key}:`, error);
        }
    }

    function setCredentialStatus(elements, state, message) {
        if (elements.credentialBadge) {
            elements.credentialBadge.dataset.state = state;
            elements.credentialBadge.textContent = {
                ready: 'Secured',
                saving: 'Saving',
                error: 'Needs attention',
                missing: 'Not set'
            }[state] || 'Checking';
        }
        if (elements.credentialStatus) elements.credentialStatus.textContent = message;
    }

    function formatCount(value) {
        return Math.max(0, Number(value) || 0).toLocaleString();
    }

    function updateUsage(elements, providedTotals) {
        const totals = providedTotals || window.EveGeminiUsageTelemetry?.getTotals?.() || {
            live: { total: 0, turns: 0 },
            textBrain: { total: 0, calls: 0 },
            combined: { total: 0, prompt: 0, output: 0 }
        };
        if (elements.liveTokenTotal) elements.liveTokenTotal.textContent = formatCount(totals.live?.total);
        if (elements.liveTokenDetail) {
            const turns = Number(totals.live?.turns) || 0;
            elements.liveTokenDetail.textContent = `${formatCount(turns)} ${turns === 1 ? 'turn' : 'turns'}`;
        }
        if (elements.textBrainTokenTotal) elements.textBrainTokenTotal.textContent = formatCount(totals.textBrain?.total);
        if (elements.textBrainTokenDetail) {
            const calls = Number(totals.textBrain?.calls) || 0;
            elements.textBrainTokenDetail.textContent = `${formatCount(calls)} ${calls === 1 ? 'call' : 'calls'}`;
        }
        if (elements.combinedTokenTotal) elements.combinedTokenTotal.textContent = formatCount(totals.combined?.total);
        if (elements.combinedTokenDetail) {
            elements.combinedTokenDetail.textContent = `Input ${formatCount(totals.combined?.prompt)} / Output ${formatCount(totals.combined?.output)}`;
        }
    }

    function updateModelSummaries(elements) {
        const registry = window.EveGeminiModelRegistry;
        const live = registry?.getModel?.('live', elements.modelSelect?.value);
        const textBrain = registry?.getModel?.('textBrain', elements.textBrainModelSelect?.value);
        if (elements.liveModelSummary) elements.liveModelSummary.textContent = live?.summary || 'Live voice and native audio transport.';
        if (elements.textBrainModelSummary) elements.textBrainModelSummary.textContent = textBrain?.summary || 'Mode 2 context extraction model.';
    }

    function prepareModelControls(elements) {
        const registry = window.EveGeminiModelRegistry;
        registry?.migrateStorage?.();
        registry?.populateSelect?.(
            elements.modelSelect,
            'live',
            safeStorageGet('selectedModel', LIVE_DEFAULT)
        );
        registry?.populateSelect?.(
            elements.textBrainModelSelect,
            'textBrain',
            safeStorageGet('textBrainModel', TEXT_BRAIN_DEFAULT)
        );
        updateModelSummaries(elements);
    }

    async function refreshCredentialStatus(elements) {
        setCredentialStatus(elements, 'checking', 'Checking the encrypted local credential vault...');
        const control = window.GeminiServerControl;
        if (!control?.syncCredentials) {
            setCredentialStatus(elements, 'error', 'The local Gemini credential service is unavailable.');
            return false;
        }
        const payload = await control.syncCredentials();
        if (payload?.configured) {
            setCredentialStatus(elements, 'ready', 'An API key is secured in the local Windows credential vault.');
            return true;
        }
        if (payload?.message && payload.ok === false) {
            setCredentialStatus(elements, 'error', payload.message);
            return false;
        }
        setCredentialStatus(elements, 'missing', 'No API key is saved. Paste one here to secure it for Gemini startup.');
        return false;
    }

    function restoreSettings(elements) {
        prepareModelControls(elements);
        Object.entries(STORAGE_FIELDS).forEach(function ([elementKey, storageConfig]) {
            if (elements[elementKey]) {
                elements[elementKey].value = elementKey === 'systemInstructionInput' && window.GeminiInstructionState?.getBaseInstruction
                    ? window.GeminiInstructionState.getBaseInstruction()
                    : safeStorageGet(storageConfig[0], storageConfig[1]);
            }
        });
        if (elements.keepAliveToggle) {
            const keepAlive = safeStorageGet('keepSessionAlive', 'false') === 'true';
            elements.keepAliveToggle.checked = keepAlive;
            elements.keepAliveToggle.parentElement?.MaterialSwitch?.checkToggleState?.();
        }
        if (elements.apiKeyInput) {
            // Only legacy unsynchronized keys appear here. Secured keys are never read back into the page.
            elements.apiKeyInput.value = safeStorageGet('geminiApiKey', '');
            elements.apiKeyInput.type = 'password';
        }
        updateModelSummaries(elements);
        updateUsage(elements);
    }

    function persistSettings(elements) {
        safeStorageSet('keepSessionAlive', !!elements.keepAliveToggle?.checked);
        Object.entries(STORAGE_FIELDS).forEach(function ([elementKey, storageConfig]) {
            if (!elements[elementKey]) return;
            if (elementKey === 'systemInstructionInput' && window.GeminiInstructionState?.setBaseInstruction) {
                window.GeminiInstructionState.setBaseInstruction(elements[elementKey].value);
                return;
            }
            let value = elements[elementKey].value;
            if (elementKey === 'modelSelect') {
                value = window.EveGeminiModelRegistry?.resolve?.('live', value) || LIVE_DEFAULT;
            } else if (elementKey === 'textBrainModelSelect') {
                value = window.EveGeminiModelRegistry?.resolve?.('textBrain', value) || TEXT_BRAIN_DEFAULT;
            }
            safeStorageSet(storageConfig[0], value);
        });
    }

    function closeDialog(dialog) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.style.display = 'none';
    }

    async function openDialog(elements) {
        restoreSettings(elements);
        if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
        else elements.dialog.style.display = 'grid';
        await refreshCredentialStatus(elements);
    }

    function announce(displayMessage, message) {
        if (typeof displayMessage === 'function') displayMessage(`System Message: ${message}`, true);
    }

    async function saveSettings(elements, getWebSocket, displayMessage) {
        if (elements.saveBtn.disabled) return;
        const originalLabel = elements.saveBtn.textContent;
        elements.saveBtn.disabled = true;
        elements.saveBtn.textContent = 'Saving...';

        try {
            const previousTextBrainModel = safeStorageGet('textBrainModel', TEXT_BRAIN_DEFAULT);
            persistSettings(elements);
            const nextTextBrainModel = safeStorageGet('textBrainModel', TEXT_BRAIN_DEFAULT);
            // The text-brain model rides on every request — switching it needs NO reconnect.
            // Say so explicitly, or a switch during a session reads as "stuck".
            if (nextTextBrainModel !== previousTextBrainModel) {
                announce(displayMessage, `Mode 2 text-brain model switched to ${nextTextBrainModel} — active immediately on the next text-brain request (no reconnect needed).`);
            }
            const apiKey = String(elements.apiKeyInput?.value || '').trim();
            let apiKeySyncState = '';
            if (apiKey) {
                safeStorageSet('geminiApiKey', apiKey);
                setCredentialStatus(elements, 'saving', 'Saved locally. Syncing the key into the local credential vault...');
                const workflow = window.GeminiCredentialWorkflow?.saveCredentials
                    || window.GeminiServerControl?.saveCredentials;
                if (typeof workflow !== 'function') {
                    apiKeySyncState = 'local';
                    setCredentialStatus(elements, 'missing', 'Saved locally. Start the Gemini controller to sync it into the credential vault.');
                } else {
                    try {
                        await workflow(apiKey);
                        // Hand it to the in-browser SDK lane before clearing the persisted copy.
                        // Sonic Forge talks to Lyria from the page, and the vault deliberately
                        // never returns a key, so its only sources are sessionStorage and the
                        // localStorage entry cleared on the next line -- meaning a SUCCESSFUL
                        // vault sync was what broke it, and it then reported "Set it in Search
                        // Monitor Session Controls" to someone who just had. sessionStorage is
                        // per-tab and dies with it, so it cannot shadow the vault the way a
                        // persisted key does, which is the reason for the clear in the first place.
                        window.EveAudioflixSoundLabSdk?.setApiKey?.(apiKey);
                        try { localStorage.removeItem('geminiApiKey'); } catch (error) {}
                        elements.apiKeyInput.value = '';
                        apiKeySyncState = 'secured';
                        setCredentialStatus(elements, 'ready', 'API key secured. Reconnecting the Gemini workspace...');
                    } catch (error) {
                        apiKeySyncState = 'local';
                        console.warn('[SessionControls] Secure credential sync failed; local fallback kept:', error);
                        setCredentialStatus(elements, 'error', `Saved locally, but secure vault sync failed: ${error?.message || 'Unknown error'}`);
                    }
                }
            }

            const cleanupInterval = Number.parseInt(elements.cleanupInput?.value || '60', 10);
            const currentWebSocket = getWebSocket?.();
            if (currentWebSocket?.readyState === window.WebSocket?.OPEN) {
                currentWebSocket.send(JSON.stringify({
                    command: 'set_cleanup_interval',
                    interval: cleanupInterval
                }));
            }

            announce(displayMessage, apiKey
                ? (apiKeySyncState === 'secured'
                    ? 'Settings and Gemini credentials secured. Reconnecting now.'
                    : 'Settings saved. Gemini API key kept locally and will sync when the controller is available.')
                : 'Session settings saved. LIVE model changes apply on reconnect; the Mode 2 text-brain model applies immediately.');
            closeDialog(elements.dialog);
        } catch (error) {
            console.error('[SessionControls] Error saving settings:', error);
            setCredentialStatus(elements, 'error', error?.message || 'Settings could not be saved.');
            announce(displayMessage, `Settings were not fully saved: ${error?.message || 'Unknown error'}`);
        } finally {
            elements.saveBtn.disabled = false;
            elements.saveBtn.textContent = originalLabel;
        }
    }

    window.SessionControlsAgentic.initializeSessionControlsSettings = function (getWebSocket, displayMessage) {
        const elements = getElements();
        if (!elements.button || !elements.dialog || !elements.saveBtn || !elements.cancelBtn) {
            console.error('[SessionControls] Required UI elements were not found.');
            return false;
        }
        if (elements.dialog.dataset.sessionControlsBound === '1') return true;
        elements.dialog.dataset.sessionControlsBound = '1';

        if (typeof elements.dialog.showModal !== 'function' && typeof dialogPolyfill !== 'undefined') {
            dialogPolyfill.registerDialog(elements.dialog);
        }

        elements.button.addEventListener('click', function () {
            openDialog(elements).catch(function (error) {
                console.error('[SessionControls] Could not open settings:', error);
                announce(displayMessage, 'Could not open Session Controls.');
            });
        });
        [elements.cancelBtn, elements.closeBtn].filter(Boolean).forEach(function (button) {
            button.addEventListener('click', function () {
                closeDialog(elements.dialog);
            });
        });
        elements.apiKeyReveal?.addEventListener('click', function () {
            const showing = elements.apiKeyInput.type === 'text';
            elements.apiKeyInput.type = showing ? 'password' : 'text';
            elements.apiKeyReveal.setAttribute('aria-pressed', String(!showing));
            elements.apiKeyReveal.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
            const icon = elements.apiKeyReveal.querySelector('.material-icons');
            if (icon) icon.textContent = showing ? 'visibility' : 'visibility_off';
        });
        elements.saveBtn.addEventListener('click', function () {
            saveSettings(elements, getWebSocket, displayMessage);
        });
        [elements.modelSelect, elements.textBrainModelSelect].filter(Boolean).forEach(function (select) {
            select.addEventListener('change', function () { updateModelSummaries(elements); });
        });
        elements.usageReset?.addEventListener('click', function () {
            const totals = window.EveGeminiUsageTelemetry?.reset?.();
            updateUsage(elements, totals);
        });
        elements.dialog.addEventListener('cancel', function (event) {
            event.preventDefault();
            closeDialog(elements.dialog);
        });
        window.addEventListener('eve:gemini-server-status', function (event) {
            if (!elements.dialog.open) return;
            const configured = !!event.detail?.credentialsConfigured;
            if (configured) {
                setCredentialStatus(elements, 'ready', 'An API key is secured in the local Windows credential vault.');
            }
        });
        window.addEventListener('eve:gemini-usage', function (event) {
            updateUsage(elements, event.detail);
        });
        prepareModelControls(elements);
        updateUsage(elements);
        return true;
    };
})();
