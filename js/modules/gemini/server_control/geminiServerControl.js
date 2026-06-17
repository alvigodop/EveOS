(function () {
    'use strict';
    const STATUS_PATH = '/api/gemini-server/status', POLL_MS = 5000;
    const DESIRED_STATE_KEY = 'geminiServerDesiredState';
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
        recoveryAttempts: 0
    };
    let reconcilePromise = null;
    let recoveryPromise = null;
    async function findController() {
        const network = window.GeminiServerNetwork;
        if (state.baseUrl) {
            try {
                const payload = await network.fetchJson(`${state.baseUrl}${STATUS_PATH}`, null, 1000);
                return { baseUrl: state.baseUrl, payload };
            } catch (error) {
                state.baseUrl = '';
            }
        }
        for (const baseUrl of network.localCandidateBases()) {
            try {
                const payload = await network.fetchJson(`${baseUrl}${STATUS_PATH}`, null, 700);
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
            ? 'Start server\\start-gemini-control.bat, or run EveOS through a local preview port, to enable Gemini Start/Stop from file://.'
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

    function shouldAutoRecoverDisabledConnection() {
        const root = document.getElementById('gemini-ui-root');
        return !!state.running && (
            !!window.__GEMINI_BOOT_REQUESTED
            || root?.dataset.geminiMonitorView === 'full'
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

    function connectClient() {
        if (window.SocketGlobalState?.credentialRequired) {
            state.connectionPhase = 'credentials-required';
            publish();
            return;
        }
        if (window.webSocket?.readyState === WebSocket.OPEN) {
            state.connectionPhase = 'connected';
            publish();
            return;
        }
        if (window.webSocket?.readyState === WebSocket.CONNECTING || window.SocketGlobalState?.isConnecting) {
            state.connectionPhase = 'requesting';
            publish();
            return;
        }
        state.connectionPhase = 'requesting';
        publish();
        if (typeof window.updateConnectionStatus === 'function') {
            window.updateConnectionStatus('connecting', 'Connecting to Gemini...');
        }
        let attempts = 0;
        const requestConnection = function () {
            attempts += 1;
            if (window.webSocket?.readyState === WebSocket.OPEN
                || window.webSocket?.readyState === WebSocket.CONNECTING
                || window.SocketGlobalState?.isConnecting) {
                state.connectionPhase = window.webSocket?.readyState === WebSocket.OPEN
                    ? 'connected'
                    : 'requesting';
                publish();
                return;
            }
            const core = window.SocketConnectionCore;
            if (typeof core?.connect === 'function') {
                state.connectionPhase = 'requested';
                publish();
                core.connect();
                window.dispatchEvent(new CustomEvent('eve:gemini-connect-requested'));
                return;
            }
            if (typeof window.connect === 'function') {
                state.connectionPhase = 'requested';
                publish();
                window.connect();
                window.dispatchEvent(new CustomEvent('eve:gemini-connect-requested'));
                return;
            }
            if (attempts < 40) {
                window.setTimeout(requestConnection, 150);
            } else {
                state.connectionPhase = 'unavailable';
                publish();
            }
        };
        window.setTimeout(requestConnection, 100);
    }

    async function reconcileClientConnection() {
        if (!state.running) {
            if (!window.webSocket || window.webSocket.readyState >= WebSocket.CLOSING) {
                state.connectionPhase = state.desiredRunning ? 'recovering' : 'offline';
                if (typeof window.updateConnectionStatus === 'function') {
                    window.updateConnectionStatus(
                        state.desiredRunning ? 'waiting' : 'disconnected',
                        state.desiredRunning ? 'Gemini Recovering...' : 'Gemini Server Offline'
                    );
                }
                publish();
            }
            return false;
        }
        if (!isConnectionPreferenceEnabled()) {
            if (!shouldAutoRecoverDisabledConnection()) return false;
            setConnectionPreference(true);
        }
        if (window.SocketGlobalState?.credentialRequired) {
            state.connectionPhase = 'credentials-required';
            publish();
            return false;
        }
        if (window.webSocket?.readyState === WebSocket.OPEN) {
            state.connectionPhase = window.SocketGlobalState?.geminiApiReady ? 'connected' : 'initializing';
            publish();
            return true;
        }
        if (window.webSocket?.readyState === WebSocket.CONNECTING || window.SocketGlobalState?.isConnecting) {
            return false;
        }

        const root = document.getElementById('gemini-ui-root');
        const shouldBoot = !!window.__GEMINI_BOOT_REQUESTED
            || root?.dataset.geminiMonitorView === 'full'
            || state.connectionPhase === 'requesting'
            || state.connectionPhase === 'requested';
        if (!shouldBoot) return false;
        if (reconcilePromise) return reconcilePromise;

        reconcilePromise = (async function () {
            const ready = await ensureWorkspaceReady();
            if (ready && state.running && isConnectionPreferenceEnabled()) {
                connectClient();
                return true;
            }
            return false;
        })().finally(function () {
            reconcilePromise = null;
        });
        return reconcilePromise;
    }

    function waitForWindowEvent(eventName, readyCheck, timeoutMs) {
        if (readyCheck()) return Promise.resolve(true);
        return new Promise(function (resolve) {
            let settled = false;
            const finish = function (ready) {
                if (settled) return;
                settled = true;
                window.removeEventListener(eventName, onReady);
                window.clearInterval(pollTimer);
                window.clearTimeout(timeoutTimer);
                resolve(ready);
            };
            const onReady = function () {
                finish(readyCheck());
            };
            const pollTimer = window.setInterval(function () {
                if (readyCheck()) finish(true);
            }, 150);
            const timeoutTimer = window.setTimeout(function () {
                finish(readyCheck());
            }, timeoutMs || 45000);
            window.addEventListener(eventName, onReady);
        });
    }

    function bootWorkspaceForConnection() {
        return ensureWorkspaceReady().catch(function (error) {
            state.connectionPhase = 'workspace-error';
            state.message = error?.message || 'Gemini workspace boot failed.';
            publish();
            console.warn('[GeminiServerControl] Workspace boot failed:', error);
            return false;
        });
    }

    function connectWhenWorkspaceReady(workspacePromise) {
        Promise.resolve(workspacePromise).then(function (ready) {
            if (ready && state.running && isConnectionPreferenceEnabled()) {
                connectClient();
            }
        }).catch(function (error) {
            state.connectionPhase = 'workspace-error';
            state.message = error?.message || 'Gemini workspace boot failed.';
            publish();
            console.warn('[GeminiServerControl] Deferred workspace connect failed:', error);
        });
    }

    async function ensureWorkspaceReady() {
        state.connectionPhase = 'booting';
        publish();
        window.__GEMINI_BOOT_REQUESTED = true;

        let trigger = window.__loadGeminiScriptsNow;
        if (typeof trigger !== 'function') {
            await waitForWindowEvent('eve:gemini-loader-ready', function () {
                return typeof window.__loadGeminiScriptsNow === 'function';
            }, 8000);
            trigger = window.__loadGeminiScriptsNow;
        }

        if (typeof trigger !== 'function') {
            state.connectionPhase = 'loader-unavailable';
            state.message = 'Gemini server is online, but the workspace loader is not ready yet.';
            publish();
            return false;
        }

        if (typeof trigger === 'function') {
            await trigger();
        }

        const workspaceReady = await waitForWindowEvent('eve:gemini-workspace-ready', function () {
            return !!window.__GEMINI_WORKSPACE_READY
                && !!document.getElementById('textInput')
                && !!document.getElementById('sendButton')
                && typeof window.sendTextMessage === 'function';
        }, 45000);

        if (!workspaceReady) {
            state.connectionPhase = 'workspace-timeout';
            state.message = 'Gemini server is online, but the workspace did not finish loading yet.';
            publish();
            return false;
        }

        const socketReady = await waitForWindowEvent('eve:gemini-socket-ready', function () {
            return !!window.__GEMINI_SOCKET_READY
                && typeof window.SocketConnectionCore?.connect === 'function'
                && !!window.SocketConnectionCore?.EventHandlers;
        }, 15000);

        if (!socketReady) {
            state.connectionPhase = 'socket-timeout';
            state.message = 'Gemini server is online, but the socket client did not finish loading yet.';
            publish();
            return false;
        }

        state.connectionPhase = 'ready';
        publish();
        return !!window.__GEMINI_WORKSPACE_READY && !!window.__GEMINI_SOCKET_READY;
    }

    function disconnectClient() {
        if (window.webSocket && window.webSocket.readyState < WebSocket.CLOSING) {
            try {
                window.webSocket.close(1000, 'Gemini server stopped from EveOS');
            } catch (error) {
                // The server process shutdown will close any remaining connection.
            }
        }
        if (typeof window.updateConnectionStatus === 'function') {
            window.updateConnectionStatus('disconnected', 'Gemini Server Offline');
        }
    }

    async function recoverServerIfNeeded(reason) {
        if (!state.desiredRunning || state.running || state.busy || recoveryPromise) return false;
        if (!state.controllerAvailable || !state.baseUrl) return false;
        const now = Date.now();
        if (now - (state.lastRecoveryAttemptAt || 0) < RECOVERY_MIN_INTERVAL_MS) return false;

        state.lastRecoveryAttemptAt = now;
        state.recoveryAttempts += 1;
        state.serverState = 'recovering';
        state.connectionPhase = 'recovering';
        state.message = `Gemini connection dropped; recovery attempt ${state.recoveryAttempts} is starting.`;
        setConnectionPreference(true);
        publish();

        recoveryPromise = (async function () {
            try {
                await syncCredentials({ force: true });
                const payload = await window.GeminiServerNetwork.fetchJson(`${state.baseUrl}/api/gemini-server/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: reason || 'auto-recovery' })
                }, 5000);

                state.running = !!payload.running;
                state.serverState = payload.state || (state.running ? 'running' : 'recovering');
                state.message = payload.message || state.message;

                if (!state.running && state.serverState !== 'error') {
                    await window.GeminiServerNetwork.waitForServerReady({
                        timeoutMs: 45000,
                        refreshStatus,
                        isRunning: function () { return state.running; },
                        isError: function () { return state.serverState === 'error'; },
                        onEarlyExit: function () {
                            state.serverState = 'recovering';
                            state.connectionPhase = 'recovering';
                            state.message = 'Gemini server exited during recovery. EveOS will retry.';
                            publish();
                        }
                    });
                }

                if (state.running) {
                    state.lastKnownRunningAt = Date.now();
                    state.statusFailureCount = 0;
                    state.recoveryAttempts = 0;
                    connectWhenWorkspaceReady(bootWorkspaceForConnection());
                    return true;
                }
            } catch (error) {
                state.serverState = 'recovering';
                state.connectionPhase = 'recovering';
                state.message = `Gemini recovery is still retrying: ${error?.message || 'status unavailable'}`;
                console.warn('[GeminiServerControl] Auto-recovery failed:', error);
            } finally {
                recoveryPromise = null;
                publish();
            }
            return false;
        })();

        return recoveryPromise;
    }

    async function refreshStatus() {
        state.desiredRunning = readDesiredServerState();
        const found = await findController();
        if (found) {
            state.controllerAvailable = true;
            state.running = !!found.payload.running;
            state.serverState = found.payload.state || (state.running ? 'running' : 'stopped');
            state.message = found.payload.message || `Gemini server is ${state.serverState}.`;
            state.statusFailureCount = 0;
            if (state.running) {
                state.lastKnownRunningAt = Date.now();
                state.recoveryAttempts = 0;
                if (isConnectionPreferenceEnabled()) setDesiredServerState(true);
            } else if (state.desiredRunning && state.serverState !== 'starting' && state.serverState !== 'recovering') {
                state.serverState = 'recovering';
                state.message = 'Gemini should be running; EveOS is restarting it.';
            }
        } else {
            state.controllerAvailable = false;
            state.running = await checkDirectServerStatus();
            state.statusFailureCount += 1;
            if (state.running) {
                state.serverState = 'running';
                state.lastKnownRunningAt = Date.now();
                state.statusFailureCount = 0;
                if (isConnectionPreferenceEnabled()) setDesiredServerState(true);
                state.message = 'Gemini is online; lifecycle controller is unavailable.';
            } else if (state.desiredRunning && Date.now() - (state.lastKnownRunningAt || 0) < STATUS_GRACE_MS) {
                state.serverState = 'reconnecting';
                state.message = 'Gemini status check missed; keeping reconnect active.';
            } else {
                state.serverState = state.desiredRunning ? 'recovering' : 'stopped';
                state.message = state.desiredRunning
                    ? 'Gemini should be running, but the lifecycle controller is unavailable.'
                    : 'Gemini is offline. Start server\\start-gemini-control.bat or an EveOS local preview port to enable in-page startup from file://.';
            }
        }
        if (state.running && shouldAutoRecoverDisabledConnection() && !isConnectionPreferenceEnabled()) {
            setConnectionPreference(true);
        }
        publish();
        reconcileClientConnection();
        if (state.desiredRunning && !state.running && state.controllerAvailable) {
            recoverServerIfNeeded('status-refresh');
        }
        return { ...state };
    }

    async function toggleServer() {
        const shouldStart = !(state.running || state.desiredRunning || state.serverState === 'recovering');
        if (state.busy) return;
        if (!shouldStart && !state.controllerAvailable) {
            setDesiredServerState(false);
            setConnectionPreference(false);
            disconnectClient();
            state.running = false;
            state.serverState = 'stopped';
            state.message = 'Gemini auto-recovery stopped for this browser.';
            publish();
            return;
        }
        if (!state.controllerAvailable || !state.baseUrl) return;
        state.busy = true;
        state.serverState = shouldStart ? 'starting' : 'stopping';
        state.message = shouldStart ? 'Starting Gemini server...' : 'Stopping Gemini server...';
        setDesiredServerState(shouldStart);
        publish();
        let workspacePromise = null;

        try {
            workspacePromise = shouldStart
                ? (setConnectionPreference(true), bootWorkspaceForConnection())
                : null;
            if (shouldStart) {
                await syncCredentials({ force: true });
            }
            const payload = await window.GeminiServerNetwork.fetchJson(`${state.baseUrl}/api/gemini-server/${shouldStart ? 'start' : 'stop'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            }, 5000);
            state.running = !!payload.running;
            state.serverState = payload.state || (state.running ? 'running' : 'stopped');
            state.message = payload.message || state.message;

            if (shouldStart && !state.running && state.serverState !== 'error') {
                await window.GeminiServerNetwork.waitForServerReady({
                    timeoutMs: 45000,
                    refreshStatus,
                    isRunning: function () { return state.running; },
                    isError: function () { return state.serverState === 'error'; },
                    onEarlyExit: function () {
                        state.serverState = 'error';
                        state.message = 'Gemini server exited before becoming ready.';
                        state.connectionPhase = 'error';
                        publish();
                    }
                });
            }
            if (shouldStart && state.running) {
                connectWhenWorkspaceReady(workspacePromise);
            } else if (!shouldStart) {
                setDesiredServerState(false);
                setConnectionPreference(false);
                disconnectClient();
            }
        } catch (error) {
            state.serverState = 'error';
            state.message = error.message || 'Gemini server control failed.';
            state.connectionPhase = 'error';
            if (!shouldStart) setDesiredServerState(false);
            console.warn('[GeminiServerControl] Lifecycle action failed:', error);
        } finally {
            state.busy = false;
            await refreshStatus();
            if (shouldStart && state.running
                && state.connectionPhase !== 'requested'
                && state.connectionPhase !== 'requesting') {
                connectWhenWorkspaceReady(workspacePromise);
            }
        }
    }

    function bindControls(root) {
        (root || document).querySelectorAll('[data-gemini-server-toggle]').forEach(function (button) {
            if (button.dataset.geminiServerBound === '1') return;
            button.dataset.geminiServerBound = '1';
            button.addEventListener('click', toggleServer);
        });
        publish();
    }

    function initialize() {
        state.desiredRunning = readDesiredServerState();
        bindControls(document);
        const observer = new MutationObserver(function (records) {
            if (records.some(function (record) {
                return Array.from(record.addedNodes).some(function (node) {
                    return node.nodeType === 1 && (
                        node.matches?.('[data-gemini-server-control]')
                        || node.querySelector?.('[data-gemini-server-control]')
                    );
                });
            })) {
                bindControls(document);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        refreshStatus();
        syncCredentials();
        window.setInterval(function () {
            if (document.visibilityState === 'visible' && document.getElementById('gemini-ui-root')) {
                refreshStatus();
            }
        }, POLL_MS);
        window.addEventListener('eve:gemini-workspace-ready', reconcileClientConnection);
        window.addEventListener('eve:gemini-socket-ready', reconcileClientConnection);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') refreshStatus();
        });
    }

    window.GeminiServerControl = {
        getState: function () { return { ...state }; },
        refreshStatus,
        syncCredentials,
        reconcileClientConnection,
        toggleServer,
        start: async function () {
            if (state.running) return { ...state };
            await toggleServer();
            return { ...state };
        },
        stop: async function () {
            if (!state.running) return { ...state };
            await toggleServer();
            return { ...state };
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
