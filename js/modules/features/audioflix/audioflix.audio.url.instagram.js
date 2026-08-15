window.EveAudioflixInstagramPlayback = window.EveAudioflixInstagramPlayback || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixInstagramPlayback;
    if (ns.ready) return;

    const canonical = (value) => window.EveAudioflixInstagramPlaylists?.parseUrls?.(value)?.[0] || '';
    const embedUrl = (url) => `${canonical(url)}embed/?utm_source=ig_embed`;

    function create(deps) {
        const { ensureStage, setStageStatus, emitPlayback, emitProgress, view } = deps;
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

        /** The resolver, when there is one. Returns null instead of throwing so callers can fall back.
         *
         * Direct Video is the only mode that needs EveOS localhost: it asks the bridge to extract the
         * real media URL. Focus and Full Embed are Instagram's own iframe and need nothing at all,
         * which is why they work straight from file://. */
        async function resolveDirect(item) {
            try {
                const result = await window.EveAudioflixNative?.resolveInstagramVideo?.(item?.url);
                return (result?.ok && result.videoUrl) ? result : null;
            } catch (error) {
                return null;
            }
        }

        async function showDirectVideo(host, item, preResolved) {
            setStageStatus('Resolving the Reel video through EveOS localhost...');
            const result = preResolved || await resolveDirect(item);
            if (!result) {
                throw new Error('Direct Video needs the EveOS localhost resolver. Focus and Full Embed play without it.');
            }
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

        /** The embed cropped down to just the video: no avatar, no like bar, no comment box. */
        function showFocus(canvas, item, url) {
            canvas.replaceChildren();
            // The Instagram embed cannot be asked for a bare video, so the chrome is cropped instead:
            // the iframe is pulled up past the profile header and run taller than its box, and the
            // box clips it. Same approach ReelDeck uses; the offsets live in the stylesheet.
            const crop = document.createElement('div');
            crop.className = 'audioflix-instagram-crop';
            const frame = document.createElement('iframe');
            frame.className = 'audioflix-instagram-embed';
            frame.src = embedUrl(url);
            frame.title = item.title || 'Instagram Reel';
            frame.loading = 'eager';
            frame.setAttribute('scrolling', 'no');
            frame.allow = 'autoplay; encrypted-media; picture-in-picture';
            frame.setAttribute('allowfullscreen', '');
            crop.append(frame);
            canvas.append(crop);
            setActive(makeFramePlayer(frame), item, true);
            setStageStatus('Focus view - video only.');
        }

        function showFullEmbed(canvas, item, url) {
            canvas.replaceChildren();
            const frame = document.createElement('iframe');
            frame.className = 'audioflix-instagram-embed';
            frame.src = embedUrl(url);
            frame.title = item.title || 'Instagram Reel';
            frame.loading = 'eager';
            frame.allow = 'autoplay; encrypted-media; picture-in-picture';
            frame.setAttribute('allowfullscreen', '');
            canvas.append(frame);
            setActive(makeFramePlayer(frame), item, true);
            setStageStatus('Full Instagram embed view.');
        }

        async function activateMode(mode, canvasEl, buttons, item, url) {
            clearTimer();
            buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.reelMode === mode));
            canvasEl.className = `audioflix-instagram-canvas is-${mode}`;
            if (mode === 'direct') return showDirectVideo(canvasEl, item);
            if (mode === 'focus') return showFocus(canvasEl, item, url);
            return showFullEmbed(canvasEl, item, url);
        }

        /** Reel view shell: the three modes, the source line, a close control, and the canvas. */
        function buildInspector(url) {
            const section = document.createElement('section');
            section.className = 'audioflix-instagram-inspector';

            const nav = document.createElement('nav');
            [['focus', 'Focus'], ['direct', 'Direct Video'], ['embed', 'Full Embed']]
                .forEach(([mode, label], index) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.reelMode = mode;
                    button.textContent = label;
                    if (index === 0) button.className = 'is-active';
                    nav.append(button);
                });
            const close = document.createElement('button');
            close.type = 'button';
            close.setAttribute('data-reel-close', '');
            close.className = 'audioflix-instagram-close';
            close.setAttribute('aria-label', 'Close Reel view');
            close.title = 'Close Reel view';
            close.textContent = '×';
            nav.append(close);

            const source = document.createElement('p');
            source.append(document.createTextNode('This reel is: '));
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = url;
            source.append(link);

            const canvas = document.createElement('div');
            canvas.className = 'audioflix-instagram-canvas is-focus';

            section.append(nav, source, canvas);
            return section;
        }

        async function playInstagram(item) {
            const url = canonical(item?.url);
            if (!url) throw new Error('This item is not a valid Instagram Reel or post URL.');
            clearTimer();
            const host = ensureStage(item, 'Instagram Reel', true);
            host.className = 'audioflix-provider-stage audioflix-instagram-stage';
            // The reel inspector is no longer what the internal player opens into. A linked reel is a
            // track first, so the plain player comes up and plays it; watching the reel is a second,
            // deliberate step behind this button, and closable again from inside.
            host.innerHTML = '<div class="audioflix-instagram-default">'
                + '<button type="button" data-reel-open>Open Reel view</button></div>'
                + '<div class="audioflix-instagram-canvas is-direct"></div>';
            const canvas = host.querySelector('.audioflix-instagram-canvas');

            const failed = (error) => {
                setStageStatus(error.message || 'The Reel view could not load.', true);
                emitPlayback(error.message || 'The Reel view could not load.', true);
            };

            // Wire the button BEFORE any media work. Loading used to happen first, so a resolver that
            // answered but could not produce a stream threw straight past this line: the button was
            // painted and never connected, and clicking it did nothing at all. Whatever the media
            // does, the way into the reel view has to survive it.
            wireOpenButton(host, item, url, failed);

            // Direct Video is preferred when the resolver is up: it is the only mode with a real play
            // bar and seeking. Without it the Instagram embed still plays, so a missing or unhelpful
            // resolver means "no scrub bar", not "no playback" -- this used to refuse outright.
            const direct = await resolveDirect(item);
            if (direct) {
                await showDirectVideo(canvas, item, direct);
            } else {
                canvas.className = 'audioflix-instagram-canvas is-focus';
                showFocus(canvas, item, url);
                setStageStatus('Playing the Reel through Instagram. Start EveOS localhost, or localize'
                    + ' this track, for a seek bar.');
            }
        }

        function wireOpenButton(host, item, url, failed) {
            host.querySelector('[data-reel-open]').addEventListener('click', () => {
                clearTimer();
                host.replaceChildren(buildInspector(url));
                const reelCanvas = host.querySelector('.audioflix-instagram-canvas');
                const buttons = [...host.querySelectorAll('[data-reel-mode]')];
                // Say up front whether Direct Video is reachable. Focus and Full Embed always are,
                // so an offline resolver should read as "this one mode is unavailable", not as a
                // broken player. Re-checked per open, since the server can come up mid-session.
                const directButton = host.querySelector('[data-reel-mode="direct"]');
                resolveDirect(item).then((available) => {
                    directButton.classList.toggle('is-available', !!available);
                    directButton.title = available
                        ? 'Resolved through EveOS localhost - real seeking and timeline'
                        : 'Needs EveOS localhost. Focus and Full Embed play without it.';
                });
                buttons.forEach((button) => button.addEventListener('click',
                    () => activateMode(button.dataset.reelMode, reelCanvas, buttons, item, url).catch(failed)));
                // Closing rebuilds the plain player rather than un-hiding it, so the reel view never
                // leaves an iframe alive in the background still holding audio.
                host.querySelector('[data-reel-close]').addEventListener('click',
                    () => playInstagram(item).catch(failed));
                activateMode('focus', reelCanvas, buttons, item, url).catch(failed);
            });
        }

        return { playInstagram };
    }

    Object.assign(ns, { ready: true, create, canonical, embedUrl });
})();
