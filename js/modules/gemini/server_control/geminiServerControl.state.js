(function () {
    'use strict';
    const runtime = window.GeminiServerControlRuntime = window.GeminiServerControlRuntime || {};
    if (runtime.stateApi) return;
    const STATUS_PATH = '/api/gemini-server/status', POLL_MS = 5000;
    const DESIRED_STATE_KEY = 'geminiServerDesiredState';
    const MANUAL_STOP_KEY = 'geminiServerManualStopAt';
    const RECOVERY_MIN_INTERVAL_MS = 12000;
    const STATUS_GRACE_MS = 20000;
    const state = {
        baseUrl: '',
        controllerAvailable: false,
        running: false,
        desiredRunning: false,
        serverState: 'checking',
        busy: false,
        message: 'Checking Gemini server...',
        connectionPhase: 'idle',
        credentialsConfigured: false,
        statusFailureCount: 0,
        lastKnownRunningAt: 0,
        lastRecoveryAttemptAt: 0,
        recoveryAttempts: 0,
        manualStop: false
    };
    // The EveOS python server's status endpoint does real work (listener sweep + backend
    // probe) and can legitimately take over a second on Windows. A flat 700ms budget made
    // localhost pages abort that probe every poll, so the controller was never "found" and
    // the pill sat in "checking" forever — while file:// (which never probes the page
    // origin) worked. Same-origin gets a budget that matches the endpoint's real cost.
    function probeTimeoutFor(baseUrl) {
        try {
            if (/^https?:$/.test(window.location.protocol) && baseUrl === window.location.origin) {
                return 3000;
            }
        } catch (error) { /* fall through to the fast budget */ }
        return 700;
    }

    async function findController() {
        const network = window.GeminiServerNetwork;
        if (state.baseUrl) {
            try {
                const payload = await network.fetchJson(`${state.baseUrl}${STATUS_PATH}`, null, Math.max(1000, probeTimeoutFor(state.baseUrl)));
                return { baseUrl: state.baseUrl, payload };
            } catch (error) {
                state.baseUrl = '';
            }
        }
        for (const baseUrl of network.localCandidateBases()) {
            try {
                const payload = await network.fetchJson(`${baseUrl}${STATUS_PATH}`, null, probeTimeoutFor(baseUrl));
                state.baseUrl = baseUrl;
                return { baseUrl, payload };
            } catch (error) {
                // Try the next known EveOS loopback server.
            }
        }
        return null;
    }

    async function checkDirectServerStatus() {
        try {
            const payload = await window.GeminiServerNetwork.fetchJson('http://127.0.0.1:9084/status', null, 700);
            return isStatusPayloadRunning(payload);
        } catch (error) {
            return false;
        }
    }

    function isStatusPayloadRunning(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.websocketReady === false) return false;
        return payload.running === true
            || payload.status === 'running'
            || payload.message === 'running';
    }
    function publish() {
        document.querySelectorAll('[data-gemini-server-control]').forEach(renderControl);
        window.dispatchEvent(new CustomEvent('eve:gemini-server-status', {
            detail: { ...state }
        }));
    }
    function renderControl(control) {
        const status = control.querySelector('[data-gemini-server-status]');
        const button = control.querySelector('[data-gemini-server-toggle]');
        const label = button?.querySelector('[data-gemini-server-action-label]');
        const icon = button?.querySelector('.material-icons');
        if (!status || !button || !label || !icon) return;

        control.dataset.state = state.serverState;
        control.dataset.connectionPhase = state.connectionPhase;
        status.textContent = state.serverState === 'running'
            ? 'Online'
            : state.serverState === 'starting'
                ? 'Starting'
                : state.serverState === 'stopping'
                    ? 'Stopping'
                    : state.serverState === 'recovering'
                        ? 'Recovering'
                        : state.serverState === 'reconnecting'
                            ? 'Reconnecting'
                : state.serverState === 'manual-stop'
                    ? 'Stopped'
                : state.serverState === 'error'
                    ? 'Error'
                    : 'Offline';
        const shouldOfferStop = state.running || state.desiredRunning || state.serverState === 'recovering';
        label.textContent = shouldOfferStop ? 'Stop' : 'Start';
        icon.textContent = state.busy || state.serverState === 'recovering' || state.serverState === 'reconnecting'
            ? 'sync'
            : (shouldOfferStop ? 'stop' : 'play_arrow');
        button.disabled = state.busy || (!state.controllerAvailable && !shouldOfferStop);
        button.classList.toggle('is-busy', state.busy);

        const unavailable = !state.controllerAvailable
            ? 'Start tools\\batch\\start-gemini-control.bat, or run EveOS through a local preview port, to enable Gemini Start/Stop from file://.'
            : '';
        control.title = unavailable || state.message;
        button.setAttribute('aria-label', shouldOfferStop ? 'Stop Gemini server' : 'Start Gemini server');
    }

    function readDesiredServerState() {
        try {
            return localStorage.getItem(DESIRED_STATE_KEY) === 'running';
        } catch (error) {
            return false;
        }
    }

    function setDesiredServerState(enabled) {
        state.desiredRunning = !!enabled;
        try {
            localStorage.setItem(DESIRED_STATE_KEY, enabled ? 'running' : 'stopped');
        } catch (error) {
            // Storage restrictions should not prevent the current session state.
        }
    }

    function setManualStop(enabled) {
        state.manualStop = !!enabled;
        try {
            if (enabled) localStorage.setItem(MANUAL_STOP_KEY, String(Date.now()));
            else localStorage.removeItem(MANUAL_STOP_KEY);
        } catch (error) {
            // Manual stop still applies in memory when storage is restricted.
        }
    }

    function isManualStopActive() {
        try {
            state.manualStop = localStorage.getItem(MANUAL_STOP_KEY) != null && readDesiredServerState() === false;
        } catch (error) {
            state.manualStop = state.manualStop && state.desiredRunning === false;
        }
        return !!state.manualStop;
    }

    function setConnectionPreference(enabled) {
        try {
            localStorage.setItem('geminiConnectionEnabled', enabled ? 'true' : 'false');
        } catch (error) {
            // Restricted storage should not block explicit lifecycle control.
        }
        if (!window.SocketGlobalState) return;
        window.SocketGlobalState.autoReconnectEnabled = enabled;
        window.SocketGlobalState.serverOfflinePauseActive = !enabled;
        if (enabled) {
            window.SocketGlobalState.reconnectAttempts = 0;
            window.SocketGlobalState.resetState?.();
        }
    }

    function isConnectionPreferenceEnabled() {
        try {
            return localStorage.getItem('geminiConnectionEnabled') !== 'false';
        } catch (error) {
            return true;
        }
    }

    function clearMissingCredentialGateIfVaultReady() {
        if (!window.SocketGlobalState?.credentialRequired) return true;
        if (window.SocketGlobalState.apiPolicyBlocked || window.SocketGlobalState.apiKeyInvalid) return false;
        if (!state.credentialsConfigured) return false;

        window.SocketGlobalState.credentialRequired = false;
        window.SocketGlobalState.geminiApiReady = false;
        window.SocketGlobalState.reconnectAttempts = 0;
        window.SocketGlobalState.serverOfflinePauseActive = false;
        state.connectionPhase = 'credential-ready';
        state.message = 'Gemini credentials are saved; reconnecting Live Workspace.';
        if (typeof window.updateConnectionStatus === 'function') {
            window.updateConnectionStatus('connecting', 'Gemini credentials ready - reconnecting...');
        }
        publish();
        return true;
    }

    function shouldAutoRecoverDisabledConnection() {
        if (isManualStopActive()) return false;
        const root = document.getElementById('gemini-ui-root');
        return !!state.running && (
            !!window.__GEMINI_BOOT_REQUESTED
            || root?.dataset.geminiMonitorView === 'full'
            || !!root?.querySelector?.('#connectionStatus')
            || state.connectionPhase === 'requesting'
            || state.connectionPhase === 'requested'
        );
    }

    async function syncCredentials(options) {
        const found = state.baseUrl ? { baseUrl: state.baseUrl } : await findController();
        if (!found?.baseUrl || !window.GeminiCredentialBridge) {
            return { ok: false, configured: false };
        }
        try {
            const payload = await window.GeminiCredentialBridge.sync(found.baseUrl, options);
            state.credentialsConfigured = !!payload.configured;
            if (payload.configured && window.SocketGlobalState) {
                window.SocketGlobalState.credentialRequired = false;
                window.SocketGlobalState.apiPolicyBlocked = false;
                window.SocketGlobalState.apiKeyInvalid = false;
                if (state.running && isConnectionPreferenceEnabled()) {
                    window.SocketConnectionCore?.startAutoReconnect?.();
                }
            }
            publish();
            return payload;
        } catch (error) {
            console.warn('[GeminiServerControl] Credential synchronization failed:', error);
            return { ok: false, configured: false,
                message: error?.message || 'Gemini credential synchronization failed.' };
        }
    }
    runtime.stateApi = Object.freeze({
        POLL_MS,
        RECOVERY_MIN_INTERVAL_MS,
        STATUS_GRACE_MS,
        state,
        findController,
        checkDirectServerStatus,
        publish,
        readDesiredServerState,
        setDesiredServerState,
        setManualStop,
        isManualStopActive,
        setConnectionPreference,
        isConnectionPreferenceEnabled,
        clearMissingCredentialGateIfVaultReady,
        shouldAutoRecoverDisabledConnection,
        syncCredentials
    });
})();