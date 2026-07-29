window.EveAudioflixSoundLabEngine = window.EveAudioflixSoundLabEngine || {};

(function () {
    'use strict';
    const ns = window.EveAudioflixSoundLabEngine;
    if (ns.ready) return;

    const MODEL = 'models/lyria-realtime-exp';
    const API_VERSION = 'v1alpha';
    const SAMPLE_RATE = 48000;
    const listeners = new Set();
    let context = null, streamGain = null, mixBus = null, analyser = null;
    let masterGain = null, outputGain = null, recordDestination = null;
    let effectsRack = null, playback = null, nativeCapture = null, modulation = null;
    let connection = null, continuity = null, steering = null;
    let liveMasterVolume = 1;
    let nativeSendChain = Promise.resolve(), generation = 0;
    let transientScene = null;
    let modulationMetrics = { low: 0, mid: 0, high: 0, rms: 0, active: false };
    let status = {
        phase: 'idle',
        connectionState: 'idle',
        message: 'Ready when you are.',
        connected: false,
        playing: false,
        buffering: false,
        bufferedSeconds: 0,
        droppedChunks: 0,
        reconnectAttempts: 0,
        lastDisconnectReason: '',
        nativeProcessedRoute: false,
        filteredPrompt: ''
    };

    const soundState = () => window.EveAudioflixSoundLabState?.ensure?.() || {};
    const audioflixState = () => window.EveAudioflixState?.ensure?.() || {};

    function publish(patch) {
        status = Object.assign({}, status, patch || {});
        listeners.forEach((listener) => {
            try { listener(Object.assign({}, status)); } catch {}
        });
        window.dispatchEvent(new CustomEvent('eve:audioflix-soundlab-status', {
            detail: Object.assign({}, status)
        }));
        return status;
    }

    function getApiKey() {
        return window.EveAudioflixSoundLabSdk?.getApiKey?.() || '';
    }

    function setApiKey(value) {
        return window.EveAudioflixSoundLabSdk?.setApiKey?.(value) || false;
    }

    function setMasterVolume(value, persist = true) {
        const safe = Math.max(0, Math.min(1, Number(value) || 0));
        liveMasterVolume = safe;
        if (masterGain) masterGain.gain.setTargetAtTime(safe, context.currentTime, 0.02);
        if (persist) {
            window.EveAudioflixSoundLabState?.update?.({ masterVolume: safe }, 'audioflix-soundlab-volume');
        }
        return safe;
    }

    function applyEffects(next) {
        transientScene = null;
        return effectsRack?.apply?.(next || soundState().effects) || false;
    }

    async function ensureAudio() {
        if (context) return context;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Web Audio is unavailable in this browser.');
        context = new AudioContextCtor({ sampleRate: SAMPLE_RATE, latencyHint: 'playback' });
        streamGain = context.createGain();
        mixBus = context.createGain();
        analyser = context.createAnalyser();
        masterGain = context.createGain();
        outputGain = context.createGain();
        recordDestination = context.createMediaStreamDestination();
        effectsRack = window.EveAudioflixSoundLabEffects.create(context);
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.78;
        streamGain.connect(mixBus);
        mixBus.connect(effectsRack.input);
        effectsRack.output.connect(analyser);
        analyser.connect(masterGain);
        masterGain.connect(outputGain);
        masterGain.connect(recordDestination);
        outputGain.connect(context.destination);
        playback = window.EveAudioflixSoundLabPlayback.create({
            context: () => context,
            output: () => streamGain,
            isPlaying: () => status.playing,
            targetSeconds: () => soundState().bufferSeconds,
            publish
        });
        nativeCapture = window.EveAudioflixSoundLabNativeCapture?.create?.({
            context,
            source: masterGain,
            publish
        }) || null;
        modulation = window.EveAudioflixSoundLabModulation?.create?.({
            analyser: () => analyser,
            effects: () => effectsRack,
            state: () => transientScene
                ? Object.assign({}, soundState(), {
                    effects: transientScene.effects,
                    modulation: transientScene.modulation
                })
                : soundState(),
            publish: (metrics) => { modulationMetrics = metrics; }
        }) || null;
        applyEffects(soundState().effects);
        setMasterVolume(soundState().masterVolume, false);
        modulation?.start?.();
        await applyOutputRoute();
        return context;
    }

    async function applyOutputRoute() {
        if (!context) return false;
        const root = audioflixState();
        const sinkId = String(root.preferredSinkId || '').trim();
        if (typeof context.setSinkId === 'function') {
            try { await context.setSinkId(sinkId || ''); } catch {}
        }
        outputGain.gain.value = window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.() ? 0 : 1;
        return true;
    }

    function weightedPrompts(scene) {
        const prompts = (scene?.prompts || soundState().prompts || [])
            .map((prompt) => ({ text: String(prompt.text || '').trim(), weight: Number(prompt.weight || 0) }))
            .filter((prompt) => prompt.text && prompt.weight > 0);
        return prompts.length ? prompts : [{ text: 'ambient instrumental music', weight: 1 }];
    }

    function musicConfig(scene) {
        const config = scene?.config || soundState().config || {};
        const result = {
            bpm: Number(config.bpm),
            density: Number(config.density),
            brightness: Number(config.brightness),
            guidance: Number(config.guidance),
            temperature: Number(config.temperature),
            topK: Number(config.topK),
            musicGenerationMode: config.musicGenerationMode,
            muteBass: config.muteBass === true,
            muteDrums: config.muteDrums === true,
            onlyBassAndDrums: config.onlyBassAndDrums === true
        };
        if (config.scale && config.scale !== 'SCALE_UNSPECIFIED') result.scale = config.scale;
        if (Number(config.seed) > 0) result.seed = Number(config.seed);
        return result;
    }

    function ensureSteering() {
        if (!steering) {
            steering = window.EveAudioflixSoundLabSteering.create({
                getSession: () => connection?.getSession?.(),
                getPrompts: weightedPrompts,
                getConfig: musicConfig,
                publish
            });
        }
        return steering;
    }

    const applySteering = (options, targetSession) => ensureSteering().apply(options, targetSession);
    const queueSteering = (options) => ensureSteering().queue(options);
    const clearSteeringQueue = () => steering?.clear?.();

    function routeNativeChunk(data) {
        if (!window.EveAudioflixNative?.sendGeminiChunk) return;
        const token = generation;
        nativeSendChain = nativeSendChain.then(async () => {
            if (token !== generation || audioflixState().nativeBridgeEnabled !== true) return;
            const routed = window.EveAudioflixSoundLabCodec.transformPcm16Base64(data, {
                channels: 2,
                gain: liveMasterVolume,
                stereoBalance: true
            });
            await window.EveAudioflixNative.sendGeminiChunk(routed, {
                sampleRate: SAMPLE_RATE,
                channels: 2
            });
        }).catch(() => {});
    }

    function handleMessage(message) {
        if (message?.filteredPrompt) {
            const filtered = message.filteredPrompt;
            publish({
                filteredPrompt: String(filtered.text || ''),
                message: `Prompt filtered: ${filtered.filteredReason || filtered.text || 'review that prompt'}`
            });
        }
        const chunks = message?.serverContent?.audioChunks || [];
        chunks.forEach((chunk) => {
            if (!chunk?.data || !context) return;
            try {
                const buffer = window.EveAudioflixSoundLabCodec.pcm16ToAudioBuffer(context, chunk.data, {
                    channels: 2,
                    sampleRate: SAMPLE_RATE
                });
                const dropped = playback?.enqueue(buffer) || 0;
                if (dropped) publish({ droppedChunks: status.droppedChunks + dropped });
                if (audioflixState().nativeBridgeEnabled === true && !nativeCapture?.isActive?.()) {
                    routeNativeChunk(chunk.data);
                }
            } catch (error) {
                publish({ phase: 'error', message: error?.message || 'Music PCM decode failed.' });
            }
        });
    }
    async function startLiveSession(liveSession) {
        try {
            await Promise.resolve(liveSession.play());
            playback?.start();
        } catch (error) {
            continuity?.setIntent?.('paused'); await nativeCapture?.stop?.();
            publish({ phase: 'error', playing: false, buffering: false, message: error?.message || 'Could not start generation.' });
            throw error;
        }
    }
    function ensureManagers() {
        ensureSteering();
        if (connection && continuity) return;
        continuity = window.EveAudioflixSoundLabContinuity.create({
            policy: () => soundState().continuity,
            publish,
            recover: async () => {
                const liveSession = await connection.connect();
                await ensureAudio();
                await applyOutputRoute();
                if (context.state === 'suspended') await context.resume();
                generation += 1;
                if (audioflixState().nativeBridgeEnabled === true) await nativeCapture?.start?.();
                publish({
                    phase: 'playing',
                    connectionState: 'playing',
                    connected: true,
                    playing: true,
                    buffering: true,
                    message: 'Recovery connected; resuming music stream...'
                });
                await startLiveSession(liveSession);
            }
        });
        connection = window.EveAudioflixSoundLabConnection.create({
            model: MODEL,
            apiVersion: API_VERSION,
            getApiKey,
            loadSdk: () => window.EveAudioflixSoundLabSdk.load(),
            ensureAudio,
            publish,
            onMessage: handleMessage,
            configureSession: (liveSession) => applySteering({}, liveSession),
            onClose(detail) {
                steering?.reset?.();
                playback?.stop();
                nativeCapture?.stop?.().catch(() => {});
                publish({
                    phase: 'error',
                    connectionState: 'disconnected',
                    connected: false,
                    playing: false,
                    buffering: false,
                    lastDisconnectReason: detail.message,
                    message: detail.message
                });
                continuity.onDisconnect(detail);
            }
        });
    }

    async function connect() {
        ensureManagers();
        const liveSession = await connection.connect();
        continuity.markConnected();
        return liveSession;
    }

    async function play() {
        const liveSession = await connect();
        await ensureAudio();
        await applyOutputRoute();
        if (context.state === 'suspended') await context.resume();
        generation += 1;
        if (audioflixState().nativeBridgeEnabled === true) {
            await window.EveAudioflixNative?.stopStream?.();
            await nativeCapture?.start?.();
        } else {
            await nativeCapture?.stop?.();
        }
        continuity.setIntent('playing');
        publish({
            phase: 'playing',
            connectionState: 'playing',
            playing: true,
            buffering: true,
            message: 'Starting music stream...'
        });
        await startLiveSession(liveSession);
        return true;
    }

    async function pause() {
        continuity?.setIntent?.('paused');
        connection?.getSession?.()?.pause?.();
        if (context?.state === 'running') await context.suspend();
        playback?.pause();
        await nativeCapture?.stop?.();
        publish({
            phase: 'paused',
            connectionState: 'paused',
            playing: false,
            buffering: false,
            message: 'Paused.'
        });
    }

    async function stop() {
        continuity?.setIntent?.('stopped');
        generation += 1;
        connection?.getSession?.()?.stop?.();
        playback?.stop();
        await nativeCapture?.stop?.();
        await window.EveAudioflixNative?.stopStream?.();
        publish({
            phase: connection?.getSession?.() ? 'ready' : 'idle',
            connectionState: connection?.getSession?.() ? 'ready' : 'idle',
            playing: false,
            message: connection?.getSession?.() ? 'Stopped. Prompts retained.' : 'Stopped.'
        });
    }

    function resetContext() {
        connection?.getSession?.()?.resetContext?.();
        publish({ message: 'Generation context reset; prompts and controls retained.' });
    }

    async function disconnect() {
        generation += 1;
        continuity?.setIntent?.('stopped');
        continuity?.cancel?.();
        clearSteeringQueue();
        playback?.stop();
        await nativeCapture?.stop?.();
        connection?.disconnect?.();
        if (context?.state === 'running') await context.suspend();
        publish({
            phase: 'idle',
            connectionState: 'idle',
            connected: false,
            playing: false,
            message: 'Disconnected.'
        });
    }

    function applyScene(scene, options) {
        if (!scene) return false;
        transientScene = options?.transient === true ? scene : null;
        effectsRack?.apply?.(scene.effects);
        setMasterVolume(scene.masterVolume, false);
        if (options?.steer !== false) queueSteering({ scene });
        return true;
    }

    function diagnostics() {
        return {
            playback: playback?.metrics?.() || {},
            native: nativeCapture?.getStats?.() || {},
            modulation: Object.assign({}, modulationMetrics),
            effects: effectsRack?.metrics?.() || {},
            connection: connection?.getState?.() || {},
            continuity: continuity?.getState?.() || {}
        };
    }

    Object.assign(ns, {
        ready: true,
        connect,
        play,
        pause,
        stop,
        disconnect,
        resetContext,
        applySteering,
        queueSteering,
        applyOutputRoute,
        applyEffects,
        applyScene,
        setMasterVolume,
        getApiKey,
        setApiKey,
        getStatus: () => Object.assign({}, status),
        getDiagnostics: diagnostics,
        getTimeline: () => playback?.timeline() || {
            elapsedSeconds: 0,
            generatedSeconds: 0,
            bufferedSeconds: 0,
            running: false,
            jitterMs: 0,
            underruns: 0,
            lowWaterSeconds: 0
        },
        getAnalyser: () => analyser,
        getRecordingStream: () => recordDestination?.stream || null,
        getAudioContext: () => context,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            listener(Object.assign({}, status));
            return () => listeners.delete(listener);
        }
    });
})();
