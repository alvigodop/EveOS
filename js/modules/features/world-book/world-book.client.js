window.EveWorldBook = window.EveWorldBook || {};

(function (ns) {
    'use strict';

    const STATUS_PATH = '/api/world-book/status';
    const state = {
        baseUrl: '',
        controllerAvailable: false,
        installed: true,
        running: false,
        desiredRunning: false,
        serverState: 'checking',
        busy: false,
        url: 'http://127.0.0.1:8766/',
        message: 'Checking World Book...'
    };

    function candidateBases() {
        const bases = [];
        if (/^https?:$/.test(window.location.protocol)
            && /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname)) {
            bases.push(window.location.origin);
        }
        const configured = Number(window.config?.bridges?.serverPort) || 8765;
        [8765, configured, 3000].forEach(function (port) {
            bases.push(`http://127.0.0.1:${port}`);
        });
        return Array.from(new Set(bases));
    }

    async function fetchJson(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = window.setTimeout(function () {
            controller.abort();
        }, timeoutMs || 1400);
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

    function applyStatus(payload, baseUrl) {
        state.baseUrl = baseUrl || state.baseUrl;
        state.controllerAvailable = true;
        state.installed = payload.installed !== false;
        state.running = payload.running === true;
        state.desiredRunning = payload.desiredRunning === true;
        state.serverState = String(payload.state || (state.running ? 'running' : 'stopped'));
        state.url = String(payload.url || state.url);
        state.message = String(payload.message || '');
        publish();
        return { ...state };
    }

    function publish() {
        window.dispatchEvent(new CustomEvent('eve:world-book-status', {
            detail: { ...state }
        }));
    }

    async function findController() {
        const bases = state.baseUrl
            ? [state.baseUrl, ...candidateBases().filter((base) => base !== state.baseUrl)]
            : candidateBases();
        for (const baseUrl of bases) {
            try {
                const timeout = baseUrl === window.location.origin ? 2800 : 1000;
                const payload = await fetchJson(`${baseUrl}${STATUS_PATH}`, null, timeout);
                return { baseUrl, payload };
            } catch (error) {
                // Try the next local EveOS server.
            }
        }
        return null;
    }

    async function refresh() {
        const found = await findController();
        if (found) return applyStatus(found.payload, found.baseUrl);
        state.baseUrl = '';
        state.controllerAvailable = false;
        state.running = false;
        state.serverState = 'unavailable';
        state.message = 'Start EveOS localhost to control World Book from this page.';
        publish();
        return { ...state };
    }

    async function waitFor(expectedRunning) {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            const snapshot = await refresh();
            if (snapshot.running === expectedRunning) return snapshot;
            if (snapshot.serverState === 'error' || snapshot.serverState === 'blocked') return snapshot;
        }
        return { ...state };
    }

    async function setRunning(enabled) {
        if (state.busy) return { ...state };
        state.busy = true;
        state.serverState = enabled ? 'starting' : 'stopping';
        state.message = enabled ? 'Starting World Book...' : 'Stopping World Book...';
        publish();
        try {
            const found = state.baseUrl ? { baseUrl: state.baseUrl } : await findController();
            if (!found?.baseUrl) throw new Error('EveOS localhost controller is unavailable.');
            const payload = await fetchJson(
                `${found.baseUrl}/api/world-book/${enabled ? 'start' : 'stop'}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
                5000
            );
            applyStatus(payload, found.baseUrl);
            if (state.running !== enabled && !['error', 'blocked'].includes(state.serverState)) {
                return await waitFor(enabled);
            }
            return { ...state };
        } catch (error) {
            state.serverState = 'error';
            state.message = error?.message || 'World Book lifecycle request failed.';
            publish();
            return { ...state };
        } finally {
            state.busy = false;
            publish();
        }
    }

    ns.client = Object.freeze({
        state,
        refresh,
        start: () => setRunning(true),
        stop: () => setRunning(false)
    });
})(window.EveWorldBook);
