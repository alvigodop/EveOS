window.EveAudioflixSpotifyPlayback = window.EveAudioflixSpotifyPlayback || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSpotifyPlayback;
    if (ns.ready) return;

    const SDK_URL = 'https://open.spotify.com/embed/iframe-api/v1';
    const READY_TIMEOUT_MS = 12000;
    let apiPromise = null;

    function spotifyTrackId(value) {
        return String(value || '').match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]+)/i)?.[1] || '';
    }

    function loadApi() {
        if (apiPromise) return apiPromise;
        apiPromise = new Promise((resolve, reject) => {
            let settled = false;
            const previous = window.onSpotifyIframeApiReady;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                apiPromise = null;
                reject(new Error('Spotify player timed out while loading.'));
            }, READY_TIMEOUT_MS);
            window.onSpotifyIframeApiReady = (api) => {
                try { previous?.(api); } catch {}
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(api);
            };
            const existing = [...document.scripts].find((script) => script.src === SDK_URL);
            if (existing) return;
            const script = Object.assign(document.createElement('script'), { src: SDK_URL, async: true });
            script.addEventListener('error', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                apiPromise = null;
                reject(new Error('Spotify player resources could not load.'));
            }, { once: true });
            document.head.appendChild(script);
        });
        return apiPromise;
    }

    ns.create = function create(ctx) {
        const { ensureStage, setStageStatus, emitPlayback, emitProgress } = ctx;
        const V = ctx.view;

        async function playSpotify(item) {
            const id = spotifyTrackId(item?.url);
            if (!id) throw new Error('This Spotify link does not contain a playable track ID.');
            const host = ensureStage(item, 'Spotify');
            const mount = document.createElement('div');
            mount.className = 'audioflix-spotify-player';
            host.appendChild(mount);
            const api = await loadApi();

            await new Promise((resolve, reject) => {
                let settled = false;
                let ended = false;
                const timer = setTimeout(() => finish(new Error('Spotify player did not become ready.')), READY_TIMEOUT_MS);
                const finish = (error) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    error ? reject(error) : resolve();
                };
                api.createController(mount, {
                    uri: `spotify:track:${id}`,
                    width: '100%',
                    height: 152
                }, (controller) => {
                    const player = {
                        play: () => typeof controller.resume === 'function'
                            ? controller.resume()
                            : controller.play?.(),
                        pause: () => controller.pause?.(),
                        setCurrentTime: (seconds) => controller.seek?.(Math.max(0, Number(seconds) || 0)),
                        setVolume: (volume) => controller.setVolume?.(Math.max(0, Math.min(1, Number(volume) || 0))),
                        destroy: () => controller.destroy?.()
                    };
                    V.active = { kind: 'spotify', player };
                    controller.addListener?.('ready', () => {
                        player.setVolume(item.volume ?? 1);
                        player.play();
                        setStageStatus('Playing with Spotify\'s official embedded player.');
                        finish();
                    });
                    controller.addListener?.('playback_update', (event) => {
                        const data = event?.data || event || {};
                        V.playback.currentTime = Math.max(0, Number(data.position || 0) / 1000);
                        V.playback.duration = Math.max(0, Number(data.duration || 0) / 1000);
                        V.playback.paused = data.isPaused !== false;
                        const atEnd = V.playback.duration > 0
                            && V.playback.currentTime >= Math.max(0, V.playback.duration - 0.35);
                        if (!V.playback.paused) {
                            ended = false;
                            emitPlayback(`Playing ${item.title || 'Spotify track'} with Spotify`);
                        } else if (atEnd && !ended) {
                            ended = true;
                            emitPlayback('Ended');
                        }
                        emitProgress();
                    });
                    controller.addListener?.('playback_error', () => {
                        finish(new Error('Spotify could not play this track in the embedded player.'));
                    });
                });
            });
        }

        return { playSpotify };
    };

    Object.assign(ns, { ready: true, spotifyTrackId, loadApi });
})();
