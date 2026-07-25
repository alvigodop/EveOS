// SoundCloud and Vimeo playback for linked tracks.
//
// Both are third-party iframe WIDGETS: EveOS never touches their audio, it drives someone else's
// player and mirrors the callbacks back onto our transport state. That makes them a different
// animal from the direct <audio> element and from YouTube's iframe API, so they live together
// here. Split out of audioflix.audio.url.js to keep that controller under the project line cap;
// the controller's mutable playback state arrives late-bound through `ctx`.
window.EveAudioflixUrlWidgets = window.EveAudioflixUrlWidgets || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUrlWidgets;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        const { ensureStage, setStageStatus, emitPlayback, emitProgress, loadScript, SCRIPT_TIMEOUT_MS } = ctx;
        const V = ctx.view;
        const volumeOf = (item) => Math.max(0, Math.min(1, Number(item.volume ?? 1)));

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
                V.active = { kind: 'soundcloud', player: widget };
                const events = window.SC.Widget.Events;
                const timeout = setTimeout(() => reject(new Error('SoundCloud player did not become ready.')), SCRIPT_TIMEOUT_MS);
                widget.bind(events.READY, () => {
                    clearTimeout(timeout);
                    widget.setVolume(Math.round(volumeOf(item) * 100));
                    widget.getDuration((duration) => { V.playback.duration = Number(duration || 0) / 1000; emitProgress(); });
                    widget.play();
                    setStageStatus('Playing with SoundCloud\'s browser player.');
                    resolve();
                });
                widget.bind(events.PLAY, () => { V.playback.paused = false; emitPlayback(`Playing ${item.title || 'SoundCloud audio'} with SoundCloud`); });
                widget.bind(events.PAUSE, () => { V.playback.paused = true; emitPlayback('Paused'); emitProgress(); });
                widget.bind(events.FINISH, () => { V.playback.paused = true; V.playback.currentTime = V.playback.duration; emitPlayback('Ended'); emitProgress(); });
                widget.bind(events.PLAY_PROGRESS, (data) => { V.playback.currentTime = Number(data.currentPosition || 0) / 1000; emitProgress(); });
            });
        }

        async function playVimeo(item) {
            const host = ensureStage(item, 'Vimeo');
            await loadScript('https://player.vimeo.com/api/player.js', () => !!window.Vimeo?.Player);
            const player = new window.Vimeo.Player(host, { url: item.url, autoplay: true, controls: true, responsive: true });
            V.active = { kind: 'vimeo', player };
            player.on('play', () => { V.playback.paused = false; emitPlayback(`Playing ${item.title || 'Vimeo audio'} with Vimeo`); });
            player.on('pause', () => { V.playback.paused = true; emitPlayback('Paused'); emitProgress(); });
            player.on('ended', () => { V.playback.paused = true; V.playback.currentTime = V.playback.duration; emitPlayback('Ended'); emitProgress(); });
            player.on('timeupdate', (data) => { V.playback.currentTime = Number(data.seconds || 0); V.playback.duration = Number(data.duration || 0); emitProgress(); });
            await player.ready();
            await player.setVolume(volumeOf(item));
            await player.play();
            setStageStatus('Playing with Vimeo\'s browser player.');
        }

        return { playSoundCloud, playVimeo };
    };

    ns.ready = true;
})();
