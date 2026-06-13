(function () {
    'use strict';

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

    async function waitForServerReady(options) {
        const deadline = Date.now() + (options.timeoutMs || 15000);
        const graceDeadline = Date.now() + 2500;
        let stoppedPolls = 0;
        while (Date.now() < deadline) {
            await new Promise(function (resolve) {
                window.setTimeout(resolve, 450);
            });
            const snapshot = await options.refreshStatus();
            if (options.isRunning() || options.isError()) break;
            if (Date.now() >= graceDeadline && snapshot.serverState === 'stopped') {
                stoppedPolls += 1;
                if (stoppedPolls >= 2) {
                    options.onEarlyExit();
                    break;
                }
            } else {
                stoppedPolls = 0;
            }
        }
        return options.isRunning();
    }

    window.GeminiServerNetwork = {
        fetchJson,
        localCandidateBases,
        waitForServerReady
    };
})();
