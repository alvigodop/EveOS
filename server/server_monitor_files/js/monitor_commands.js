(function () {
    'use strict';

    function candidateControlBases() {
        const bases = [window.MonitorState.CONTROL_URL];
        if (/^https?:$/.test(window.location.protocol)
            && /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname)) {
            bases.unshift(window.location.origin);
        }
        bases.push('http://127.0.0.1:8765', 'http://127.0.0.1:3000');
        return Array.from(new Set(bases));
    }

    async function postJson(url) {
        const controller = new AbortController();
        const timer = window.setTimeout(function () {
            controller.abort();
        }, 2500);
        try {
            const response = await fetch(url, {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            const payload = await response.json().catch(function () { return {}; });
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.message || 'Request failed (' + response.status + ')');
            }
            return payload;
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function controlGemini(action) {
        let lastError = null;
        for (const base of candidateControlBases()) {
            try {
                return await postJson(base + '/api/gemini-server/' + action);
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('No local Gemini controller is available.');
    }

    async function runAction(action, button) {
        const ui = window.MonitorUI;
        ui.setBusy(button, true);
        ui.displayMessage('Requesting Gemini ' + action + '...');
        try {
            if (action === 'restart') {
                await controlGemini('stop').catch(function () {});
                await new Promise(function (resolve) { window.setTimeout(resolve, 700); });
                window.MonitorState.userRequestedStop = false;
                await controlGemini('start');
            } else {
                window.MonitorState.userRequestedStop = action === 'stop';
                await controlGemini(action);
            }
            await new Promise(function (resolve) { window.setTimeout(resolve, 600); });
            await window.MonitorChecker.checkServerStatus(true);
            ui.displayMessage('Gemini ' + action + ' request completed.');
        } catch (error) {
            ui.displayMessage('Gemini ' + action + ' failed: ' + error.message, true);
        } finally {
            ui.setBusy(button, false);
        }
    }

    window.MonitorCommands = {
        startGemini: function (button) { return runAction('start', button); },
        stopGemini: function (button) { return runAction('stop', button); },
        restartGemini: function (button) { return runAction('restart', button); },
        toggleGemini: function (button) {
            return window.MonitorState.serverStates.gemini.running
                ? this.stopGemini(button)
                : this.startGemini(button);
        },
        openEveOS: function () {
            window.open(window.MonitorState.EVEOS_URL, '_blank', 'noopener');
        },
        candidateControlBases
    };
})();