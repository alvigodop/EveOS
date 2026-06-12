(function () {
    'use strict';

    const STATUS_PATH = '/api/gemini-server/status';
    const POLL_MS = 5000;
    const state = {
        baseUrl: '',
        controllerAvailable: false,
        running: false,
        serverState: 'checking',
        busy: false,
        message: 'Checking Gemini server...',
        connectionPhase: 'idle'
    };

    function localCandidateBases() {
        const bases = [];
        if (/^https?:$/.test(window.location.protocol)
            && /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname)) {
            bases.push(window.location.origin);
        }

        const configuredPort = Number(window.config?.bridges?.serverPort) || 3000;
        [configuredPort, 8765, 3000].forEach(function (port) {
            bases.push(`http://127.0.0.1:${port}`);
        });
        return Array.from(new Set(bases));
    }

    async function fetchJson(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = window.setTimeout(function () {
            controller.abort();
        }, timeoutMs || 1200);
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                ...options,
                signal: controller.signal
            });
            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok) {
                throw new Error(payload.message || `Request failed (${response.status})`);
            }
            return payload;
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function findController() {
        if (state.baseUrl) {
            try {
                const payload = await fetchJson(`${state.baseUrl}${STATUS_PATH}`, null, 1000);
                return { baseUrl: state.baseUrl, payload };
            } catch (error) {
                state.baseUrl = '';
            }
        }

        for (const baseUrl of localCandidateBases()) {
            try {
                const payload = await fetchJson(`${baseUrl}${STATUS_PATH}`, null, 700);
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
            const payload = await fetchJson('http://127.0.0.1:9084/status', null, 700);
            return payload?.status === 'running';
        } catch (error) {
            return false;
        }
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
                : state.serverState === 'error'
                    ? 'Error'
                    : 'Offline';
        label.textContent = state.running ? 'Stop' : 'Start';
        icon.textContent = state.busy ? 'sync' : (state.running ? 'stop' : 'play_arrow');
        button.disabled = state.busy || !state.controllerAvailable;
        button.classList.toggle('is-busy', state.busy);

        const unavailable = !state.controllerAvailable
            ? 'Start EveOS through its local preview server to enable server control.'
            : '';
        control.title = unavailable || state.message;
        button.setAttribute('aria-label', state.running ? 'Stop Gemini server' : 'Start Gemini server');
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

    function connectClient() {
        state.connectionPhase = 'requesting';
        publish();
        if (typeof window.updateConnectionStatus === 'function') {
            window.updateConnectionStatus('connecting', 'Connecting to Gemini...');
        }
        let attempts = 0;
        const requestConnection = function () {
            attempts += 1;
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

        if (typeof trigger === 'function') {
            await trigger();
        }

        await waitForWindowEvent('eve:gemini-workspace-ready', function () {
            return !!window.__GEMINI_WORKSPACE_READY
                && !!document.getElementById('textInput')
                && !!document.getElementById('sendButton')
                && typeof window.sendTextMessage === 'function';
        }, 45000);

        await waitForWindowEvent('eve:gemini-socket-ready', function () {
            return !!window.__GEMINI_SOCKET_READY
                && typeof window.SocketConnectionCore?.connect === 'function'
                && !!window.SocketConnectionCore?.EventHandlers;
        }, 15000);

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

    async function refreshStatus() {
        const found = await findController();
        if (found) {
            state.controllerAvailable = true;
            state.running = !!found.payload.running;
            state.serverState = found.payload.state || (state.running ? 'running' : 'stopped');
            state.message = found.payload.message || `Gemini server is ${state.serverState}.`;
        } else {
            state.controllerAvailable = false;
            state.running = await checkDirectServerStatus();
            state.serverState = state.running ? 'running' : 'stopped';
            state.message = state.running
                ? 'Gemini is online; lifecycle controller is unavailable.'
                : 'Gemini and its local lifecycle controller are offline.';
        }
        publish();
        return { ...state };
    }

    async function waitForReady(timeoutMs) {
        const deadline = Date.now() + (timeoutMs || 15000);
        while (Date.now() < deadline) {
            await new Promise(function (resolve) {
                window.setTimeout(resolve, 450);
            });
            await refreshStatus();
            if (state.running || state.serverState === 'error') break;
        }
        return state.running;
    }

    async function toggleServer() {
        if (state.busy || !state.controllerAvailable || !state.baseUrl) return;
        const shouldStart = !state.running;
        state.busy = true;
        state.serverState = shouldStart ? 'starting' : 'stopping';
        state.message = shouldStart ? 'Starting Gemini server...' : 'Stopping Gemini server...';
        publish();

        try {
            const workspacePromise = shouldStart
                ? (setConnectionPreference(true), ensureWorkspaceReady())
                : null;
            const payload = await fetchJson(`${state.baseUrl}/api/gemini-server/${shouldStart ? 'start' : 'stop'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            }, 5000);
            state.running = !!payload.running;
            state.serverState = payload.state || (state.running ? 'running' : 'stopped');
            state.message = payload.message || state.message;

            if (shouldStart && !state.running && state.serverState !== 'error') {
                await waitForReady(45000);
            }
            if (shouldStart && state.running) {
                await workspacePromise;
                connectClient();
            } else if (!shouldStart) {
                setConnectionPreference(false);
                disconnectClient();
            }
        } catch (error) {
            if (shouldStart) setConnectionPreference(false);
            state.serverState = 'error';
            state.message = error.message || 'Gemini server control failed.';
            state.connectionPhase = 'error';
            console.warn('[GeminiServerControl] Lifecycle action failed:', error);
        } finally {
            state.busy = false;
            await refreshStatus();
            if (shouldStart && state.running
                && state.connectionPhase !== 'requested'
                && state.connectionPhase !== 'requesting') {
                await workspacePromise;
                connectClient();
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
        window.setInterval(function () {
            if (document.visibilityState === 'visible' && document.getElementById('gemini-ui-root')) {
                refreshStatus();
            }
        }, POLL_MS);
    }

    window.GeminiServerControl = {
        getState: function () { return { ...state }; },
        refreshStatus,
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
