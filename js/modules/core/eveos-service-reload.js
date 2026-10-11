/* Shared explicit lifecycle/update controls; status refresh never restarts a service. */
(function () {
    'use strict';
    if (window.EveOSServiceReload) return;
    const pending = new Map();

    async function controlRequest(path, options, timeoutMs) {
        const control = window.EveOSLocalControl;
        if (!control?.health || !control?.fetchJson) throw new Error('EveOS Local Control is unavailable.');
        await control.health(3000);
        const response = await control.fetchJson(`${control.baseUrl()}${path}`, options, timeoutMs || 30000);
        return response?.payload || response;
    }

    async function requestRestart(service, options) {
        let query = '';
        if (service === 'web' || service === 'spotifyEngine') {
            const port = Number(options?.port || window.location?.port || 0);
            if (Number.isInteger(port) && port > 0 && port <= 65535) query = `?port=${port}`;
        }
        const payload = await controlRequest(`/api/services/restart${query}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service })
        }, Math.max(20000, Number(options?.timeoutS || 90) * 1000));
        if (payload?.ok !== true) throw new Error(payload?.message || `${service} restart failed.`);
        window.dispatchEvent(new CustomEvent('eve:eveos-service-reload', { detail: payload }));
        return payload;
    }

    function singleFlight(key, operation) {
        if (pending.has(key)) return pending.get(key);
        const promise = Promise.resolve().then(operation).finally(() => pending.delete(key));
        pending.set(key, promise);
        return promise;
    }

    function restart(service, options) {
        const key = String(service || '');
        return singleFlight(`restart:${key}`, () => requestRestart(key, options));
    }

    function checkUpdates() {
        return singleFlight('updates:check', async () => {
            const payload = await controlRequest('/api/services/updates/check', { method: 'POST' }, 45000);
            if (payload?.ok !== true) throw new Error(payload?.message || 'Update check failed.');
            window.dispatchEvent(new CustomEvent('eve:eveos-update-plan', { detail: payload }));
            return payload;
        });
    }

    function markApplied(components) {
        const values = [...new Set((Array.isArray(components) ? components : [components])
            .map(value => String(value || '').trim()).filter(Boolean))];
        return singleFlight(`updates:applied:${values.sort().join(',')}`, async () => {
            const payload = await controlRequest('/api/services/updates/applied', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ components: values })
            }, 45000);
            if (payload?.ok !== true) throw new Error(payload?.message || 'Could not record applied components.');
            window.dispatchEvent(new CustomEvent('eve:eveos-update-plan', { detail: payload }));
            return payload;
        });
    }

    function isBusy(service) {
        const key = String(service || '');
        return pending.has(`restart:${key}`);
    }

    window.EveOSServiceReload = Object.freeze({
        restart,
        checkUpdates,
        markApplied,
        isBusy,
        updateCheckBusy: () => pending.has('updates:check')
    });
})();
