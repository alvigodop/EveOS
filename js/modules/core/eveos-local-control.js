(function () {
    'use strict';

    if (window.EveOSLocalControl) return;

    const DEFAULT_PORT = 9082;
    const HEALTH_PATH = '/api/control-plane/health';
    const STATUS_PATH = '/api/control-plane/status';
    const PROTOCOL_URL = 'eveos-control://start';
    let ensurePromise = null;
    let bootstrapAttemptedAt = 0;
    // Set by requestLaunch() and CONSUMED by the ensure() that follows it, so one button press
    // produces exactly one Windows prompt. Deliberately a one-shot flag rather than a time window:
    // a window would also swallow the user's second click when the first attempt failed.
    let launchAlreadyRequested = false;

    function port() {
        return Number(
            window.config?.bridges?.localControlPort
            || window.config?.bridges?.geminiControlPort
        ) || DEFAULT_PORT;
    }

    function baseUrl() {
        return `http://127.0.0.1:${port()}`;
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
            if (!response.ok) {
                throw new Error(payload.message || `Request failed (${response.status})`);
            }
            return payload;
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function status(timeoutMs) {
        const payload = await fetchJson(`${baseUrl()}${STATUS_PATH}`, null, timeoutMs || 4000);
        if (payload?.service !== 'eveos-control-plane' || payload?.controllerAvailable !== true) {
            throw new Error('A different service is using the EveOS control port.');
        }
        return {
            ...payload,
            baseUrl: baseUrl()
        };
    }

    async function health(timeoutMs) {
        const payload = await fetchJson(`${baseUrl()}${HEALTH_PATH}`, null, timeoutMs || 1000);
        if (payload?.service !== 'eveos-control-plane' || payload?.controllerAvailable !== true) {
            throw new Error('A different service is using the EveOS control port.');
        }
        return payload;
    }

    function invokeProtocol() {
        bootstrapAttemptedAt = Date.now();
        const anchor = document.createElement('a');
        anchor.href = PROTOCOL_URL;
        anchor.hidden = true;
        anchor.setAttribute('aria-hidden', 'true');
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => anchor.remove(), 1000);
    }

    // Hand the scheme to Windows STRAIGHT from the click handler, before anything is awaited.
    // Browsers only pass a custom scheme to the OS while the page still holds transient user
    // activation from an unambiguous action on the top-level page, and they deliberately give no
    // error when they decline. ensure() used to await a health() probe first, so the launch was
    // attempted with the gesture already spent — the request was dropped in silence and the UI just
    // span for 45 seconds, which is exactly "the setup doesn't go all the way through".
    function requestLaunch() {
        launchAlreadyRequested = true;
        invokeProtocol();
    }

    async function waitUntilReady(timeoutMs, onProgress) {
        const deadline = Date.now() + (timeoutMs || 45000);
        let lastError = null;
        while (Date.now() < deadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            try {
                await health(1000);
                const snapshot = await status(5000);
                onProgress?.(snapshot);
                return snapshot;
            } catch (error) {
                lastError = error;
                onProgress?.(null);
            }
        }
        throw new Error(
            lastError?.message
            || 'EveOS local control did not become ready.'
        );
    }

    async function ensure(options) {
        try {
            await health(options?.probeTimeoutMs || 1000);
            return await status(options?.statusTimeoutMs || 5000);
        } catch (error) {
            // The fixed Windows URI launcher is the file-mode cold-start path.
        }

        if (!ensurePromise) {
            ensurePromise = (async function () {
                options?.onLaunching?.();
                // Don't fire a second time when the click handler already asked: that would put a
                // duplicate Windows permission prompt in front of the user for one button press.
                if (launchAlreadyRequested) launchAlreadyRequested = false;
                else invokeProtocol();
                try {
                    return await waitUntilReady(options?.timeoutMs, options?.onProgress);
                } catch (error) {
                    throw new Error(
                        'Windows did not start EveOS local control. If the browser asked permission '
                        + 'to open "EveOS Local Control", choose Open (tick "Always allow" to skip it '
                        + 'next time). If no prompt appeared, the browser declined the launch — run '
                        + 'tools\\batch\\start-eveos-control.bat once and this page will connect.'
                    );
                }
            })().finally(function () {
                ensurePromise = null;
            });
        }
        return ensurePromise;
    }

    window.EveOSLocalControl = Object.freeze({
        port,
        baseUrl,
        fetchJson,
        health,
        status,
        ensure,
        requestLaunch,
        getBootstrapAttemptedAt: () => bootstrapAttemptedAt
    });
})();
