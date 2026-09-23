// Detached Matrix window background-lock and immersive-fullscreen control.
(function () {
    'use strict';

    const PREF_KEY = 'eveMatrixDetachedBackgroundLock';
    const TITLE_PREFIX = 'Matrix Code Rain v2.0 · EveOS Detached · ';
    const params = new URLSearchParams(window.location.search);
    const detached = params.get('eveMatrixDetached') === '1';
    const token = String(params.get('eveMatrixWindowToken') || '').trim();
    const controlPort = Number(params.get('eveMatrixControlPort') || 0);
    let actualLocked = false;
    let taskbarAutoHideActive = false;
    let requestSerial = 0;
    let taskbarRequestSerial = 0;
    let taskbarRequest = Promise.resolve();

    function readPreference() {
        try { return localStorage.getItem(PREF_KEY) === '1'; }
        catch (error) { return false; }
    }

    function writePreference(enabled) {
        try { localStorage.setItem(PREF_KEY, enabled ? '1' : '0'); }
        catch (error) {}
    }

    function statusNode() {
        return document.getElementById('matrixWindowModeStatus');
    }

    function setStatus(message, isError = false) {
        const node = statusNode();
        if (!node) return;
        node.textContent = String(message || '');
        node.classList.toggle('is-error', !!isError);
    }

    function normalizeControlBase(value) {
        try {
            const url = new URL(String(value || ''));
            const port = Number(url.port || 0);
            if (
                url.protocol === 'http:'
                && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
                && Number.isInteger(port)
                && port >= 1
                && port <= 65535
            ) {
                return `http://127.0.0.1:${port}`;
            }
        } catch (error) {}
        return '';
    }

    function getControlBase() {
        try {
            const openerBase = normalizeControlBase(window.opener?.EveOSLocalControl?.baseUrl?.());
            if (openerBase) return openerBase;
        } catch (error) {}
        const resolvedPort = Number(
            controlPort
            || window.EveOSPortRegistry?.get?.('GEMINI_CONTROL_PORT', 0)
            || 0
        );
        return Number.isInteger(resolvedPort) && resolvedPort >= 1 && resolvedPort <= 65535
            ? `http://127.0.0.1:${resolvedPort}`
            : '';
    }

    async function postWindowControl(action, enabled, options = {}) {
        const base = getControlBase();
        if (!base) throw new Error('EveOS Local Control is unavailable');
        const response = await fetch(`${base}/api/matrix-window/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'EveOS' },
            body: JSON.stringify({ token, action, enabled: !!enabled }),
            cache: 'no-store',
            keepalive: options.keepalive === true
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true) {
            throw new Error(payload?.message || `Local Control request failed (${response.status})`);
        }
        return payload;
    }

    async function setBackgroundLock(enabled, options = {}) {
        const wanted = !!enabled;
        if (options.persist !== false) writePreference(wanted);

        const checkbox = document.getElementById('matrixBackgroundLockCheckbox');
        if (checkbox) checkbox.checked = wanted;

        if (!detached) {
            actualLocked = false;
            setStatus(wanted
                ? 'Background lock saved · it will apply when Matrix is detached.'
                : 'Background lock is off.');
            return { ok: true, deferred: true, backgroundLocked: false };
        }

        if (!token) {
            if (checkbox) checkbox.checked = false;
            setStatus('Detached Matrix token is missing; background lock cannot be applied.', true);
            return { ok: false, backgroundLocked: false };
        }

        if (options.apply === false) {
            setStatus(wanted ? 'Background lock saved.' : 'Background lock is off.');
            return { ok: true, deferred: true, backgroundLocked: actualLocked };
        }

        const serial = ++requestSerial;
        setStatus(wanted ? 'Locking Matrix behind other windows…' : 'Unlocking Matrix foreground behavior…');
        try {
            const payload = await postWindowControl('background-lock', wanted);
            if (serial !== requestSerial) return payload;
            actualLocked = payload.backgroundLocked === true;
            if (checkbox) checkbox.checked = actualLocked;
            setStatus(actualLocked
                ? 'Background locked · Matrix is continuously pinned behind other windows.'
                : 'Background lock off · the next normal click can bring Matrix forward.');
            return payload;
        } catch (error) {
            if (serial !== requestSerial) return { ok: false, message: String(error) };
            actualLocked = false;
            if (checkbox) checkbox.checked = false;
            if (options.persist !== false) writePreference(false);
            setStatus(`Background lock unavailable: ${error?.message || error}`, true);
            return { ok: false, backgroundLocked: false, message: String(error?.message || error) };
        }
    }

    function updateFullscreenUi() {
        const active = !!document.fullscreenElement;
        const button = document.getElementById('matrixImmersiveFullscreenButton');
        if (button) button.textContent = active ? 'Exit Immersive Fullscreen' : 'Immersive Fullscreen';
        document.body.classList.toggle('matrix-immersive-fullscreen', active);
    }

    function setImmersiveStatus(message, isError = false) {
        const node = document.getElementById('matrixImmersiveStatus');
        if (!node) return;
        node.textContent = String(message || '');
        node.classList.toggle('is-error', !!isError);
    }

    async function syncImmersiveTaskbar(active) {
        if (!detached || !token) return { ok: true, deferred: true };
        const serial = ++taskbarRequestSerial;
        try {
            // Native taskbar writes must reach Local Control in transition order, not
            // response order (quick enter/exit otherwise can leave auto-hide enabled).
            taskbarRequest = taskbarRequest.catch(() => {}).then(() =>
                postWindowControl('immersive-taskbar', active));
            const payload = await taskbarRequest;
            if (serial !== taskbarRequestSerial) return payload;
            taskbarAutoHideActive = active && payload.taskbarAutoHide === true;
            setImmersiveStatus(active
                ? 'Windows taskbar auto-hide active · move pointer to the bottom edge to reveal it.'
                : 'Previous Windows taskbar behavior restored.');
            return payload;
        } catch (error) {
            if (serial !== taskbarRequestSerial) return { ok: false, message: String(error) };
            taskbarAutoHideActive = false;
            setImmersiveStatus(`Taskbar auto-hide unavailable: ${error?.message || error}`, true);
            return { ok: false, message: String(error?.message || error) };
        }
    }

    async function toggleImmersiveFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen?.();
            } else {
                try {
                    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
                } catch (firstError) {
                    await document.documentElement.requestFullscreen();
                }
            }
            updateFullscreenUi();
            return true;
        } catch (error) {
            setStatus(`Immersive fullscreen unavailable: ${error?.message || error}`, true);
            return false;
        }
    }

    function initialize() {
        document.documentElement.dataset.matrixDetached = detached ? 'true' : 'false';
        if (detached && token) document.title = TITLE_PREFIX + token;

        const checkbox = document.getElementById('matrixBackgroundLockCheckbox');
        if (checkbox) checkbox.checked = readPreference();
        updateFullscreenUi();

        // Apply both true and false on detached load so a reload cannot leave stale native styles.
        setBackgroundLock(readPreference(), { persist: false, apply: true });
    }

    document.addEventListener('fullscreenchange', () => {
        updateFullscreenUi();
        syncImmersiveTaskbar(!!document.fullscreenElement);
    });
    window.addEventListener('pagehide', () => {
        if (!taskbarAutoHideActive) return;
        postWindowControl('immersive-taskbar', false, { keepalive: true }).catch(() => {});
    });
    window.EveMatrixWindowMode = Object.freeze({
        isDetached: () => detached,
        getWindowToken: () => token,
        getControlBase,
        getBackgroundLockPreference: readPreference,
        isBackgroundLocked: () => actualLocked,
        isTaskbarAutoHideActive: () => taskbarAutoHideActive,
        setBackgroundLock,
        syncImmersiveTaskbar,
        toggleImmersiveFullscreen
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
