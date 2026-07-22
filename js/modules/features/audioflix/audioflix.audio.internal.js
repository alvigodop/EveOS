window.EveAudioflixInternalPlayer = window.EveAudioflixInternalPlayer || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixInternalPlayer;
    if (ns.ready) return;

    const HOST_PATH = '/server/audioflix-provider-host.html';
    const HOST_MARKER = 'eve-audioflix-provider-host';
    const HOST_PROBE_TIMEOUT_MS = 900;
    const PLAYER_READY_TIMEOUT_MS = 12000;
    let cachedHost = '';
    let cachedHostAt = 0;
    let hostProbe = null;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

    function formatTime(value) {
        const seconds = Math.max(0, Number(value) || 0);
        const minutes = Math.floor(seconds / 60);
        return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    }

    function normalizeBase(value) {
        try {
            const url = new URL(String(value || ''));
            return /^https?:$/.test(url.protocol) ? url.origin : '';
        } catch { return ''; }
    }

    function providerHostCandidates() {
        const values = [
            window.EveAudioflixState?.ensure?.()?.nativeBridgeBase,
            /^https?:$/.test(location.protocol) ? location.origin : '',
            'http://127.0.0.1:8765',
            'http://127.0.0.1:3000'
        ];
        return [...new Set(values.map(normalizeBase).filter(Boolean))];
    }

    async function probeHost(base) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => controller?.abort(), HOST_PROBE_TIMEOUT_MS);
        try {
            const response = await fetch(`${base}${HOST_PATH}?probe=1`, {
                cache: 'no-store',
                signal: controller?.signal
            });
            if (!response.ok) return false;
            return (await response.text()).includes(HOST_MARKER);
        } catch { return false; }
        finally { clearTimeout(timer); }
    }

    async function findProviderHost() {
        if (cachedHost && Date.now() - cachedHostAt < 60000) return cachedHost;
        if (hostProbe) return hostProbe;
        hostProbe = (async () => {
            for (const base of providerHostCandidates()) {
                if (await probeHost(base)) {
                    cachedHost = base;
                    cachedHostAt = Date.now();
                    return base;
                }
            }
            cachedHost = '';
            cachedHostAt = Date.now();
            return '';
        })();
        try { return await hostProbe; }
        finally { hostProbe = null; }
    }

    function createController(options = {}) {
        let stage = null;
        let currentItem = null;

        function ensureStage() {
            if (stage) return stage;
            stage = document.createElement('section');
            stage.className = 'audioflix-provider-stage';
            stage.hidden = true;
            stage.innerHTML = `
                <header>
                    <div><span>Internal player</span><strong></strong></div>
                    <div>
                        <button type="button" data-url-player-action="collapse">Minimize</button>
                        <a target="_blank" rel="noopener noreferrer">Open source</a>
                        <button type="button" data-url-player-action="stop">Close</button>
                    </div>
                </header>
                <p class="audioflix-provider-status"></p>
                <div class="audioflix-provider-frame"></div>
                <footer class="audioflix-provider-transport">
                    <button type="button" data-url-player-action="toggle">Play</button>
                    <output class="audioflix-provider-time">0:00 / 0:00</output>
                    <input class="audioflix-provider-seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="Playback position">
                    <label><span>Volume</span><input class="audioflix-provider-volume" type="range" min="0" max="1" step="0.01" value="1"></label>
                </footer>`;
            stage.addEventListener('click', (event) => {
                const button = event.target.closest('[data-url-player-action]');
                const action = button?.dataset.urlPlayerAction;
                if (action === 'stop') options.onStop?.();
                else if (action === 'toggle') options.onToggle?.();
                else if (action === 'collapse') {
                    stage.classList.toggle('is-collapsed');
                    button.textContent = stage.classList.contains('is-collapsed') ? 'Expand' : 'Minimize';
                }
            });
            stage.addEventListener('change', (event) => {
                if (event.target.matches('.audioflix-provider-seek')) options.onSeek?.(Number(event.target.value || 0));
            });
            stage.addEventListener('input', (event) => {
                if (event.target.matches('.audioflix-provider-volume')) options.onVolume?.(Number(event.target.value || 0));
            });
            document.body.appendChild(stage);
            return stage;
        }

        function open(item, provider, settings = {}) {
            const element = ensureStage();
            currentItem = item;
            element.hidden = false;
            element.classList.remove('has-error');
            element.classList.toggle('is-internal-view', settings.expanded === true);
            if (settings.expanded) element.classList.remove('is-collapsed');
            element.dataset.provider = String(provider || '').toLowerCase();
            element.querySelector('header span').textContent = `${provider || 'Browser'} internal player`;
            element.querySelector('header strong').textContent = item?.title || 'Linked audio';
            const source = element.querySelector('header a');
            source.href = item?.sourceUrl || item?.url || '#';
            source.textContent = provider === 'YouTube' ? 'Play on YouTube' : 'Open source';
            const volume = element.querySelector('.audioflix-provider-volume');
            volume.value = String(clamp(item?.volume ?? 1, 0, 1));
            setStatus('Connecting inside EveOS...');
            return element.querySelector('.audioflix-provider-frame');
        }

        function setStatus(message, isError = false) {
            const element = ensureStage();
            element.classList.toggle('has-error', isError);
            element.querySelector('.audioflix-provider-status').textContent = String(message || '');
        }

        function setVisualVisible(visible) {
            ensureStage().classList.toggle('is-audio-only', visible === false);
        }

        function setExpanded(expanded = true) {
            const element = ensureStage();
            element.hidden = false;
            element.classList.toggle('is-internal-view', expanded);
            if (expanded) element.classList.remove('is-collapsed');
        }

        function sync(playback = {}) {
            if (!stage || stage.hidden) return;
            const current = Math.max(0, Number(playback.currentTime) || 0);
            const duration = Math.max(0, Number(playback.duration) || 0);
            const seek = stage.querySelector('.audioflix-provider-seek');
            seek.max = String(duration);
            seek.value = String(Math.min(current, duration || current));
            seek.disabled = duration <= 0;
            stage.querySelector('.audioflix-provider-time').textContent = `${formatTime(current)} / ${formatTime(duration)}`;
            stage.querySelector('[data-url-player-action="toggle"]').textContent = playback.paused === false ? 'Pause' : 'Play';
        }

        function hide() {
            if (stage) stage.hidden = true;
        }

        async function connectYouTubeBridge(item, videoId, callbacks = {}) {
            const base = await findProviderHost();
            if (!base) return null;
            const frameHost = open(item, 'YouTube', { expanded: callbacks.expanded === true });
            setVisualVisible(true);
            frameHost.replaceChildren();
            const token = `af-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            const hostOrigin = new URL(base).origin;
            const iframe = document.createElement('iframe');
            const params = new URLSearchParams({ provider: 'youtube', id: videoId, token, autoplay: '1', volume: String(clamp(item?.volume ?? 1, 0, 1)) });
            iframe.src = `${base}${HOST_PATH}?${params}`;
            iframe.title = item?.title || 'YouTube internal player';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            const bridgeState = { currentTime: 0, duration: 0, paused: true };
            let settled = false;
            let readyTimer = 0;

            const command = (action, value) => iframe.contentWindow?.postMessage({
                type: 'eve-audioflix-provider-command', token, action, value
            }, hostOrigin);
            const cleanup = () => {
                clearTimeout(readyTimer);
                window.removeEventListener('message', onMessage);
            };
            const player = {
                playVideo: () => command('play'),
                pauseVideo: () => command('pause'),
                seekTo: (value) => command('seek', Number(value) || 0),
                setVolume: (value) => command('volume', Number(value) || 0),
                getCurrentTime: () => bridgeState.currentTime,
                getDuration: () => bridgeState.duration,
                destroy() { command('stop'); cleanup(); iframe.remove(); }
            };

            function onMessage(event) {
                if (event.source !== iframe.contentWindow || event.origin !== hostOrigin) return;
                const detail = event.data;
                if (detail?.type !== 'eve-audioflix-provider' || detail.token !== token) return;
                if (detail.event === 'progress' || detail.event === 'ready') {
                    bridgeState.currentTime = Number(detail.currentTime) || 0;
                    bridgeState.duration = Number(detail.duration) || 0;
                    callbacks.onProgress?.({ ...bridgeState });
                }
                if (detail.event === 'state') {
                    bridgeState.paused = detail.state !== 'playing';
                    callbacks.onState?.(detail.state);
                }
                if (detail.event === 'ready' && !settled) {
                    settled = true;
                    clearTimeout(readyTimer);
                    callbacks.onReady?.({ ...bridgeState });
                    callbacks.resolve?.(player);
                }
                if (detail.event === 'error') {
                    const error = new Error(detail.message || 'The localhost YouTube player could not start.');
                    if (!settled) {
                        settled = true;
                        clearTimeout(readyTimer);
                        callbacks.reject?.(error);
                    } else callbacks.onError?.(error);
                }
            }

            return new Promise((resolve, reject) => {
                callbacks.resolve = resolve;
                callbacks.reject = reject;
                window.addEventListener('message', onMessage);
                readyTimer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    iframe.remove();
                    reject(new Error('The EveOS localhost player timed out while connecting.'));
                }, PLAYER_READY_TIMEOUT_MS);
                iframe.addEventListener('error', () => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(new Error('The EveOS localhost player could not be loaded.'));
                }, { once: true });
                frameHost.appendChild(iframe);
            });
        }

        return {
            open, hide, setStatus, setVisualVisible, setExpanded, sync, connectYouTubeBridge,
            getFrame: () => ensureStage().querySelector('.audioflix-provider-frame'),
            getStage: () => stage,
            getItem: () => currentItem
        };
    }

    Object.assign(ns, { ready: true, createController, findProviderHost, providerHostCandidates });
})();
