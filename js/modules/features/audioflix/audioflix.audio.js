window.EveAudioflixAudio = window.EveAudioflixAudio || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixAudio;
    if (ns.ready) return;

    let audio = null;
    let waveformController = null;
    let currentItem = null;
    let lastStatus = 'Idle';
    let activeNativeController = null;
    let activeNativeBuffer = null;
    let activeNativeMode = '';
    let nativePausedAt = 0;
    let nativeGeneration = 0;
    // One-time console notice for the normal "bridge off -> browser playback" mode; reset when a
    // native send succeeds again so a mid-session server restart re-announces cleanly.
    let nativeFallbackNoticeShown = false;
    let activeStreamVolume = 1.0;
    let urlPlayback = null;

    async function getDecodedBuffer(url) {
        return window.EveAudioflixAudioCodec.getDecodedBuffer(
            url,
            () => waveformController?.getContext?.()
        );
    }

    function encodeBufferToBase64(audioBuffer, startAt = 0) {
        return window.EveAudioflixAudioCodec.encodeBufferToBase64(audioBuffer, startAt);
    }

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function dispatch(name, detail) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    urlPlayback = window.EveAudioflixUrlPlayback?.createController?.({
        onPlayback(detail) {
            currentItem = detail.item || currentItem;
            lastStatus = detail.status || lastStatus;
            dispatch('eve:audioflix-playback', detail);
        },
        onProgress(detail) { dispatch('eve:audioflix-progress', detail); },
        onPlayer(player) { waveformController?.attachPlayer?.(player); },
        // Queue View's prev/next/jump. The queue itself belongs to the UI, so it registers a
        // bridge rather than this layer duplicating the ordering, shuffle and loop rules.
        onStep: (delta) => queueBridge?.step?.(delta),
        onJump: (index) => queueBridge?.jump?.(index)
    }) || null;
    let queueBridge = null;
    function setQueueBridge(bridge) { queueBridge = bridge || null; }
    function syncQueueView() {
        urlPlayback?.setQueue?.(queueBridge?.list?.() || [], queueBridge?.index?.() ?? 0);
    }
    // Speed applies to the library element AND whatever the URL controller is driving, so a rate
    // picked in either internal view survives a switch between them.
    function setPlaybackRate(rate) {
        const safe = Math.max(0.25, Math.min(4, Number(rate) || 1));
        try { ensureAudio().playbackRate = safe; } catch { /* element not built yet */ }
        urlPlayback?.setRate?.(safe);
        return safe;
    }

    // Native buffered playback (voice + stream lanes) lives in its own module. The native state
    // stays here (getPlaybackState/pause/seek read it directly), reached via this accessor bag.
    const nativeRuntime = {
        get controller() { return activeNativeController; }, set controller(v) { activeNativeController = v; },
        get buffer() { return activeNativeBuffer; }, set buffer(v) { activeNativeBuffer = v; },
        get mode() { return activeNativeMode; }, set mode(v) { activeNativeMode = v; },
        get pausedAt() { return nativePausedAt; }, set pausedAt(v) { nativePausedAt = v; },
        get generation() { return nativeGeneration; }, set generation(v) { nativeGeneration = v; },
        get streamVolume() { return activeStreamVolume; }, set streamVolume(v) { activeStreamVolume = v; },
        get lastStatus() { return lastStatus; }, set lastStatus(v) { lastStatus = v; }
    };
    const { nativeProgress, finishNative, startNativeBuffer, stopNativePlayback } =
        window.EveAudioflixAudioNative.createController({
            runtime: nativeRuntime, dispatch, getCurrentItem: () => currentItem, encodeBufferToBase64
        });

    function getPlaybackState() {
        if (urlPlayback?.isActive?.()) return urlPlayback.getPlaybackState();
        if (activeNativeMode) {
            const duration = Number(activeNativeBuffer?.duration || currentItem?.resolvedDuration || 0) || 0;
            const currentTime = activeNativeController?.currentTime?.() ?? nativePausedAt;
            return { item: currentItem, currentTime, duration, paused: !activeNativeController, native: true };
        }
        const player = audio;
        return {
            item: currentItem,
            currentTime: Number(player?.currentTime || 0) || 0,
            duration: Number.isFinite(player?.duration) ? player.duration : Number(currentItem?.resolvedDuration || 0) || 0,
            paused: player?.paused !== false,
            native: false
        };
    }

    function ensureAudio() {
        if (audio) return audio;
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.preload = 'metadata';
        audio.addEventListener('play', function () {
            activeNativeMode = '';
            activeNativeBuffer = null;
            nativePausedAt = 0;
            lastStatus = `Playing ${currentItem?.title || 'audio'}${activeBrowserRouteLabel ? ` -> ${activeBrowserRouteLabel}` : ''}`;
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            dispatch('eve:audioflix-progress', getPlaybackState());
            waveformController?.start?.();
        });
        audio.addEventListener('pause', function () {
            if (activeNativeMode) return;
            lastStatus = 'Paused';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            dispatch('eve:audioflix-progress', getPlaybackState());
        });
        audio.addEventListener('ended', function () {
            // Natural end: let the routed device play out its remaining cushion instead of having
            // the tail cleared (that truncation is what sounded like a freeze at the end).
            musicCapture?.stop({ drain: true });
            lastStatus = 'Ended';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            dispatch('eve:audioflix-progress', getPlaybackState());
        });
        ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
                if (currentItem && audio.duration && isFinite(audio.duration) && audio.duration > 0 && (!currentItem.duration || currentItem.duration <= 0)) {
                    currentItem.duration = audio.duration;
                    window.EveAudioflixState?.updateItem?.(currentItem.type || 'music', currentItem.id, { duration: audio.duration });
                }
                if (!activeNativeMode) dispatch('eve:audioflix-progress', getPlaybackState());
            });
        });
        audio.addEventListener('error', function () {
            lastStatus = 'Audio failed to load';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem, error: true });
        });
        return audio;
    }

    waveformController = window.EveAudioflixAudioWaveform?.createController?.(ensureAudio) || null;

    const outputRuntime = {
        get lastStatus() { return lastStatus; },
        set lastStatus(value) { lastStatus = value; },
        get currentItem() { return currentItem; },
        set currentItem(value) { currentItem = value; }
    };
    const outputController = window.EveAudioflixAudioOutput.createController({
        ensureAudio, getAudioContext: () => waveformController?.getContext?.(),
        state,
        dispatch,
        runtime: outputRuntime
    });
    const {
        applySink,
        selectOutput,
        listOutputs,
        setOutputById,
        unlockDeviceLabels,
        tryNativePlayback,
        browserOutputStatus,
        resolvePlaybackSink,
        routeBrowserStream
    } = outputController;

    // Label of the endpoint the continuous browser music stream was routed to (for status text).
    let activeBrowserRouteLabel = '';
    const musicCapture = window.EveAudioflixAudioCapture?.createController?.(
        { getWaveform: () => waveformController, getPlayer: () => audio, getVolume: () => activeStreamVolume }) || null;

    async function playUrlItem(item, playOptions = {}) {
        if (!urlPlayback?.canHandle?.(item)) throw new Error('This linked track needs the EveOS resolver server.');
        if (audio) audio.pause();
        await stopNativePlayback(false);
        currentItem = item;
        await urlPlayback.play(item, playOptions);
        window.EveAudioflixState?.recordPlay?.(item);
        return true;
    }

    async function openInternalView(item) {
        const prepared = await window.EveAudioflixLocalPlayback?.prepare?.(item);
        const requestedItem = prepared?.item || (item && typeof item === 'object' ? { ...item } : {});
        if (prepared?.status) lastStatus = prepared.status;
        if (!requestedItem.url) throw new Error('Audioflix item is missing a URL.');
        let playableItem = requestedItem;
        if (window.EveAudioflixAudioSource?.needsResolution?.(requestedItem.url)) {
            try { playableItem = await window.EveAudioflixAudioSource.resolveItem(requestedItem); }
            catch { /* Provider playback remains available when the resolver is offline. */ }
        }
        return playUrlItem(playableItem, { internalView: true });
    }

    async function playItem(item) {
        let prepared;
        try {
            prepared = await window.EveAudioflixLocalPlayback?.prepare?.(item);
        } catch (error) {
            lastStatus = error?.message || 'The local audio source is unavailable.';
            throw error;
        }
        const requestedItem = prepared?.item || (item && typeof item === 'object' ? { ...item } : {});
        if (prepared?.status) lastStatus = prepared.status;
        if (!requestedItem.url) throw new Error('Audioflix item is missing a URL.');

        const needsResolution = window.EveAudioflixAudioSource?.needsResolution?.(requestedItem.url);
        if (urlPlayback?.shouldPreferBrowser?.(requestedItem) && !needsResolution) {
            try { return await playUrlItem(requestedItem); }
            catch (error) {
                if (window.EveAudioflixNative?.getStatus?.()?.ok !== true) throw error;
            }
        } else if (urlPlayback?.isActive?.() && !urlPlayback.matches(requestedItem)) {
            await urlPlayback.stop();
        }

        if (activeNativeMode && activeNativeBuffer && nativePausedAt > 0
            && currentItem?.id === requestedItem.id
            && window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
            currentItem = Object.assign({}, currentItem, { volume: requestedItem.volume ?? currentItem.volume });
            await startNativeBuffer(activeNativeBuffer, currentItem, nativePausedAt, activeNativeMode);
            lastStatus = `Playing ${currentItem.title || 'audio'}`;
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem, native: true });
            return true;
        }

        await stopNativePlayback(false);
        let safeItem = requestedItem;
        if (needsResolution) {
            lastStatus = `Resolving audio stream for ${safeItem.title || 'link'}...`;
            dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem });
            try {
                safeItem = await window.EveAudioflixAudioSource.resolveItem(safeItem);
            } catch (error) {
                try { return await playUrlItem(safeItem); }
                catch (fallbackError) {
                    lastStatus = `Could not play ${safeItem.title || 'audio link'}: ${fallbackError.message || error.message}`;
                    dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem, error: true });
                    throw fallbackError;
                }
            }
        }

        // Soundboard clips take the BUFFERED native route (short to decode, and buffering is what
        // makes them mixable voices). Music must not decode here — a whole track costs seconds
        // before the first sample (the play->sound lag); it is tapped live below instead.
        if (safeItem.type === 'sound' && window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
            try {
                lastStatus = `Decoding ${safeItem.title || 'audio'}...`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem });
                const audioBuffer = await getDecodedBuffer(safeItem.url);
                currentItem = safeItem;
                lastStatus = `Native route playing ${safeItem.title || 'audio'} -> ${state().nativeOutputLabel || 'selected output'}`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem, native: true });
                waveformController?.playBufferWaveform?.(audioBuffer);
                await startNativeBuffer(audioBuffer, safeItem, 0);
                nativeFallbackNoticeShown = false;
                window.EveAudioflixState?.recordPlay?.(safeItem);
                return true;
            } catch (err) {
                await stopNativePlayback(false).catch(() => {});
                if (await tryNativePlayback(safeItem).catch(() => false)) return true;
                // Bridge simply not running (file:// with the server off) is a NORMAL mode, not an
                // error — say so once and play through the browser. Real failures still warn.
                if (String(err?.message || '').includes('Native bridge unreachable')) {
                    if (!nativeFallbackNoticeShown) {
                        nativeFallbackNoticeShown = true;
                        console.info('[Audioflix] Native bridge offline — playing through the browser route instead.');
                    }
                } else {
                    console.warn('[Audioflix] native stream failed, falling back:', err);
                }
            }
        }

        const player = ensureAudio();
        waveformController?.attachPlayer?.(player);
        currentItem = safeItem;
        player.volume = activeStreamVolume = window.EveAudioflixState.normalizeVolume(safeItem.volume, 1);
        // Music on the native EveOS route plays through the element (instant, seekable, no
        // whole-track decode) with local output silenced and its live PCM streamed to the bridge.
        const nativeMusic = safeItem.type === 'music'
            && window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.() && await musicCapture?.start();
        if (!nativeMusic) musicCapture?.stop();
        activeBrowserRouteLabel = nativeMusic ? (state().nativeOutputLabel || 'native route') : (await routeBrowserStream(safeItem) || '');
        if (player.src !== safeItem.url) player.src = safeItem.url;
        try {
            await player.play();
        } catch (error) {
            if (!/^https?:\/\//i.test(safeItem.url || '')) throw error;
            player.pause();
            player.removeAttribute('src');
            player.load();
            return await playUrlItem(safeItem);
        }
        window.EveAudioflixState?.recordPlay?.(safeItem);
        return true;
    }

    const playTestSignal = window.EveAudioflixAudioTest?.createController?.({
        playItem,
        state,
        dispatch,
        setStatus(value) { lastStatus = value; }
    }) || (async () => false);
    const layerController = window.EveAudioflixAudioLayers.createController({
        state, tryNativePlayback, getDecodedBuffer, encodeBufferToBase64, playUrlItem,
        canPlayUrl: (item) => urlPlayback?.canHandle?.(item),
        shouldPreferUrl: (item) => urlPlayback?.shouldPreferBrowser?.(item)
    });
    const layerPlay = layerController.layerPlay;

    function stopItemLayers(itemId) {
        layerController.stopItemLayers(itemId);
        if (currentItem?.id === itemId) {
            musicCapture?.stop();
            urlPlayback?.stop?.().catch?.(() => {});
            stopNativePlayback(false).catch(() => {});
            const player = ensureAudio();
            player.pause();
            try { player.currentTime = 0; } catch {}
            lastStatus = 'Stopped';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            dispatch('eve:audioflix-progress', { item: currentItem, currentTime: 0, duration: Number(player.duration || 0) || 0, paused: true });
        }
    }

    async function stopAll() {
        const stoppedItem = currentItem;
        const pending = layerController.stopAll();
        musicCapture?.stop();
        if (audio) {
            audio.pause();
            try { audio.currentTime = 0; audio.removeAttribute('src'); audio.load(); } catch {}
        }
        await urlPlayback?.stop?.().catch?.(() => {});
        await stopNativePlayback(false).catch(() => {});
        await Promise.allSettled(pending);
        currentItem = null;
        lastStatus = 'Stopped';
        dispatch('eve:audioflix-playback', { status: lastStatus, item: stoppedItem });
        dispatch('eve:audioflix-progress', { item: stoppedItem, currentTime: 0, duration: 0, paused: true });
    }

    async function pause() {
        if (urlPlayback?.isActive?.()) return urlPlayback.pause();
        if (activeNativeMode) {
            await stopNativePlayback(true);
            lastStatus = 'Paused';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem, native: true });
            nativeProgress(nativePausedAt, activeNativeBuffer?.duration || 0, true);
            return;
        }
        ensureAudio().pause();
    }

    async function seek(seconds) {
        const target = Math.max(0, Number(seconds || 0) || 0);
        if (urlPlayback?.isActive?.()) return urlPlayback.seek(target);
        if (activeNativeMode && activeNativeBuffer) {
            const duration = activeNativeBuffer.duration || 0;
            const next = Math.min(target, duration);
            const wasPlaying = !!activeNativeController;
            const mode = activeNativeMode;
            const buffer = activeNativeBuffer;
            await stopNativePlayback(true);
            nativePausedAt = next;
            if (wasPlaying) await startNativeBuffer(buffer, currentItem, next, mode);
            else nativeProgress(next, duration, true);
            return true;
        }
        const player = ensureAudio();
        if (!Number.isFinite(player.duration) || player.duration <= 0) return false;
        player.currentTime = Math.min(target, player.duration);
        dispatch('eve:audioflix-progress', getPlaybackState());
        return true;
    }

    function updateItemVolume(itemId, vol) {
        if (currentItem?.id === itemId) {
            if (urlPlayback?.matches?.(itemId)) urlPlayback.setVolume(vol);
            ensureAudio().volume = Math.max(0, Math.min(1, vol));
            window.EveAudioflixNative?.setVoiceVolume?.('singleton-main', vol);
            activeStreamVolume = vol;
            activeNativeController?.setVolume?.(vol);
            currentItem.volume = vol;
        }
        layerController.updateVolume(itemId, vol);
    }

    function attachWaveform(targetCanvas) {
        waveformController?.attach?.(targetCanvas);
        const internalPlayer = urlPlayback?.getAudioElement?.();
        if (targetCanvas && internalPlayer?._eveAudioflixWaveformSafe) {
            waveformController?.attachPlayer?.(internalPlayer);
        }
    }

    Object.assign(ns, {
        ready: true, playItem, openInternalView, pause, seek, selectOutput, listOutputs, setOutputById,
        unlockDeviceLabels, playTestSignal, applySink, attachWaveform, browserOutputStatus, resolvePlaybackSink,
        layerPlay, stopItemLayers, stopAll, updateItemVolume, getDecodedBuffer, encodeBufferToBase64,
        getAudioElement: ensureAudio, getPlaybackState,
        setQueueBridge, syncQueueView, setPlaybackRate,
        isInternalViewOpen: () => urlPlayback?.isInternalViewOpen?.() === true,
        closeInternalView: () => urlPlayback?.closeInternalView?.(),
        getPlaybackRate: () => urlPlayback?.getRate?.() ?? 1,
        getMusicCapture: () => musicCapture,
        getWaveformController: () => waveformController,
        getStatus() {
            const o = browserOutputStatus();
            return { status: lastStatus, item: currentItem, playback: getPlaybackState(), sinkId: o.activeSinkId, hasSetSinkId: o.hasSetSinkId, hasAudioContextSink: o.hasAudioContextSink, hasOutputPicker: o.hasOutputPicker, hasEnumerate: o.hasEnumerate, secureContext: o.secureContext };
        }
    });
})();
