window.EveAudioflixPiano = window.EveAudioflixPiano || {};

(function (ns) {
    'use strict';
    if (ns.ready) return;

    const state = {
        baseUrl: '', controllerAvailable: false, directAvailable: false,
        installed: true, running: false, desiredRunning: false,
        phase: 'checking', busy: false, port: 8771,
        url: 'http://127.0.0.1:8771/', appVersion: '',
        message: 'Checking Piano Auto Player...'
    };

    function serviceUrl() {
        const port = Number(window.config?.bridges?.pianoPlayerPort) || 8771;
        return `http://127.0.0.1:${port}/`;
    }

    function controllerBases() {
        const helper = window.EveOSLocalControl?.baseUrl?.();
        const port = Number(window.config?.bridges?.localControlPort
            || window.config?.bridges?.geminiControlPort) || 9082;
        const values = [helper || `http://127.0.0.1:${port}`];
        if (/^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/i.test(location.hostname)) {
            values.push(location.origin);
        }
        values.push('http://127.0.0.1:8765', 'http://127.0.0.1:3000');
        return [...new Set(values.filter(Boolean))];
    }

    async function json(url, options, timeoutMs = 1800) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
            return payload;
        } finally {
            clearTimeout(timer);
        }
    }

    function publish() {
        window.dispatchEvent(new CustomEvent('eve:audioflix-piano-status', { detail: { ...state } }));
    }

    function apply(payload, baseUrl) {
        state.baseUrl = baseUrl || state.baseUrl;
        state.controllerAvailable = true;
        state.installed = payload.installed !== false;
        state.running = payload.running === true;
        state.directAvailable = state.running;
        state.desiredRunning = payload.desiredRunning === true;
        state.phase = String(payload.state || (state.running ? 'running' : 'stopped'));
        state.port = Number(payload.port) || state.port;
        state.url = String(payload.url || state.url);
        state.appVersion = String(payload.appVersion || state.appVersion || '');
        state.message = String(payload.message || '');
    }

    async function findController() {
        for (const baseUrl of controllerBases()) {
            try {
                const payload = await json(`${baseUrl}/api/piano-player/status`, null, 2600);
                return { baseUrl, payload };
            } catch (_) {}
        }
        return null;
    }

    async function directStatus() {
        try {
            const payload = await json(`${serviceUrl()}api/status`, null, 1200);
            return payload.ok === true && payload.service === 'piano-auto-player'
                && payload.appVersion ? payload : null;
        } catch (_) {
            return null;
        }
    }

    async function refresh() {
        const [managed, direct] = await Promise.all([findController(), directStatus()]);
        if (managed) {
            apply(managed.payload, managed.baseUrl);
            if (direct) {
                state.running = state.directAvailable = true;
                state.phase = 'running';
                state.url = serviceUrl();
                state.appVersion = String(direct.appVersion);
                state.message = 'Piano Auto Player is online.';
            }
        } else if (direct) {
            Object.assign(state, {
                baseUrl: '', controllerAvailable: false, directAvailable: true,
                installed: true, running: true, phase: 'running', url: serviceUrl(),
                appVersion: String(direct.appVersion),
                message: 'Piano Auto Player is online through a standalone launcher.'
            });
        } else {
            Object.assign(state, {
                baseUrl: '', controllerAvailable: false, directAvailable: false,
                running: false, phase: 'unavailable', url: serviceUrl(),
                message: 'Piano Auto Player is stopped.'
            });
        }
        publish();
        return { ...state };
    }

    async function ensureController() {
        const found = await findController();
        if (found) return found;
        if (!window.EveOSLocalControl?.ensure) {
            throw new Error('EveOS local control is unavailable. Reload EveOS and try again.');
        }
        state.phase = 'enabling';
        state.message = 'Starting EveOS local control for Piano...';
        publish();
        const control = await window.EveOSLocalControl.ensure();
        const baseUrl = control.baseUrl || window.EveOSLocalControl.baseUrl();
        return { baseUrl, payload: await json(`${baseUrl}/api/piano-player/status`, null, 3500) };
    }

    async function setRunning(enabled) {
        if (state.busy) return { ...state };
        state.busy = true;
        state.phase = enabled ? 'starting' : 'stopping';
        state.message = `${enabled ? 'Starting' : 'Stopping'} Piano Auto Player...`;
        publish();
        try {
            const managed = await ensureController();
            const payload = await json(
                `${managed.baseUrl}/api/piano-player/${enabled ? 'start' : 'stop'}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
                10000
            );
            apply(payload, managed.baseUrl);
            publish();
            return { ...state };
        } catch (error) {
            state.phase = 'error';
            state.message = error?.message || 'Piano lifecycle request failed.';
            publish();
            return { ...state };
        } finally {
            state.busy = false;
            publish();
        }
    }

    Object.assign(ns, {
        ready: true, state, serviceUrl, refresh,
        start: () => setRunning(true), stop: () => setRunning(false)
    });
})(window.EveAudioflixPiano);
