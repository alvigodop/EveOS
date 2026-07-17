(function () {
    'use strict';
    const runtime = window.GeminiServerControlRuntime = window.GeminiServerControlRuntime || {};
    const stateApi = runtime.stateApi;
    const connectionApi = runtime.connectionApi;
    if (!stateApi || !connectionApi) {
        console.warn('[GeminiServerControl] Runtime helpers missing; controller not initialized.');
        return;
    }
    const {
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
        shouldAutoRecoverDisabledConnection,
        syncCredentials
    } = stateApi;
    const {
        reconcileClientConnection,
        bootWorkspaceForConnection,
        connectWhenWorkspaceReady,
        disconnectClient
    } = connectionApi;
    let recoveryPromise = null;
async function recoverServerIfNeeded(reason) {
        if (isManualStopActive()) return false;
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
        if (isManualStopActive()) state.desiredRunning = false;
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
                if (isConnectionPreferenceEnabled() && !isManualStopActive()) setDesiredServerState(true);
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
                if (isConnectionPreferenceEnabled() && !isManualStopActive()) setDesiredServerState(true);
                state.message = 'Gemini is online; lifecycle controller is unavailable.';
            } else if (state.desiredRunning && Date.now() - (state.lastKnownRunningAt || 0) < STATUS_GRACE_MS) {
                state.serverState = 'reconnecting';
                state.message = 'Gemini status check missed; keeping reconnect active.';
            } else {
                state.serverState = state.desiredRunning ? 'recovering' : 'stopped';
                state.message = state.desiredRunning
                    ? 'Gemini should be running, but the lifecycle controller is unavailable.'
                    : 'Gemini is offline. Start tools\\batch\\start-gemini-control.bat or an EveOS local preview port to enable in-page startup from file://.';
            }
        }
        if (state.running && !isManualStopActive() && shouldAutoRecoverDisabledConnection() && !isConnectionPreferenceEnabled()) {
            setConnectionPreference(true);
            state.connectionPhase = 'requesting';
            state.message = 'Gemini server is online; reconnecting Live Workspace.';
            if (typeof window.updateConnectionStatus === 'function') {
                window.updateConnectionStatus('connecting', 'Gemini server online - reconnecting...');
            }
        }
        // Manual stop wins the PRESENTATION: without the lifecycle controller a Stop can only
        // disconnect this browser, so the backend may still answer status probes. Reporting that
        // as "Online" read as the assistant turning itself back on — while manually stopped the
        // pill stays "Stopped" and only a user Start (or credential save) revives it.
        if (isManualStopActive()) {
            state.desiredRunning = false;
            state.serverState = 'manual-stop';
            state.connectionPhase = 'manual-stop';
            if (state.running) {
                state.message = 'Assistant stopped by you. The Gemini backend process is still up; press Start to reconnect.';
            }
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
        if (shouldStart) setManualStop(false);
        if (!shouldStart && !state.controllerAvailable) {
            setManualStop(true);
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
        if (!shouldStart) setManualStop(true);
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
                setManualStop(true);
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
        },
        // Manually connect/disconnect THIS client's Gemini link WITHOUT stopping the server, so you
        // can cut the connection from one EveOS surface (e.g. file://) and bring it up on another
        // (e.g. localhost). The server keeps running — single-owner routing on the backend hands the
        // live link to whichever surface connects next. The manual-stop flag set here blocks
        // auto-reconnect so a manual disconnect sticks until you click connect again.
        setClientLink: function (connected) {
            if (connected) {
                setManualStop(false);
                setDesiredServerState(true);
                setConnectionPreference(true);
                reconcileClientConnection();
            } else {
                setManualStop(true);
                setDesiredServerState(false);
                setConnectionPreference(false);
                disconnectClient();
            }
            publish();
            return { ...state };
        },
        isClientLinked: function () {
            return !!(window.webSocket && window.webSocket.readyState === WebSocket.OPEN);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
