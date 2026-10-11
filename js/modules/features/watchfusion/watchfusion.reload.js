window.EveWatchFusionReload = window.EveWatchFusionReload || {};
(function () {
    'use strict';

    const ns = window.EveWatchFusionReload;
    if (ns.ready) return;

    const CONFIRM_MS = 8000;
    let busy = false;

    function api() {
        return window.EveWatchFusion;
    }

    function message(text) {
        const node = document.querySelector('#watchfusion-overlay [data-wf-message]');
        if (node) node.textContent = String(text || '');
    }

    function reset(button) {
        if (!button?.isConnected || button.dataset.confirmWatchFusionRestart !== 'true') return;
        delete button.dataset.confirmWatchFusionRestart;
        button.textContent = 'Restart';
        button.setAttribute('aria-label', 'Restart WatchFusion');
    }

    async function restart(button) {
        const state = api()?.getState?.() || {};
        if (busy || state.running !== true) return;
        if (button.dataset.confirmWatchFusionRestart !== 'true') {
            button.dataset.confirmWatchFusionRestart = 'true';
            button.textContent = 'Confirm restart';
            button.setAttribute('aria-label', 'Confirm restart WatchFusion');
            message('Restart WatchFusion? This interrupts WatchFusion only; unrelated EveOS services stay running.');
            window.setTimeout(() => reset(button), CONFIRM_MS);
            return;
        }

        delete button.dataset.confirmWatchFusionRestart;
        busy = true;
        button.disabled = true;
        button.textContent = 'Restarting…';
        message('WatchFusion: stopping → starting → verifying…');
        try {
            const reload = window.EveOSServiceReload;
            if (typeof reload?.restart !== 'function') throw new Error('Shared EveOS restart control is unavailable.');
            const result = await reload.restart('watchFusion', { port: Number(state.port || 0), timeoutS: 45 });
            if (result?.serviceRestarted !== true) {
                throw new Error(result?.message || 'WatchFusion did not verify a fresh running service.');
            }
            await api()?.refresh?.({ reloadUi: true });
            message(result.message || 'WatchFusion restarted and verified ready.');
        } catch (error) {
            message(error?.message || 'WatchFusion restart failed.');
        } finally {
            busy = false;
            if (button.isConnected) {
                button.disabled = false;
                button.textContent = 'Restart';
                button.setAttribute('aria-label', 'Restart WatchFusion');
            }
            mount();
        }
    }

    function mount() {
        const watch = api();
        const actions = document.querySelector('#watchfusion-overlay .watchfusion-head-actions');
        if (!watch?.ready || !actions) return false;
        let button = actions.querySelector('[data-wf-shared-restart]');
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.dataset.wfSharedRestart = 'true';
            button.textContent = 'Restart';
            button.setAttribute('aria-label', 'Restart WatchFusion');
            button.title = 'Restart only the running WatchFusion service through shared EveOS lifecycle control.';
            button.addEventListener('click', () => restart(button));
            const stop = actions.querySelector('[data-wf-action="stop"]');
            actions.insertBefore(button, stop || actions.lastElementChild);
        }
        button.hidden = watch.getState?.().running !== true;
        button.disabled = busy;
        return true;
    }

    function install() {
        const watch = api();
        if (!watch?.ready || watch.__eveSharedRestartWrapped) return false;
        watch.__eveSharedRestartWrapped = true;
        const originalOpen = watch.open?.bind(watch);
        const originalRefresh = watch.refresh?.bind(watch);
        if (originalOpen) {
            watch.open = async (...args) => {
                const result = await originalOpen(...args);
                mount();
                return result;
            };
        }
        if (originalRefresh) {
            watch.refresh = async (...args) => {
                const result = await originalRefresh(...args);
                mount();
                return result;
            };
        }
        document.addEventListener('click', (event) => {
            if (!event.target?.closest?.('#watchfusion-overlay [data-wf-action="start"], #watchfusion-overlay [data-wf-action="stop"]')) return;
            window.setTimeout(mount, 500);
        });
        mount();
        return true;
    }

    ns.ready = true;
    ns.install = install;
    ns.mount = mount;
    if (!install()) window.addEventListener('load', install, { once: true });
})();
