/* Search Monitor explicit source-update workflow. */
(function () {
    'use strict';
    if (window.EveOSSearchMonitorUpdates) return;

    const SERVICE_BY_COMPONENT = Object.freeze({
        web: 'web', gemini: 'gemini', worldBook: 'worldBook', notes: 'notes', piano: 'piano',
        watchFusion: 'watchFusion', bookmarkIntel: 'bookmarkIntel', localMoe: 'localMoe',
        nexusBrowser: 'nexusBrowser', spotifyEngine: 'spotifyEngine', localControl: 'localControl'
    });
    const STATUS_BY_COMPONENT = Object.freeze({
        web: '/api/eveos-server/status', gemini: '/api/gemini-server/status', worldBook: '/api/world-book/status',
        notes: '/api/notes-service/status', piano: '/api/piano-player/status', watchFusion: '/api/watchfusion/status',
        bookmarkIntel: '/api/bookmark-intel/status', localMoe: '/api/local-moe/status', nexusBrowser: '/api/nexus-browser/status',
        localControl: '/api/control-plane/health'
    });
    const PROVIDER_COMPONENT = Object.freeze({ gemini: 'gemini', 'local-moe': 'localMoe', 'nexus-browser': 'nexusBrowser' });
    const browserProofHosts = new WeakSet();
    let plan = null;
    let busy = false;
    let restartConfirmed = false;
    let reloadConfirmed = false;

    function control() { return window.EveOSLocalControl || null; }
    function reloadClient() { return window.EveOSServiceReload || null; }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async function request(path, options, timeoutMs = 10000) {
        const client = control();
        if (!client?.fetchJson) throw new Error('EveOS Local Control is unavailable.');
        const value = await client.fetchJson(client.baseUrl() + path, options, timeoutMs);
        return value?.payload || value;
    }

    function roots() {
        return [...document.querySelectorAll('.gemini-monitor-shell-toolbar')]
            .map(toolbar => ({ toolbar, host: toolbar.parentElement }))
            .filter(item => item.host?.querySelector?.('[data-ai-home-workspace]'));
    }

    function panelFor(host) { return host?.querySelector?.('[data-search-monitor-update-panel]') || null; }

    function makeButton(label, attr, icon) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gemini-server-inspector-toggle';
        button.setAttribute(attr, '');
        button.title = label;
        button.setAttribute('aria-label', label);
        if (icon) {
            const i = document.createElement('i');
            i.className = 'material-icons'; i.setAttribute('aria-hidden', 'true'); i.textContent = icon;
            button.appendChild(i);
        }
        const span = document.createElement('span');
        span.dataset.updateButtonLabel = '';
        span.textContent = label;
        button.appendChild(span);
        return button;
    }

    function ensureSurface(host, toolbar) {
        const actions = toolbar.querySelector('.gemini-monitor-toolbar-actions');
        const reloadPage = toolbar.querySelector('[data-search-monitor-reload-ui]');
        if (actions && !toolbar.querySelector('[data-search-monitor-check-updates]')) {
            const check = makeButton('Check updates', 'data-search-monitor-check-updates', 'system_update_alt');
            actions.insertBefore(check, reloadPage || actions.firstChild);
        }
        if (reloadPage) {
            reloadPage.title = 'Reload EveOS page';
            reloadPage.setAttribute('aria-label', 'Reload EveOS page');
            reloadPage.dataset.reloadPurpose = 'page';
        }

        const workspace = host.querySelector('[data-ai-home-workspace]');
        if (!workspace || panelFor(host)) return;
        const panel = document.createElement('section');
        panel.className = 'gemini-monitor-card';
        panel.dataset.searchMonitorUpdatePanel = '';
        panel.hidden = true;
        panel.innerHTML = `
            <div class="gemini-monitor-head">
                <div><div class="gemini-monitor-kicker">Selective updates</div><h3 class="gemini-monitor-title">Runtime reload plan</h3></div>
                <div class="gemini-monitor-pill" data-update-stage>Ready</div>
            </div>
            <div class="gemini-monitor-body">
                <p class="gemini-monitor-copy" data-update-summary>Check source changes before interrupting any EveOS component.</p>
                <div data-update-actions-list></div>
                <p class="gemini-monitor-copy" data-update-warning hidden></p>
                <div class="eveos-ai-provider-controls">
                    <button type="button" data-update-restart-selected hidden>Restart selected running services</button>
                    <button type="button" data-update-reload-page hidden>Reload EveOS page</button>
                    <button type="button" data-update-cancel-confirmation hidden>Cancel confirmation</button>
                </div>
                <p class="eveos-ai-provider-message" data-update-progress>Nothing is interrupted until you confirm an action here.</p>
            </div>`;
        const note = workspace.querySelector('.gemini-monitor-workspace-note');
        if (note?.nextSibling) workspace.insertBefore(panel, note.nextSibling);
        else workspace.prepend(panel);
    }

    function install() {
        for (const { toolbar, host } of roots()) {
            ensureSurface(host, toolbar);
            if (sessionStorage.getItem('eveos-lane4-browser-reload-pending') === '1' && !browserProofHosts.has(host)) {
                browserProofHosts.add(host);
                queueMicrotask(() => closeBrowserReloadProof(host));
            }
        }
    }

    function setStage(host, stage, progress) {
        const panel = panelFor(host); if (!panel) return;
        const stageNode = panel.querySelector('[data-update-stage]');
        const progressNode = panel.querySelector('[data-update-progress]');
        if (stageNode) stageNode.textContent = stage;
        if (progressNode && progress) progressNode.textContent = progress;
    }

    function actionLabel(item) {
        if (item.action === 'reloadPage') return `${item.label} · page reload`;
        if (item.action === 'replaceControlPlane') return `${item.label} · control-plane handoff`;
        if (item.action === 'restartSpotify') return `${item.label} · helper only`;
        if (item.action === 'reviewRequired') return `${item.label} · no automatic action`;
        return `${item.label} · service only`;
    }

    function render(host, nextPlan) {
        plan = nextPlan || plan;
        const panel = panelFor(host); if (!panel) return;
        panel.hidden = false;
        const list = panel.querySelector('[data-update-actions-list]');
        const summary = panel.querySelector('[data-update-summary]');
        const warning = panel.querySelector('[data-update-warning]');
        const restart = panel.querySelector('[data-update-restart-selected]');
        const reloadPage = panel.querySelector('[data-update-reload-page]');
        const cancel = panel.querySelector('[data-update-cancel-confirmation]');
        const actions = Array.isArray(plan?.actions) ? plan.actions : [];
        if (list) {
            list.replaceChildren();
            const ul = document.createElement('ul');
            ul.className = 'gemini-monitor-copy';
            if (!actions.length) {
                const li = document.createElement('li'); li.textContent = 'No runtime source changes detected.'; ul.appendChild(li);
            } else actions.forEach(item => {
                const li = document.createElement('li'); li.textContent = actionLabel(item); ul.appendChild(li);
            });
            list.appendChild(ul);
        }
        if (summary) summary.textContent = actions.length
            ? `${actions.length} affected component${actions.length === 1 ? '' : 's'} detected. Only running services are restarted; stopped services stay stopped.`
            : 'Current runtime source fingerprints match this Local Control baseline.';
        const restartable = actions.some(item => ['restartService', 'restartSpotify', 'replaceControlPlane'].includes(item.action));
        const browser = actions.some(item => item.action === 'reloadPage');
        const review = actions.some(item => item.action === 'reviewRequired');
        if (restart) { restart.hidden = !restartable; restart.disabled = busy; restart.textContent = restartConfirmed ? 'Confirm selected restarts' : 'Restart selected running services'; }
        if (reloadPage) { reloadPage.hidden = !browser; reloadPage.disabled = busy; reloadPage.textContent = reloadConfirmed ? 'Confirm EveOS page reload' : 'Reload EveOS page'; }
        if (cancel) cancel.hidden = !(restartConfirmed || reloadConfirmed);
        if (warning) {
            warning.hidden = !(restartConfirmed || reloadConfirmed || review);
            warning.textContent = reloadConfirmed
                ? 'Page reload can discard unsaved in-page edits. Confirm only after saving anything you need.'
                : restartConfirmed
                    ? `This will interrupt only: ${actions.filter(item => ['restartService', 'restartSpotify', 'replaceControlPlane'].includes(item.action)).map(item => item.label).join(', ')}.`
                    : 'One or more changed files have an unknown runtime mapping. Review them before claiming the system is current.';
        }
    }

    async function checkUpdates(host) {
        if (busy) return;
        busy = true; restartConfirmed = false; reloadConfirmed = false;
        const panel = panelFor(host); if (panel) panel.hidden = false;
        setStage(host, 'Checking', 'Comparing current source fingerprints with the loaded-runtime baseline…');
        try {
            const client = reloadClient();
            if (typeof client?.checkUpdates !== 'function') throw new Error('Shared EveOS update client is unavailable.');
            const next = await client.checkUpdates();
            render(host, next);
            setStage(host, next.changed ? 'Review' : 'Ready', next.changed ? 'Review affected components, then choose the bounded action you want.' : 'No runtime reload is required.');
            return next;
        } catch (error) {
            setStage(host, 'Failed', error?.message || 'Update check failed.');
            return null;
        } finally { busy = false; render(host, plan); }
    }

    async function waitForControlReplacement(receipt) {
        const previous = String(receipt?.previousInstanceId || '');
        const expected = String(receipt?.expectedSourceFingerprint || '');
        const deadline = Date.now() + 35000;
        let last = null;
        while (Date.now() < deadline) {
            try {
                last = await request('/api/control-plane/health', null, 2500);
                const fresh = last?.running === true && last?.instanceId && last.instanceId !== previous;
                const source = !expected || last?.sourceFingerprint === expected;
                if (fresh && source && last?.scopedStartup === true) return last;
            } catch {}
            await sleep(300);
        }
        throw new Error(`Local Control replacement did not verify fresh identity/source. Last state: ${JSON.stringify(last || {})}`);
    }

    async function statusFor(component) {
        const path = STATUS_BY_COMPONENT[component];
        if (!path) return null;
        try { return await request(path, null, 6000); } catch { return null; }
    }

    async function applyRestarts(host) {
        const actions = (plan?.actions || []).filter(item => ['restartService', 'restartSpotify', 'replaceControlPlane'].includes(item.action));
        if (!actions.length || busy) return;
        if (!restartConfirmed) {
            restartConfirmed = true; reloadConfirmed = false; render(host, plan);
            setStage(host, 'Confirm', 'Review the named interruptions above, then confirm the selected restarts.');
            return;
        }
        busy = true; render(host, plan);
        const client = reloadClient();
        try {
            const ordered = [...actions].sort((a, b) => (a.component === 'localControl') - (b.component === 'localControl'));
            for (const item of ordered) {
                const component = item.component;
                const service = SERVICE_BY_COMPONENT[component];
                if (!service) continue;
                setStage(host, 'Stopping', `Preparing ${item.label}…`);
                if (item.action === 'restartService' && component !== 'localControl') {
                    const current = await statusFor(component);
                    if (current && current.running !== true) {
                        await client.markApplied(component);
                        setStage(host, 'Verifying', `${item.label} is stopped; it will load current source on its next Start.`);
                        continue;
                    }
                }
                setStage(host, 'Starting', `Restarting ${item.label}…`);
                let receipt;
                try {
                    receipt = await client.restart(service, { timeoutS: component === 'localMoe' ? 45 : component === 'web' ? 75 : 35 });
                } catch (error) {
                    if (/stopped|nothing to restart/i.test(String(error?.message || ''))) {
                        await client.markApplied(component);
                        continue;
                    }
                    throw error;
                }
                setStage(host, 'Verifying', `Verifying fresh ${item.label} runtime…`);
                if (component === 'localControl') {
                    await waitForControlReplacement(receipt);
                    await client.markApplied(component);
                } else {
                    if (receipt?.serviceRestarted !== true) throw new Error(receipt?.message || `${item.label} did not prove a fresh healthy runtime.`);
                    await client.markApplied(component);
                }
            }
            restartConfirmed = false;
            busy = false;
            render(host, plan);
            const next = await checkUpdates(host);
            if (next) setStage(host, next.changed ? 'Review' : 'Ready', next.changed ? 'Some changes still require a separate action.' : 'Selected runtime updates are loaded and verified.');
        } catch (error) {
            setStage(host, 'Failed', error?.message || 'Selective restart failed.');
        } finally { busy = false; restartConfirmed = false; render(host, plan); }
    }

    async function reloadPage(host) {
        if (busy) return;
        if (!reloadConfirmed) {
            reloadConfirmed = true; restartConfirmed = false; render(host, plan);
            setStage(host, 'Confirm', 'Save unsaved edits, then confirm the EveOS page reload.');
            return;
        }
        sessionStorage.setItem('eveos-lane4-browser-reload-pending', '1');
        window.location.reload();
    }

    async function closeBrowserReloadProof(host) {
        if (sessionStorage.getItem('eveos-lane4-browser-reload-pending') !== '1') return;
        sessionStorage.removeItem('eveos-lane4-browser-reload-pending');
        try {
            const client = reloadClient();
            if (typeof client?.markApplied === 'function') await client.markApplied('browser');
            const next = await checkUpdates(host);
            if (next) setStage(host, next.changed ? 'Review' : 'Ready', next.changed ? 'EveOS page reloaded; other component actions are still pending.' : 'EveOS page reloaded from current browser assets.');
        } catch (error) {
            setStage(host, 'Failed', error?.message || 'Page reloaded, but the browser fingerprint could not be acknowledged.');
        }
    }

    async function restartProvider(button) {
        const provider = String(button?.dataset?.providerReload || '');
        const component = PROVIDER_COMPONENT[provider];
        const service = SERVICE_BY_COMPONENT[component];
        if (!component || !service || busy) return;
        busy = true;
        const old = button.textContent;
        button.disabled = true; button.textContent = 'Restarting…';
        try {
            const current = await statusFor(component);
            if (current?.running !== true) throw new Error(`${old.replace(/^Reload /, '').replace(/^Restart /, '')} is stopped, so there is nothing to restart.`);
            const receipt = await reloadClient().restart(service, { timeoutS: component === 'localMoe' ? 45 : 35 });
            if (receipt?.serviceRestarted !== true) throw new Error(receipt?.message || 'Service restart did not verify a fresh healthy runtime.');
            button.textContent = 'Restarted';
        } catch (error) {
            button.textContent = 'Restart failed';
            button.title = error?.message || 'Restart failed.';
        } finally {
            await sleep(900);
            button.disabled = false; button.textContent = old.replace(/^Reload /, 'Restart ');
            busy = false;
        }
    }

    document.addEventListener('click', event => {
        const provider = event.target.closest?.('[data-provider-reload]');
        if (provider) {
            event.preventDefault(); event.stopImmediatePropagation(); restartProvider(provider); return;
        }
        const check = event.target.closest?.('[data-search-monitor-check-updates]');
        if (check) {
            event.preventDefault();
            const host = check.closest('.gemini-monitor-shell-toolbar')?.parentElement;
            if (host) checkUpdates(host);
            return;
        }
        const restart = event.target.closest?.('[data-update-restart-selected]');
        if (restart) { event.preventDefault(); const host = restart.closest('[data-search-monitor-update-panel]')?.parentElement; if (host) applyRestarts(host); return; }
        const page = event.target.closest?.('[data-update-reload-page], [data-search-monitor-reload-ui]');
        if (page) {
            event.preventDefault(); event.stopImmediatePropagation();
            const host = page.closest('.gemini-monitor-shell-toolbar')?.parentElement || page.closest('[data-ai-home-workspace]')?.parentElement;
            if (host) reloadPage(host);
            return;
        }
        const cancel = event.target.closest?.('[data-update-cancel-confirmation]');
        if (cancel) {
            event.preventDefault(); restartConfirmed = false; reloadConfirmed = false;
            const host = cancel.closest('[data-search-monitor-update-panel]')?.parentElement;
            if (host) { render(host, plan); setStage(host, plan?.changed ? 'Review' : 'Ready', 'Confirmation cancelled.'); }
        }
    }, true);

    const observer = new MutationObserver(() => install());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    install();

    window.EveOSSearchMonitorUpdates = Object.freeze({ install, checkUpdates, applyRestarts });
})();
