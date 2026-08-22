window.EveAudioflixPianoUi = window.EveAudioflixPianoUi || {};

(function (ns) {
    'use strict';
    if (ns.ready) return;

    let visible = false;
    let pollTimer = 0;
    let root = null;

    function snapshot() {
        return window.EveAudioflixPiano?.state || {};
    }

    function context() {
        const audioflix = window.EveAudioflixState?.getSnapshot?.() || {};
        const route = audioflix.nativeBridgeEnabled && audioflix.nativeOutputLabel
            ? audioflix.nativeOutputLabel : (audioflix.preferredSinkLabel || 'Default output');
        return {
            surface: 'Audioflix',
            soundCount: Number(audioflix.soundboard?.length || 0),
            musicCount: Number(audioflix.music?.length || 0),
            outputRoute: route,
            sentAt: new Date().toISOString()
        };
    }

    function sendContext(frame) {
        try {
            frame?.contentWindow?.postMessage({ type: 'eveos:audioflix-context', context: context() }, '*');
        } catch (_) {}
    }

    function patch(host = root) {
        const panel = host?.querySelector?.('[data-audioflix-piano]');
        if (!panel) return;
        const status = snapshot();
        const running = status.running === true;
        const pill = panel.querySelector('[data-piano-status]');
        const message = panel.querySelector('[data-piano-message]');
        const toggle = panel.querySelector('[data-piano-toggle]');
        const frame = panel.querySelector('[data-piano-frame]');
        const offline = panel.querySelector('[data-piano-offline]');
        if (pill) {
            pill.dataset.state = status.phase || 'stopped';
            pill.textContent = running ? 'Online' : status.phase === 'starting' ? 'Starting' : 'Stopped';
        }
        if (message) message.textContent = status.message || '';
        if (toggle) {
            toggle.textContent = running ? 'Stop Piano' : 'Start Piano';
            toggle.disabled = status.busy === true || status.installed === false;
        }
        if (frame) {
            frame.hidden = !running;
            const source = running ? (status.url || window.EveAudioflixPiano.serviceUrl()) : 'about:blank';
            if (frame.getAttribute('src') !== source) frame.setAttribute('src', source);
            if (running) sendContext(frame);
        }
        if (offline) offline.hidden = running;
    }

    async function refresh() {
        await window.EveAudioflixPiano?.refresh?.();
        patch();
    }

    function syncPoll() {
        if (pollTimer && !visible) {
            clearInterval(pollTimer);
            pollTimer = 0;
        }
        if (!pollTimer && visible) pollTimer = setInterval(() => void refresh(), 5000);
    }

    function setVisible(next) {
        visible = next === true;
        syncPoll();
        if (visible) void refresh();
    }

    function afterRender(host) {
        root = host;
        const frame = root?.querySelector?.('[data-piano-frame]');
        frame?.addEventListener('load', () => sendContext(frame), { once: true });
        patch(host);
    }

    function render() {
        const status = snapshot();
        const running = status.running === true;
        return `<section class="audioflix-piano" data-audioflix-piano>
            <header class="audioflix-piano-header"><div><span>PRACTICE AUTOMATION</span><h3>Piano-Auto-Player</h3><p>Search sheets, record exact performances, audition internally, or send timed keys to a selected piano window.</p></div><div class="audioflix-piano-actions"><b data-piano-status data-state="${status.phase || 'checking'}">${running ? 'Online' : 'Checking'}</b><button type="button" data-af-action="piano-refresh">Refresh</button><button type="button" data-af-action="piano-toggle" data-piano-toggle>${running ? 'Stop Piano' : 'Start Piano'}</button><button type="button" data-af-action="piano-detach">Detach</button></div></header>
            <p class="audioflix-piano-message" data-piano-message>${status.message || 'Checking the local Piano service...'}</p>
            <div class="audioflix-piano-stage">
                <iframe data-piano-frame title="Piano Auto Player" src="${running ? status.url : 'about:blank'}" ${running ? '' : 'hidden'}></iframe>
                <div class="audioflix-piano-offline" data-piano-offline ${running ? 'hidden' : ''}><strong>Piano is resting</strong><span>Start it only when you want sheet playback, recording, or conversion tools.</span><button type="button" data-af-action="piano-toggle">Start Piano-Auto-Player</button></div>
            </div>
        </section>`;
    }

    function renderDetachedMessage(target, message) {
        if (!target || target.closed) return;
        target.document.body.innerHTML = '';
        target.document.body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-items:center;background:#081214;color:#efffd0;font:16px sans-serif';
        const text = target.document.createElement('p');
        text.textContent = message;
        target.document.body.appendChild(text);
    }

    async function detach() {
        const target = window.open('about:blank', 'eveos-piano-auto-player', 'popup=yes,width=1320,height=900,resizable=yes,scrollbars=yes');
        if (!target) return;
        renderDetachedMessage(target, 'Starting Piano-Auto-Player...');
        let status = snapshot();
        if (!status.running) status = await window.EveAudioflixPiano.start();
        if (!status.running) {
            renderDetachedMessage(target, status.message || 'Piano-Auto-Player could not be opened.');
            return;
        }
        target.location.replace(status.url || window.EveAudioflixPiano.serviceUrl());
        target.focus();
    }

    async function handleAction(target) {
        const action = target?.dataset?.afAction || '';
        if (action === 'piano-refresh') await refresh();
        if (action === 'piano-toggle') {
            const status = snapshot();
            await (status.running ? window.EveAudioflixPiano.stop() : window.EveAudioflixPiano.start());
            patch();
        }
        if (action === 'piano-detach') {
            await detach();
        }
        return { handled: action.startsWith('piano-') };
    }

    window.addEventListener('message', (event) => {
        if (event.data?.type === 'piano:eveos-ready') {
            sendContext(root?.querySelector?.('[data-piano-frame]'));
        }
    });
    window.addEventListener('eve:audioflix-piano-status', () => patch());
    Object.assign(ns, { ready: true, render, afterRender, setVisible, handleAction });
})(window.EveAudioflixPianoUi);
