window.EveAudioflixUrlPlayback = window.EveAudioflixUrlPlayback || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUrlPlayback;
    if (ns.ready) return;

    const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
    const SCRIPT_TIMEOUT_MS = 12000;
    const YOUTUBE_FILE_MESSAGE = 'YouTube requires an HTTPS/app identity that a plain file:// page cannot send. Use Play on YouTube, replace this track URL with a direct media URL, cache a local copy, or start EveOS localhost to play it inside Audioflix.';
    const { loadScript, loadYouTubeApi } = window.EveAudioflixUrlLoaders;

    function itemKey(item) {
        return String(item?.id || item?.url || '');
    }

    // Provider iframes own their audio element; setSinkId can't reach them, so flag a routed
    // output as bypassed instead of silently ignoring it.
    function routedOutputNote() {
        const s = window.EveAudioflixState?.ensure?.() || {};
        return (s.preferredSinkId || (s.nativeBridgeEnabled === true && s.nativeOutputId))
            ? ' Note: provider players cannot follow the routed output, so this audio uses the system default device.' : '';
    }

    function providerFor(rawUrl) {
        let parsed;
        try { parsed = new URL(String(rawUrl || '').trim()); } catch { return ''; }
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
        if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) return 'soundcloud';
        if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';
        return /^https?:$/.test(parsed.protocol) ? 'direct' : '';
    }

    function youtubeId(rawUrl) {
        try {
            const url = new URL(rawUrl);
            const host = url.hostname.toLowerCase().replace(/^www\./, '');
            let id = host === 'youtu.be'
                ? url.pathname.split('/').filter(Boolean)[0]
                : url.searchParams.get('v');
            if (!id) {
                const parts = url.pathname.split('/').filter(Boolean);
                const marker = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
                if (marker >= 0) id = parts[marker + 1];
            }
            return YOUTUBE_ID_RE.test(id || '') ? id : '';
        } catch { return ''; }
    }

    function createController(options = {}) {
        let active = null;
        let timer = 0;
        let requestedInternalView = false;
        const playback = { item: null, currentTime: 0, duration: 0, paused: true, provider: '' };
        const view = window.EveAudioflixInternalPlayer?.createController?.({
            onStop: () => stop(),
            onToggle: () => playback.paused ? resume() : pause(),
            onSeek: (value) => seek(value),
            onVolume: (value) => setVolume(value)
        });

        const emitPlayback = (status, error = false) => options.onPlayback?.({
            status, item: playback.item, provider: playback.provider, browserOnly: true, error
        });
        const emitProgress = () => {
            view?.sync?.(playback);
            options.onProgress?.({ ...playback, browserOnly: true });
        };

        function ensureStage(item, provider, visual = true) {
            if (!view) throw new Error('Audioflix internal player is unavailable. Reload EveOS and try again.');
            const host = view.open(item, provider, { expanded: requestedInternalView });
            view.setVisualVisible(visual);
            host.replaceChildren();
            return host;
        }

        function setStageStatus(message, isError = false) {
            view?.setStatus?.(message, isError);
        }

        function clearTimer() {
            if (timer) clearInterval(timer);
            timer = 0;
        }

        function resetPlayback(item, provider) {
            Object.assign(playback, { item, currentTime: 0, duration: Number(item.resolvedDuration || 0) || 0, paused: true, provider });
        }

        async function stop() {
            clearTimer();
            const session = active;
            active = null;
            window.EveAudioflixAudio?.getMusicCapture?.()?.stop?.();
            try {
                if (session?.kind === 'direct') { session.player.pause(); session.player.removeAttribute('src'); session.player.load(); }
                else if (session?.kind === 'youtube') session.player.destroy?.();
                else if (session?.kind === 'soundcloud') session.player.pause?.();
                else if (session?.kind === 'vimeo') await session.player.destroy?.();
            } catch { }
            playback.paused = true;
            emitProgress();
            view?.hide?.();
        }

        async function playDirect(item) {
            if (requestedInternalView) {
                ensureStage(item, 'Direct audio', false);
                setStageStatus('Playing this linked audio inside EveOS.');
            }
            const player = new Audio();
            player.crossOrigin = 'anonymous';
            player.preload = 'auto';
            player.volume = Math.max(0, Math.min(1, Number(item.volume ?? 1)));
            player.src = item.url;
            // Follow the routed output (picked sink or matched native endpoint) so linked music
            // shares the soundboard's control layer; resolvePlaybackSink covers both cases.
            let routedLabel = '';
            const nativeMusic = window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.();
            if (nativeMusic) {
                const capture = window.EveAudioflixAudio?.getMusicCapture?.();
                if (capture) {
                    await capture.start(player);
                    routedLabel = window.EveAudioflixState?.ensure?.()?.nativeOutputLabel || 'native route';
                }
            } else {
                try {
                    const routed = typeof player.setSinkId === 'function' && await window.EveAudioflixAudio?.resolvePlaybackSink?.();
                    if (routed?.deviceId) { await player.setSinkId(routed.deviceId); routedLabel = routed.label || ''; }
                } catch { }
            }
            active = { kind: 'direct', player };
            const update = () => {
                playback.currentTime = Number(player.currentTime || 0) || 0;
                playback.duration = Number.isFinite(player.duration) ? player.duration : playback.duration;
                playback.paused = player.paused;
                emitProgress();
            };
            player.addEventListener('timeupdate', update);
            player.addEventListener('durationchange', update);
            player.addEventListener('play', () => { update(); emitPlayback(`Playing ${item.title || 'linked audio'} directly from the browser${routedLabel ? ` -> ${routedLabel}` : ''}`); });
            player.addEventListener('pause', () => { update(); emitPlayback('Paused'); });
            player.addEventListener('ended', () => {
                update();
                if (nativeMusic) window.EveAudioflixAudio?.getMusicCapture?.()?.stop?.();
                emitPlayback('Ended');
            });
            player.addEventListener('error', async () => {
                if (!item._retriedDirect && item.rawAudioUrl) {
                    try {
                        item._retriedDirect = true;
                        if (requestedInternalView) setStageStatus('Proxy blocked — attempting direct stream playback...');
                        player.src = item.rawAudioUrl;
                        player.load();
                        await player.play();
                        return;
                    } catch {}
                }
                if (!item._retried && window.EveAudioflixNative?.resolveUrl && item.originalUrl) {
                    try {
                        item._retried = true;
                        if (requestedInternalView) setStageStatus('Stream expired — re-resolving fresh YouTube audio link...');
                        const resolved = await window.EveAudioflixNative.resolveUrl(item.originalUrl, true);
                        if (resolved && resolved.ok && resolved.audioUrl) {
                            const freshProxy = 'http://localhost:8765/api/proxy?media=1&url=' + encodeURIComponent(resolved.audioUrl);
                            item.rawAudioUrl = resolved.audioUrl;
                            player.src = freshProxy;
                            player.load();
                            await player.play();
                            return;
                        }
                    } catch {}
                }
                update();
                emitPlayback('Linked audio failed to load', true);
            });
            await player.play();
        }

        async function playYouTube(item) {
            const id = youtubeId(item.url);
            if (!id) throw new Error('This YouTube URL does not contain a playable video ID.');
            if (location.protocol === 'file:') {
                ensureStage(item, 'YouTube');
                setStageStatus('Connecting through the EveOS localhost provider host...');
                const bridge = await view.connectYouTubeBridge(item, id, {
                    expanded: requestedInternalView,
                    onReady(detail) {
                        playback.duration = Number(detail.duration) || 0;
                        setStageStatus('Playing with YouTube inside EveOS.' + routedOutputNote());
                        emitProgress();
                    },
                    onProgress(detail) {
                        playback.currentTime = Number(detail.currentTime) || 0;
                        playback.duration = Number(detail.duration || playback.duration) || 0;
                        emitProgress();
                    },
                    onState(state) {
                        playback.paused = state !== 'playing';
                        if (state === 'playing') emitPlayback(`Playing ${item.title || 'YouTube audio'} with YouTube`);
                        else if (state === 'paused') emitPlayback('Paused');
                        else if (state === 'ended') emitPlayback('Ended');
                        emitProgress();
                    },
                    onError(error) {
                        playback.paused = true;
                        setStageStatus(error.message, true);
                        emitPlayback(error.message, true);
                        emitProgress();
                    }
                });
                if (!bridge) {
                    if (window.EveAudioflixNative?.resolveUrl) {
                        try {
                            setStageStatus('Resolving direct YouTube audio stream via EveOS bridge...');
                            const resolved = await window.EveAudioflixNative.resolveUrl(item.url, true);
                            if (resolved && resolved.ok && resolved.audioUrl) {
                                const proxyUrl = /^https?:\/\//i.test(resolved.audioUrl) ? ('http://localhost:8765/api/proxy?media=1&url=' + encodeURIComponent(resolved.audioUrl)) : resolved.audioUrl;
                                setStageStatus(`Playing stream — "${resolved.title || item.title}"`);
                                return await playDirect({ ...item, url: proxyUrl, rawAudioUrl: resolved.audioUrl, originalUrl: item.url, resolvedDuration: resolved.duration });
                            }
                        } catch {}
                    }
                    playback.paused = true;
                    setStageStatus(YOUTUBE_FILE_MESSAGE, true);
                    emitPlayback(YOUTUBE_FILE_MESSAGE, true);
                    emitProgress();
                    const error = new Error(YOUTUBE_FILE_MESSAGE);
                    error.eveReported = true;
                    throw error;
                }
                active = { kind: 'youtube', player: bridge };
                return;
            }
            const host = ensureStage(item, 'YouTube');
            await loadYouTubeApi();
            await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (error) => {
                    if (settled) return;
                    settled = true;
                    error ? reject(error) : resolve();
                };
                const playerVars = { autoplay: 1, controls: 1, playsinline: 1, rel: 0 };
                if (/^https?:$/.test(location.protocol)) playerVars.origin = location.origin;
                const player = new window.YT.Player(host, {
                    width: 480,
                    height: 270,
                    videoId: id,
                    playerVars,
                    events: {
                        onReady(event) {
                            active = { kind: 'youtube', player: event.target };
                            event.target.setVolume(Math.round(Math.max(0, Math.min(1, Number(item.volume ?? 1))) * 100));
                            event.target.playVideo();
                            playback.duration = Number(event.target.getDuration?.() || 0) || 0;
                            setStageStatus('Playing with YouTube\'s browser player.' + routedOutputNote());
                            finish();
                        },
                        onStateChange(event) {
                            const states = window.YT.PlayerState || {};
                            playback.paused = event.data !== states.PLAYING;
                            if (event.data === states.PLAYING) emitPlayback(`Playing ${item.title || 'YouTube audio'} with YouTube`);
                            if (event.data === states.PAUSED) emitPlayback('Paused');
                            if (event.data === states.ENDED) emitPlayback('Ended');
                            emitProgress();
                        },
                        onError(event) {
                            const message = event.data === 153
                                ? YOUTUBE_FILE_MESSAGE
                                : `YouTube could not play this link (error ${event.data}).`;
                            clearTimer();
                            try { event.target?.destroy?.(); } catch { }
                            active = null;
                            playback.paused = true;
                            setStageStatus(message, true);
                            emitPlayback(message, true);
                            emitProgress();
                            const error = new Error(message);
                            error.eveReported = true;
                            finish(error);
                        }
                    }
                });
                active = { kind: 'youtube', player };
            });
            clearTimer();
            timer = setInterval(() => {
                if (active?.kind !== 'youtube') return;
                playback.currentTime = Number(active.player.getCurrentTime?.() || 0) || 0;
                playback.duration = Number(active.player.getDuration?.() || playback.duration) || 0;
                emitProgress();
            }, 250);
        }

        async function playSoundCloud(item) {
            const host = ensureStage(item, 'SoundCloud');
            const iframe = document.createElement('iframe');
            iframe.allow = 'autoplay';
            iframe.title = item.title || 'SoundCloud player';
            iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(item.url)}&auto_play=true&hide_related=true&show_comments=false&show_user=true`;
            host.appendChild(iframe);
            await loadScript('https://w.soundcloud.com/player/api.js', () => !!window.SC?.Widget);
            await new Promise((resolve, reject) => {
                const widget = window.SC.Widget(iframe);
                active = { kind: 'soundcloud', player: widget };
                const events = window.SC.Widget.Events;
                const timeout = setTimeout(() => reject(new Error('SoundCloud player did not become ready.')), SCRIPT_TIMEOUT_MS);
                widget.bind(events.READY, () => {
                    clearTimeout(timeout);
                    widget.setVolume(Math.round(Math.max(0, Math.min(1, Number(item.volume ?? 1))) * 100));
                    widget.getDuration((duration) => { playback.duration = Number(duration || 0) / 1000; emitProgress(); });
                    widget.play();
                    setStageStatus('Playing with SoundCloud\'s browser player.');
                    resolve();
                });
                widget.bind(events.PLAY, () => { playback.paused = false; emitPlayback(`Playing ${item.title || 'SoundCloud audio'} with SoundCloud`); });
                widget.bind(events.PAUSE, () => { playback.paused = true; emitPlayback('Paused'); emitProgress(); });
                widget.bind(events.FINISH, () => { playback.paused = true; playback.currentTime = playback.duration; emitPlayback('Ended'); emitProgress(); });
                widget.bind(events.PLAY_PROGRESS, (data) => { playback.currentTime = Number(data.currentPosition || 0) / 1000; emitProgress(); });
            });
        }

        async function playVimeo(item) {
            const host = ensureStage(item, 'Vimeo');
            await loadScript('https://player.vimeo.com/api/player.js', () => !!window.Vimeo?.Player);
            const player = new window.Vimeo.Player(host, { url: item.url, autoplay: true, controls: true, responsive: true });
            active = { kind: 'vimeo', player };
            player.on('play', () => { playback.paused = false; emitPlayback(`Playing ${item.title || 'Vimeo audio'} with Vimeo`); });
            player.on('pause', () => { playback.paused = true; emitPlayback('Paused'); emitProgress(); });
            player.on('ended', () => { playback.paused = true; playback.currentTime = playback.duration; emitPlayback('Ended'); emitProgress(); });
            player.on('timeupdate', (data) => { playback.currentTime = Number(data.seconds || 0); playback.duration = Number(data.duration || 0); emitProgress(); });
            await player.ready();
            await player.setVolume(Math.max(0, Math.min(1, Number(item.volume ?? 1))));
            await player.play();
            setStageStatus('Playing with Vimeo\'s browser player.');
        }

        async function play(item, playOptions = {}) {
            const provider = providerFor(item?.url);
            if (!provider) throw new Error('This URL cannot be played directly by the browser.');
            requestedInternalView = playOptions.internalView === true;
            if (active && itemKey(playback.item) === itemKey(item)) {
                if (requestedInternalView && provider === 'direct') {
                    ensureStage(item, 'Direct audio', false);
                    setStageStatus('Playing this linked audio inside EveOS.');
                } else if (requestedInternalView) view?.setExpanded?.(true);
                if (playback.paused) await resume();
                return true;
            }
            await stop();
            resetPlayback(item, provider);
            try {
                if (provider === 'youtube') await playYouTube(item);
                else if (provider === 'soundcloud') await playSoundCloud(item);
                else if (provider === 'vimeo') await playVimeo(item);
                else await playDirect(item);
                return true;
            } catch (error) {
                clearTimer();
                const session = active;
                active = null;
                try {
                    if (session?.kind === 'direct') session.player.pause?.();
                    else if (session?.kind === 'youtube') session.player.destroy?.();
                    else if (session?.kind === 'soundcloud') session.player.pause?.();
                    else if (session?.kind === 'vimeo') await session.player.destroy?.();
                } catch { }
                playback.paused = true;
                emitProgress();
                if (provider === 'direct') {
                    const originalError = error;
                    error = new Error('This URL did not expose browser-playable audio. Use a direct media URL (such as MP3, M4A, OGG, WAV, or WebM), cache the track locally, or start EveOS localhost to resolve the page.');
                    error.cause = originalError;
                }
                if (!error?.eveReported) {
                    const message = error?.message || 'The linked track could not be played in this browser.';
                    if (provider !== 'direct' || requestedInternalView) setStageStatus(message, true);
                    emitPlayback(message, true);
                }
                throw error;
            }
        }

        async function resume() {
            if (!active) return false;
            if (active.kind === 'direct') await active.player.play();
            else if (active.kind === 'youtube') active.player.playVideo?.();
            else if (active.kind === 'soundcloud') active.player.play?.();
            else if (active.kind === 'vimeo') await active.player.play?.();
            playback.paused = false;
            emitProgress();
            return true;
        }

        async function pause() {
            if (!active) return false;
            if (active.kind === 'direct') active.player.pause();
            else if (active.kind === 'youtube') active.player.pauseVideo?.();
            else if (active.kind === 'soundcloud') active.player.pause?.();
            else if (active.kind === 'vimeo') await active.player.pause?.();
            playback.paused = true;
            emitPlayback('Paused');
            emitProgress();
            return true;
        }

        async function seek(seconds) {
            if (!active) return false;
            const target = Math.max(0, Math.min(Number(seconds || 0), playback.duration || Infinity));
            if (active.kind === 'direct') active.player.currentTime = target;
            else if (active.kind === 'youtube') active.player.seekTo?.(target, true);
            else if (active.kind === 'soundcloud') active.player.seekTo?.(target * 1000);
            else if (active.kind === 'vimeo') await active.player.setCurrentTime?.(target);
            playback.currentTime = target;
            emitProgress();
            return true;
        }

        function setVolume(volume) {
            if (!active) return;
            const safe = Math.max(0, Math.min(1, Number(volume || 0)));
            if (active.kind === 'direct') active.player.volume = safe;
            else if (active.kind === 'youtube') active.player.setVolume?.(Math.round(safe * 100));
            else if (active.kind === 'soundcloud') active.player.setVolume?.(Math.round(safe * 100));
            else if (active.kind === 'vimeo') active.player.setVolume?.(safe).catch?.(() => {});
            if (playback.item) playback.item.volume = safe;
        }

        return {
            play, openInternalView: (item) => play(item, { internalView: true }), pause, seek, stop, setVolume,
            canHandle: (item) => !!providerFor(item?.url),
            shouldPreferBrowser: (item) => location.protocol === 'file:'
                && /^https?:\/\//i.test(String(item?.url || ''))
                && window.EveAudioflixNative?.getStatus?.()?.ok !== true,
            isActive: () => !!active,
            matches: (itemOrId) => typeof itemOrId === 'object'
                ? itemKey(playback.item) === itemKey(itemOrId)
                : String(playback.item?.id || '') === String(itemOrId || ''),
            getPlaybackState: () => ({ ...playback, browserOnly: true })
        };
    }

    Object.assign(ns, { ready: true, providerFor, youtubeId, createController });
})();
