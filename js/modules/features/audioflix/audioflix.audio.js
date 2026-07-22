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
    const activeLayers = new Map();
    let activeStreamVolume = 1.0;

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

    function nativeProgress(currentTime, duration, paused = false) {
        dispatch('eve:audioflix-progress', {
            item: currentItem,
            currentTime: Math.max(0, Number(currentTime || 0)),
            duration: Math.max(0, Number(duration || 0)),
            paused,
            native: true
        });
    }

    function getPlaybackState() {
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

    function finishNative(generation) {
        if (generation !== nativeGeneration) return;
        const duration = Number(activeNativeBuffer?.duration || 0) || 0;
        activeNativeController = null;
        activeNativeMode = '';
        activeNativeBuffer = null;
        nativePausedAt = 0;
        lastStatus = 'Ended';
        dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem, native: true });
        nativeProgress(duration, duration, true);
    }

    async function startNativeBuffer(buffer, item, startAt = 0, requestedMode = '') {
        const mode = requestedMode || (item.type === 'sound' ? 'voice' : 'stream');
        const generation = ++nativeGeneration;
        activeNativeBuffer = buffer;
        activeNativeMode = mode;
        nativePausedAt = 0;
        activeStreamVolume = window.EveAudioflixState.normalizeVolume(item.volume, 1);

        const timelineOptions = {
            duration: buffer.duration,
            startAt,
            onProgress: (current, duration) => generation === nativeGeneration && nativeProgress(current, duration),
            onEnded: () => finishNative(generation)
        };

        if (mode === 'voice') {
            const accepted = await window.EveAudioflixNative?.playVoice?.(encodeBufferToBase64(buffer, startAt), {
                sampleRate: buffer.sampleRate,
                channels: 1,
                volume: activeStreamVolume,
                voiceId: 'singleton-main',
                replace: true
            });
            if (accepted !== true) throw new Error('Native bridge unreachable for voice playback');
            activeNativeController = window.EveAudioflixAudioBridge?.createTimeline?.(timelineOptions) || null;
            return true;
        }

        const controller = window.EveAudioflixAudioBridge?.createStream?.({
            buffer,
            startAt,
            volume: activeStreamVolume,
            sendChunk: (payload, detail) => window.EveAudioflixNative?.sendGeminiChunk?.(payload, detail),
            stopRemote: () => window.EveAudioflixNative?.stopStream?.(),
            onProgress: timelineOptions.onProgress,
            onEnded: timelineOptions.onEnded,
            onError(error) {
                if (generation !== nativeGeneration) return;
                activeNativeController = null;
                activeNativeMode = '';
                activeNativeBuffer = null;
                lastStatus = error?.message || 'Native stream failed';
                dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem, native: true, error: true });
            }
        });
        activeNativeController = controller;
        if (!controller || await controller.ready !== true) throw new Error('Native stream did not start.');
        return true;
    }

    async function stopNativePlayback(keepPosition = false) {
        if (!activeNativeMode) return;
        const mode = activeNativeMode;
        const controller = activeNativeController;
        const position = controller?.currentTime?.() ?? nativePausedAt;
        nativeGeneration += 1;
        activeNativeController = null;
        if (mode === 'stream') await controller?.stop?.({ clearRemote: true });
        else {
            controller?.stop?.();
            await window.EveAudioflixNative?.clearVoices?.('singleton-main');
        }
        if (keepPosition) nativePausedAt = position;
        else {
            nativePausedAt = 0;
            activeNativeMode = '';
            activeNativeBuffer = null;
        }
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
            lastStatus = `Playing ${currentItem?.title || 'audio'}`;
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
            lastStatus = 'Ended';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            dispatch('eve:audioflix-progress', getPlaybackState());
        });
        ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked'].forEach((eventName) => {
            audio.addEventListener(eventName, () => {
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
        browserOutputStatus
    } = outputController;
    async function playItem(item) {
        const requestedItem = item && typeof item === 'object' ? { ...item } : {};
        if (!requestedItem.url) throw new Error('Audioflix item is missing a URL.');

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
        if (window.EveAudioflixAudioSource?.needsResolution?.(safeItem.url)) {
            lastStatus = `Resolving audio stream for ${safeItem.title || 'link'}...`;
            dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem });
            try {
                safeItem = await window.EveAudioflixAudioSource.resolveItem(safeItem);
            } catch (error) {
                lastStatus = `Could not resolve ${safeItem.title || 'audio link'}: ${error.message}`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem, error: true });
                throw error;
            }
        }

        if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
            try {
                lastStatus = `Decoding ${safeItem.title || 'audio'}...`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem });
                const audioBuffer = await getDecodedBuffer(safeItem.url);
                currentItem = safeItem;
                lastStatus = `Native route playing ${safeItem.title || 'audio'} -> ${state().nativeOutputLabel || 'selected output'}`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem, native: true });
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
                        console.info('[Audioflix] Native bridge offline — playing soundboard through the browser route instead.');
                    }
                } else {
                    console.warn('[Audioflix] native stream failed, falling back:', err);
                }
            }
        }

        const player = ensureAudio();
        currentItem = safeItem;
        player.volume = window.EveAudioflixState.normalizeVolume(safeItem.volume, 1);
        const preferredSinkId = state().preferredSinkId;
        if (preferredSinkId) {
            try { await applySink(preferredSinkId); } catch { }
        }
        if (player.src !== safeItem.url) player.src = safeItem.url;
        await player.play();
        window.EveAudioflixState?.recordPlay?.(safeItem);
        return true;
    }

    const playTestSignal = window.EveAudioflixAudioTest?.createController?.({
        playItem,
        state,
        dispatch,
        setStatus(value) { lastStatus = value; }
    }) || (async () => false);

    async function layerPlay(item) {
        if (!item?.url) return;
        let safeItem = typeof item === 'object' ? { ...item } : { url: item };

        if (window.EveAudioflixAudioSource?.needsResolution?.(safeItem.url)) {
            try {
                safeItem = await window.EveAudioflixAudioSource.resolveItem(safeItem);
            } catch (resErr) {
                console.warn('[Audioflix] Failed to resolve stream URL for layer:', resErr);
                return;
            }
        }

        if (await tryNativePlayback(safeItem)) return;

        if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
            try {
                const audioBuffer = await getDecodedBuffer(safeItem.url);
                const id = safeItem.id || safeItem.url;
                // One POST of the whole clip -> the bridge mixes it as a voice. Overlapping
                // presses sum cleanly (no chunk interleave) and start with low latency.
                const ok = await window.EveAudioflixNative.playVoice(encodeBufferToBase64(audioBuffer), {
                    sampleRate: audioBuffer.sampleRate, channels: 1, volume: safeItem.volume ?? 1, voiceId: id
                });
                if (ok) {
                    // One stop-control per item; clearVoices(id) flushes all its layers.
                    activeLayers.set(id, [{ stop: () => window.EveAudioflixNative?.clearVoices?.(id) }]);
                    return;
                }
            } catch (err) {
                console.warn('[Audioflix] native voice failed for layer, falling back:', err);
            }
        }

        const a = new Audio(safeItem.url);
        a.loop = false;
        a.volume = window.EveAudioflixState.normalizeVolume(safeItem.volume, 1);
        const preferredSinkId = state().preferredSinkId;
        if (preferredSinkId && typeof a.setSinkId === 'function') {
            try { await a.setSinkId(preferredSinkId); } catch {}
        }
        const id = safeItem.id || safeItem.url;
        if (!activeLayers.has(id)) activeLayers.set(id, []);
        activeLayers.get(id).push(a);
        a.addEventListener('ended', () => {
            const arr = activeLayers.get(id);
            if (arr) { const idx = arr.indexOf(a); if (idx > -1) arr.splice(idx, 1); if (!arr.length) activeLayers.delete(id); }
        });
        a.play().catch(() => {});
    }

    function stopItemLayers(itemId) {
        const arr = activeLayers.get(itemId);
        if (arr) { 
            arr.forEach(a => { 
                try { 
                    if (typeof a.stop === 'function') a.stop();
                    else { a.pause(); a.currentTime = 0; }
                } catch {} 
            }); 
            activeLayers.delete(itemId); 
        }
        if (currentItem?.id === itemId) {
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
        const pending = [];
        activeLayers.forEach((layers) => layers.forEach((layer) => {
            try {
                if (typeof layer?.stop === 'function') {
                    const result = layer.stop();
                    if (result?.then) pending.push(result);
                } else if (layer) {
                    layer.pause?.();
                    layer.currentTime = 0;
                }
            } catch {}
        }));
        activeLayers.clear();
        if (audio) {
            audio.pause();
            try { audio.currentTime = 0; audio.removeAttribute('src'); audio.load(); } catch {}
        }
        await stopNativePlayback(false).catch(() => {});
        await Promise.allSettled(pending);
        currentItem = null;
        lastStatus = 'Stopped';
        dispatch('eve:audioflix-playback', { status: lastStatus, item: stoppedItem });
        dispatch('eve:audioflix-progress', { item: stoppedItem, currentTime: 0, duration: 0, paused: true });
    }

    async function pause() {
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
            ensureAudio().volume = Math.max(0, Math.min(1, vol));
            window.EveAudioflixNative?.setVoiceVolume?.('singleton-main', vol);
            activeStreamVolume = vol;
            activeNativeController?.setVolume?.(vol);
            currentItem.volume = vol;
        }
        const arr = activeLayers.get(itemId);
        if (arr) {
            arr.forEach(a => {
                if (a && typeof a.volume !== 'undefined') a.volume = Math.max(0, Math.min(1, vol));
            });
            window.EveAudioflixNative?.setVoiceVolume?.(itemId, vol);
        }
    }

    function attachWaveform(targetCanvas) {
        waveformController?.attach?.(targetCanvas);
    }

    Object.assign(ns, {
        ready: true, playItem, pause, seek, selectOutput, listOutputs, setOutputById,
        unlockDeviceLabels, playTestSignal, applySink, attachWaveform, browserOutputStatus,
        layerPlay, stopItemLayers, stopAll, updateItemVolume, getDecodedBuffer, encodeBufferToBase64,
        getAudioElement: ensureAudio, getPlaybackState,
        getStatus() {
            const o = browserOutputStatus();
            return { status: lastStatus, item: currentItem, playback: getPlaybackState(), sinkId: o.activeSinkId, hasSetSinkId: o.hasSetSinkId, hasAudioContextSink: o.hasAudioContextSink, hasOutputPicker: o.hasOutputPicker, hasEnumerate: o.hasEnumerate, secureContext: o.secureContext };
        }
    });
})();
