window.EveAudioflixInstagramPlayback = window.EveAudioflixInstagramPlayback || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixInstagramPlayback;
    if (ns.ready) return;

    const canonical = (value) => window.EveAudioflixInstagramPlaylists?.parseUrls?.(value)?.[0] || '';
    const embedUrl = (url) => `${canonical(url)}embed/?utm_source=ig_embed`;

    function create(deps) {
        const { ensureStage, setStageStatus, emitPlayback, emitProgress, view, isInternalView } = deps;
        let timer = 0;

        function clearTimer() {
            if (timer) clearInterval(timer);
            timer = 0;
        }

        function makeFramePlayer(frame) {
            const original = frame.src;
            return {
                async play() { if (!frame.src || frame.src === 'about:blank') frame.src = original; },
                async pause() { frame.src = 'about:blank'; },
                async destroy() { clearTimer(); frame.remove(); },
                async setCurrentTime() {},
                async setVolume() {}
            };
        }

        function setActive(player, item, paused = true) {
            view.active = { kind: 'instagram', player };
            Object.assign(view.playback, { item, provider: 'instagram', paused });
            emitProgress();
        }

        async function showDirectVideo(host, item) {
            setStageStatus('Resolving the Reel video through EveOS localhost...');
            const result = await window.EveAudioflixNative?.resolveInstagramVideo?.(item.url);
            if (!result?.ok || !result.videoUrl) throw new Error(result?.reason || 'The Reel video could not be resolved.');
            host.replaceChildren();
            const video = document.createElement('video');
            video.className = 'audioflix-instagram-video';
            video.controls = true;
            video.playsInline = true;
            video.autoplay = true;
            video.src = window.EveAudioflixNative?.getProxyUrl?.(result.videoUrl) || result.videoUrl;
            video.volume = Math.max(0, Math.min(1, Number(item.volume ?? 1)));
            host.append(video);
            const player = {
                play: () => video.play(), pause: () => video.pause(), destroy: () => { clearTimer(); video.pause(); video.removeAttribute('src'); video.load(); },
                setCurrentTime: (value) => { video.currentTime = Number(value || 0); },
                setVolume: (value) => { video.volume = Number(value || 0); }
            };
            setActive(player, item, false);
            view.playback.duration = Number(result.duration || 0) || 0;
            timer = setInterval(() => {
                if (view.active?.player !== player) return clearTimer();
                view.playback.currentTime = Number(video.currentTime || 0);
                view.playback.duration = Number(video.duration || result.duration || 0);
                view.playback.paused = video.paused;
                emitProgress();
            }, 250);
            await video.play().catch(() => {});
            setStageStatus('Playing the Reel video through EveOS localhost.');
        }

        async function playInstagram(item) {
            const url = canonical(item?.url);
            if (!url) throw new Error('This item is not a valid Instagram Reel or post URL.');
            if (!isInternalView()) {
                throw new Error('Start EveOS localhost to resolve hidden Reel audio, or open the internal player to view the Reel.');
            }
            clearTimer();
            const host = ensureStage(item, 'Instagram Reel', true);
            host.className = 'audioflix-provider-stage audioflix-instagram-stage';
            host.innerHTML = `<section class="audioflix-instagram-inspector"><nav><button type="button" data-reel-mode="focus" class="is-active">Focus</button><button type="button" data-reel-mode="direct">Direct Video</button><button type="button" data-reel-mode="embed">Full Embed</button></nav><p>This reel is: <a href="${url}" target="_blank" rel="noopener">${url}</a></p><div class="audioflix-instagram-canvas is-focus"></div></section>`;
            const canvas = host.querySelector('.audioflix-instagram-canvas');
            const buttons = [...host.querySelectorAll('[data-reel-mode]')];
            const activate = async (mode) => {
                clearTimer();
                buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.reelMode === mode));
                if (mode === 'direct') {
                    canvas.className = 'audioflix-instagram-canvas is-direct';
                    await showDirectVideo(canvas, item);
                    return;
                }
                canvas.className = `audioflix-instagram-canvas is-${mode}`;
                canvas.replaceChildren();
                const frame = document.createElement('iframe');
                frame.src = embedUrl(url);
                frame.title = item.title || 'Instagram Reel';
                frame.loading = 'eager';
                frame.allow = 'autoplay; encrypted-media; picture-in-picture';
                frame.setAttribute('allowfullscreen', '');
                canvas.append(frame);
                setActive(makeFramePlayer(frame), item, true);
                setStageStatus(mode === 'focus' ? 'Focused Instagram Reel view.' : 'Full Instagram embed view.');
            };
            buttons.forEach((button) => button.addEventListener('click', () => activate(button.dataset.reelMode).catch((error) => {
                setStageStatus(error.message || 'The Reel view could not load.', true);
                emitPlayback(error.message || 'The Reel view could not load.', true);
            })));
            await activate('focus');
        }

        return { playInstagram };
    }

    Object.assign(ns, { ready: true, create, canonical, embedUrl });
})();
