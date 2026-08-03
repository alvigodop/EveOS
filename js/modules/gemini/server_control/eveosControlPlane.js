(function () {
    'use strict';

    if (window.EveOSControlPlane) return;

    const STATUS_PATH = '/api/control-plane/status';
    const WEB_STATUS_URL = 'http://127.0.0.1:8765/api/status';
    const DEFAULT_WEB_URL = 'http://127.0.0.1:8765/EveOS.html';
    const POLL_MS = 5000;
    const state = {
        helperBaseUrl: '',
        controllerAvailable: false,
        webRunning: false,
        desiredRunning: false,
        serverState: 'checking',
        busy: false,
        message: 'Checking EveOS local control...',
        webUrl: DEFAULT_WEB_URL
    };

    let pollTimer = 0;
    function helperBaseUrl() {
        return window.EveOSLocalControl?.baseUrl()
            || `http://127.0.0.1:${
                Number(
                    window.config?.bridges?.localControlPort
                    || window.config?.bridges?.geminiControlPort
                ) || 9082
            }`;
    }

    async function fetchJson(url, options, timeoutMs) {
        const networkFetch = window.GeminiServerNetwork?.fetchJson;
        if (networkFetch) return networkFetch(url, options, timeoutMs);

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs || 1200);
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                ...options,
                signal: controller.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
            return payload;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function applyWebStatus(payload) {
        state.webRunning = payload?.running === true;
        state.desiredRunning = payload?.desiredRunning === true;
        state.serverState = String(payload?.state || (state.webRunning ? 'running' : 'stopped'));
        state.webUrl = String(payload?.url || DEFAULT_WEB_URL);
        state.message = String(payload?.message || '');
    }

    function publish() {
        document.querySelectorAll('[data-eveos-control-plane]').forEach(renderControl);
        window.dispatchEvent(new CustomEvent('eve:eveos-control-plane-status', {
            detail: { ...state }
        }));
    }

    function statusLabel() {
        if (state.webRunning) return 'Online';
        if (state.serverState === 'starting') return 'Starting';
        if (state.serverState === 'stopping') return 'Stopping';
        if (state.serverState === 'enabling') return 'Enabling';
        if (state.serverState === 'blocked') return 'Port Blocked';
        if (state.serverState === 'error') return 'Error';
        if (state.controllerAvailable) return 'Localhost Off';
        return 'Setup';
    }

    function renderControl(control) {
        const status = control.querySelector('[data-eveos-control-status]');
        const button = control.querySelector('[data-eveos-control-toggle]');
        const label = button?.querySelector('[data-eveos-control-action-label]');
        const icon = button?.querySelector('.material-icons');
        const openButton = control.parentElement?.querySelector('[data-eveos-control-open]');
        if (!status || !button || !label || !icon) return;

        control.dataset.state = state.serverState;
        const nextStatus = statusLabel();
        const nextLabel = state.webRunning ? 'Stop' : (state.controllerAvailable ? 'Start' : 'Enable');
        const nextIcon = state.busy
            ? 'sync'
            : (state.webRunning ? 'stop' : (state.controllerAvailable ? 'play_arrow' : 'power_settings_new'));
        if (status.textContent !== nextStatus) status.textContent = nextStatus;
        if (label.textContent !== nextLabel) label.textContent = nextLabel;
        if (icon.textContent !== nextIcon) icon.textContent = nextIcon;
        button.disabled = state.busy;
        button.classList.toggle('is-busy', state.busy);
        button.setAttribute(
            'aria-label',
            state.webRunning ? 'Stop EveOS localhost' : 'Start EveOS localhost'
        );
        control.title = state.message;
        if (openButton) {
            openButton.hidden = !state.webRunning;
            openButton.title = `Open ${state.webUrl}`;
        }
    }

    async function checkDirectWeb() {
        try {
            const payload = await fetchJson(WEB_STATUS_URL, null, 900);
            return payload?.ok === true && payload?.service === 'eveos-local-server';
        } catch (error) {
            return false;
        }
    }

    async function refreshStatus() {
        const baseUrl = helperBaseUrl();
        try {
            const payload = await fetchJson(`${baseUrl}${STATUS_PATH}`, null, 5000);
            if (payload?.service !== 'eveos-control-plane' || payload?.controllerAvailable !== true) {
                throw new Error('A different service is using the EveOS control port.');
            }
            state.helperBaseUrl = baseUrl;
            state.controllerAvailable = true;
            applyWebStatus(payload.web || {});
        } catch (error) {
            state.helperBaseUrl = '';
            state.controllerAvailable = false;
            const directRunning = await checkDirectWeb();
            state.webRunning = directRunning;
            state.desiredRunning = directRunning;
            state.serverState = directRunning ? 'running' : 'unavailable';
            state.webUrl = DEFAULT_WEB_URL;
            state.message = directRunning
                ? 'EveOS localhost is online. Enable local control to stop or manage it.'
                : 'Enable the one-time EveOS local control bridge to start localhost from this page.';
        }
        publish();
        return { ...state };
    }

    async function ensureController() {
        if (state.controllerAvailable) return true;
        state.busy = true;
        state.serverState = 'enabling';
        state.message = 'Waiting for Windows to start EveOS local control...';
        publish();
        try {
            const snapshot = await window.EveOSLocalControl.ensure({
                onProgress: () => refreshStatus()
            });
            state.helperBaseUrl = snapshot.baseUrl || helperBaseUrl();
            state.controllerAvailable = true;
            applyWebStatus(snapshot.web || {});
            return true;
        } catch (error) {
            state.serverState = 'error';
            state.message = error?.message || 'EveOS local control did not start.';
            return false;
        } finally {
            state.busy = false;
            publish();
        }
    }

    async function waitForWeb(expectedRunning) {
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 400));
            const snapshot = await refreshStatus();
            if (snapshot.webRunning === expectedRunning) return snapshot;
            if (['error', 'blocked'].includes(snapshot.serverState)) return snapshot;
        }
        return { ...state };
    }

    async function setRunning(enabled) {
        if (state.busy) return { ...state };
        if (!state.controllerAvailable && !(await ensureController())) return { ...state };

        state.busy = true;
        state.serverState = enabled ? 'starting' : 'stopping';
        state.message = enabled ? 'Starting EveOS localhost...' : 'Stopping EveOS localhost...';
        publish();
        try {
            const payload = await fetchJson(
                `${state.helperBaseUrl}/api/eveos-server/${enabled ? 'start' : 'stop'}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                },
                7000
            );
            applyWebStatus(payload);
            if (state.webRunning !== enabled && !['error', 'blocked'].includes(state.serverState)) {
                return await waitForWeb(enabled);
            }
            return { ...state };
        } catch (error) {
            state.serverState = 'error';
            state.message = error?.message || 'EveOS localhost lifecycle request failed.';
            return { ...state };
        } finally {
            state.busy = false;
            publish();
        }
    }

    function bind(root) {
        (root || document).querySelectorAll('[data-eveos-control-toggle]').forEach(function (button) {
            if (button.dataset.eveosControlBound === '1') return;
            button.dataset.eveosControlBound = '1';
            button.addEventListener('click', async function () {
                await setRunning(!state.webRunning);
            });
        });
        (root || document).querySelectorAll('[data-eveos-control-open]').forEach(function (button) {
            if (button.dataset.eveosControlBound === '1') return;
            button.dataset.eveosControlBound = '1';
            button.addEventListener('click', function () {
                window.open(state.webUrl || DEFAULT_WEB_URL, '_blank', 'noopener');
            });
        });
        publish();
    }

    function initialize() {
        bind(document);
        refreshStatus();
        const observer = new MutationObserver(function (records) {
            const controlAdded = records.some(function (record) {
                return Array.from(record.addedNodes || []).some(function (node) {
                    if (!(node instanceof Element)) return false;
                    return node.matches?.('[data-eveos-control-toggle], [data-eveos-control-open]')
                        || Boolean(node.querySelector?.('[data-eveos-control-toggle], [data-eveos-control-open]'));
                });
            });
            if (controlAdded) bind(document);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        pollTimer = window.setInterval(function () {
            if (document.visibilityState === 'visible' && document.getElementById('gemini-ui-root')) {
                refreshStatus();
            }
        }, POLL_MS);
    }

    window.EveOSControlPlane = Object.freeze({
        getState: () => ({
            ...state,
            bootstrapAttemptedAt: window.EveOSLocalControl?.getBootstrapAttemptedAt?.() || 0
        }),
        ensureController,
        refreshStatus,
        start: () => setRunning(true),
        stop: () => setRunning(false),
        toggle: () => setRunning(!state.webRunning)
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
