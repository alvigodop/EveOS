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
        // Bumped by every view change. Async work started before a change checks this before touching
        // the DOM: resolveDirect can take seconds on file://, and clicking through in the meantime
        // used to let the stale continuation render an embed into a DETACHED canvas -- an invisible
        // iframe that kept playing and could not be closed, because nothing still pointed at it.
        let generation = 0;

        function stopActive() {
            try { view.active?.player?.destroy?.(); } catch (error) { /* already gone */ }
            view.active = null;
        }

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

        /** The embed reduced to just the video: no avatar, no like bar, no comment box.
         *
         * Two mechanisms, because one is not enough. The iframe is offset up past the profile header
         * and run taller than its box, which an aspect-ratio'd crop clips -- that removes the top.
         * The bottom needs a cover instead: the embed is cross-origin, so its internal height cannot
         * be measured, and no arithmetic reliably lands on the end of the video. ReelDeck solves it
         * the same way, with an opaque strip over the leftover "View more / likes / comment" band.
         */
        function showFocus(canvas, item, url) {
            canvas.replaceChildren();
            const stage = document.createElement('div');
            stage.className = 'audioflix-instagram-focus-stage';
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
            const cover = document.createElement('div');
            cover.className = 'audioflix-instagram-cover';
            stage.append(crop, cover);
            canvas.append(stage);
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
            stopActive();
            const mine = ++generation;
            const host = ensureStage(item, 'Instagram Reel', true);
            host.className = 'audioflix-provider-stage audioflix-instagram-stage';
            // A chain, not a pile: opening a reel gives the plain player and one button. Nothing
            // embeds itself here. Rendering the reel automatically stacked a second media box under
            // the button on open, which is what read as several panels appearing at once.
            host.innerHTML = '<div class="audioflix-instagram-default">'
                + '<button type="button" data-reel-open>Open Reel view</button></div>'
                + '<div class="audioflix-instagram-canvas is-direct"></div>';
            const canvas = host.querySelector('.audioflix-instagram-canvas');

            const failed = (error) => {
                setStageStatus(error.message || 'The Reel view could not load.', true);
                emitPlayback(error.message || 'The Reel view could not load.', true);
            };

            // Wired before any media work: loading first meant a resolver that answered but produced
            // no stream threw past this line, leaving the button painted and dead.
            wireOpenButton(host, item, url, failed);

            const direct = await resolveDirect(item);
            // The view may have moved on during that await -- opened the reel view, or started
            // another track. Writing into `canvas` now would render into a detached node.
            if (mine !== generation) return;
            if (direct) {
                await showDirectVideo(canvas, item, direct);
                return;
            }
            setStageStatus('Reel ready. Open Reel view to play it - without EveOS localhost,'
                + ' the Instagram player is the only one available.');
        }

        function wireOpenButton(host, item, url, failed) {
            host.querySelector('[data-reel-open]').addEventListener('click', () => {
                clearTimer();
                stopActive();
                const mine = ++generation;
                host.replaceChildren(buildInspector(url));
                const reelCanvas = host.querySelector('.audioflix-instagram-canvas');
                const buttons = [...host.querySelectorAll('[data-reel-mode]')];
                // Say up front whether Direct Video is reachable. Focus and Full Embed always are,
                // so an offline resolver should read as "this one mode is unavailable", not as a
                // broken player. Re-checked per open, since the server can come up mid-session.
                const directButton = host.querySelector('[data-reel-mode="direct"]');
                resolveDirect(item).then((available) => {
                    if (mine !== generation || !directButton.isConnected) return;
                    directButton.classList.toggle('is-available', !!available);
                    directButton.title = available
                        ? 'Resolved through EveOS localhost - real seeking and timeline'
                        : 'Needs EveOS localhost. Focus and Full Embed play without it.';
                });
                buttons.forEach((button) => button.addEventListener('click', () => {
                    if (mine !== generation) return;
                    activateMode(button.dataset.reelMode, reelCanvas, buttons, item, url).catch(failed);
                }));
                // Close tears the player down explicitly before rebuilding. Dropping the reference
                // alone left the iframe loaded and audible with nothing pointing at it, so the reel
                // kept playing after the close and could not be reached again.
                host.querySelector('[data-reel-close]').addEventListener('click', () => {
                    clearTimer();
                    stopActive();
                    playInstagram(item).catch(failed);
                });
                activateMode('focus', reelCanvas, buttons, item, url).catch(failed);
            });
        }

        return { playInstagram };
    }

    Object.assign(ns, { ready: true, create, canonical, embedUrl });
})();
