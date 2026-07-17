(function () {
    'use strict';

    window.MonitorChecker = window.MonitorChecker || {};

    async function fetchOk(url, timeoutMs) {
        const controller = new AbortController();
        const timer = window.setTimeout(function () { controller.abort(); }, timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal
            });
            return response.ok;
        } catch (error) {
            return false;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function checkMainServerWebSocket() {
        return new Promise(function (resolve) {
            let settled = false;
            let socket = null;
            const finish = function (value) {
                if (settled) return;
                settled = true;
                try { if (socket) socket.close(); } catch (error) {}
                resolve(value);
            };
            const timer = window.setTimeout(function () { finish(false); }, 900);
            try {
                socket = new WebSocket(window.MonitorState.WS_URL);
                socket.onopen = function () {
                    window.clearTimeout(timer);
                    finish(true);
                };
                socket.onerror = function () {
                    window.clearTimeout(timer);
                    finish(false);
                };
            } catch (error) {
                window.clearTimeout(timer);
                finish(false);
            }
        });
    }

    async function checkControlHelper() {
        const candidates = window.MonitorCommands
            ? window.MonitorCommands.candidateControlBases()
            : [window.MonitorState.CONTROL_URL];
        for (const base of candidates) {
            if (await fetchOk(base + '/api/status', window.MonitorState.REQUEST_TIMEOUT)) {
                return true;
            }
        }
        return false;
    }

    async function checkServerStatus(forceCheck) {
        const state = window.MonitorState;
        if (state.isCheckingStatus && !forceCheck) return null;
        if (!forceCheck && Date.now() - state.lastCheckTime < state.CHECK_INTERVAL) return null;
        state.isCheckingStatus = true;
        state.lastCheckTime = Date.now();
        try {
            const results = await Promise.all([
                checkControlHelper(),
                fetchOk(state.STATUS_URL, state.REQUEST_TIMEOUT),
                checkMainServerWebSocket()
            ]);
            const control = results[0];
            const gemini = results[1] || results[2];
            const isFile = window.location.protocol === 'file:';
            const web = isFile || /^https?:$/.test(window.location.protocol);
            const snapshot = {
                control,
                gemini,
                web,
                webLabel: isFile ? 'Local file mode' : (web ? 'Hosted on ' + window.location.origin : 'Unavailable')
            };
            state.serverStates.control.running = control;
            state.serverStates.gemini.running = gemini;
            state.serverStates.web.running = web;
            window.MonitorUI.renderSnapshot(snapshot);
            return snapshot;
        } finally {
            state.isCheckingStatus = false;
        }
    }

    window.MonitorChecker.checkServerStatus = checkServerStatus;
    window.MonitorChecker.checkMainServerWebSocket = checkMainServerWebSocket;
    window.checkServerStatus = function () { return checkServerStatus(true); };
})();