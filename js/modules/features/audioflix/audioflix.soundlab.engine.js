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
    let playback = null;
    let liveMasterVolume = 1;
    let session = null, connectPromise = null;
    let connectionToken = 0, pendingSocket = null;
    let steeringTimer = 0, steeringBusy = false, steeringPending = null, lastSteeringAt = 0;
    let nativeSendChain = Promise.resolve(), generation = 0;
    let status = {
        phase: 'idle',
        message: 'Ready when you are.',
        connected: false,
        playing: false,
        buffering: false,
        bufferedSeconds: 0,
        droppedChunks: 0,
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

    async function ensureAudio() {
        if (context) return context;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Web Audio is unavailable in this browser.');
        context = new AudioContextCtor({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
        streamGain = context.createGain();
        mixBus = context.createGain();
        analyser = context.createAnalyser();
        masterGain = context.createGain();
        outputGain = context.createGain();
        recordDestination = context.createMediaStreamDestination();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.78;
        streamGain.connect(mixBus);
        mixBus.connect(analyser);
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
        setMasterVolume(soundState().masterVolume, false);
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

    function setMasterVolume(value, persist = true) {
        const safe = Math.max(0, Math.min(1, Number(value) || 0));
        liveMasterVolume = safe;
        if (masterGain) masterGain.gain.setTargetAtTime(safe, context.currentTime, 0.02);
        if (persist) {
            window.EveAudioflixSoundLabState?.update?.({ masterVolume: safe }, 'audioflix-soundlab-volume');
        }
        return safe;
    }

    function weightedPrompts() {
        const prompts = (soundState().prompts || [])
            .map((prompt) => ({ text: String(prompt.text || '').trim(), weight: Number(prompt.weight || 0) }))
            .filter((prompt) => prompt.text && prompt.weight > 0);
        return prompts.length ? prompts : [{ text: 'ambient instrumental music', weight: 1 }];
    }

    function musicConfig() {
        const config = soundState().config || {};
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

    async function applySteering(options) {
        if (!session) return false;
        await session.setWeightedPrompts({ weightedPrompts: weightedPrompts() });
        await session.setMusicGenerationConfig({ musicGenerationConfig: musicConfig() });
        if (options?.resetContext) session.resetContext?.();
        return true;
    }

    function scheduleSteering() {
        if (steeringTimer || steeringBusy || !steeringPending) return;
        const wait = Math.max(0, 180 - (performance.now() - lastSteeringAt));
        steeringTimer = window.setTimeout(async () => {
            steeringTimer = 0;
            const options = steeringPending;
            steeringPending = null;
            steeringBusy = true;
            lastSteeringAt = performance.now();
            try {
                await applySteering(options);
            } catch (error) {
                publish({
                    phase: 'error',
                    message: error?.message || 'Could not update music controls.'
                });
            } finally {
                steeringBusy = false;
                scheduleSteering();
            }
        }, wait);
    }

    function queueSteering(options) {
        steeringPending = {
            resetContext: steeringPending?.resetContext === true || options?.resetContext === true
        };
        scheduleSteering();
    }

    function clearSteeringQueue() {
        if (steeringTimer) window.clearTimeout(steeringTimer);
        steeringTimer = 0;
        steeringPending = null;
    }

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
            await window.EveAudioflixNative.sendGeminiChunk(routed, { sampleRate: SAMPLE_RATE, channels: 2 });
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
                    sampleRate: SAMPLE_RATE,
                    stereoBalance: true
                });
                status.droppedChunks += playback?.enqueue(buffer) || 0;
                if (audioflixState().nativeBridgeEnabled === true) routeNativeChunk(chunk.data);
            } catch (error) {
                publish({ phase: 'error', message: error?.message || 'Music PCM decode failed.' });
            }
        });
    }

    async function connectAttempt(token) {
        const isCurrent = () => token === connectionToken;
        const apiKey = getApiKey();
        if (!apiKey) throw new Error('Save a Gemini API key in Search Monitor > Session Controls before connecting.');
        publish({ phase: 'connecting', message: 'Connecting Sonic Forge...', filteredPrompt: '' });
        await ensureAudio();
        const sdk = await window.EveAudioflixSoundLabSdk.load();
        if (!isCurrent()) throw new Error('Sonic Forge connection cancelled.');
        const ai = new sdk.GoogleGenAI({ apiKey, apiVersion: API_VERSION });
        let timeout = 0;
        let connectionExpired = false;
        let setupComplete = false;
        let resolveSetup = null;
        let connectedSession = null;
        let attemptSocket = null;
        let lastFailure = null;
        const setup = new Promise((resolve) => { resolveSetup = resolve; });
        let transportReject = null;
        const transportFailure = new Promise((_, reject) => {
            transportReject = reject;
        });
        const deadline = new Promise((_, reject) => {
            timeout = window.setTimeout(() => {
                connectionExpired = true;
                try { attemptSocket?.close?.(); } catch {}
                reject(new Error('Lyria connection timed out. Try reconnecting.'));
            }, 20000);
        });
        try {
            const connectSocket = window.EveGeminiApiFailure?.connectWithNormalizedWebSocket
                || ((callback) => callback());
            const connection = connectSocket(() => ai.live.music.connect({
                model: MODEL,
                callbacks: {
                    onmessage: (message) => {
                        if (!isCurrent()) return;
                        if (message?.setupComplete) {
                            setupComplete = true;
                            resolveSetup?.(true);
                        }
                        handleMessage(message);
                    },
                    onerror: (event) => {
                        if (!isCurrent()) return;
                        const failure = window.EveGeminiApiFailure.classify(event);
                        lastFailure = failure;
                        const error = new Error(failure.message);
                        if (!setupComplete) {
                            resolveSetup?.({ error });
                            transportReject?.(error);
                        }
                        publish({ phase: 'error', message: failure.message });
                    },
                    onclose: (event) => {
                        if (!isCurrent()) return;
                        const classified = window.EveGeminiApiFailure.classify(event);
                        const failure = classified.kind === 'unknown'
                            && lastFailure
                            && lastFailure.kind !== 'unknown'
                            ? lastFailure
                            : classified;
                        const code = Number(event?.code) || 0;
                        const reason = String(event?.reason || '').trim();
                        const message = failure.kind !== 'unknown'
                            ? failure.message
                            : (setupComplete
                                ? (reason || 'Sonic Forge disconnected.')
                                : `Lyria closed before setup completed${code ? ` (code ${code})` : ''}${reason ? `: ${reason}` : '.'}`);
                        if (!setupComplete) {
                            const error = new Error(message);
                            resolveSetup?.({ error });
                            transportReject?.(error);
                        }
                        if (!connectedSession || session === connectedSession) session = null;
                        pendingSocket = null;
                        playback?.stop();
                        publish({
                            phase: failure.kind === 'unknown' && setupComplete ? 'idle' : 'error',
                            connected: false,
                            playing: false,
                            message
                        });
                    }
                }
            }), {
                onSocket(socket) {
                    attemptSocket = socket;
                    if (isCurrent()) pendingSocket = socket;
                    else try { socket?.close?.(); } catch {}
                }
            });
            connection.then((lateSession) => {
                if (connectionExpired || !isCurrent()) {
                    try { lateSession?.close?.(); } catch {}
                }
            }).catch(() => {});
            connectedSession = await Promise.race([connection, transportFailure, deadline]);
            const setupResult = await Promise.race([setup, deadline]);
            if (setupResult?.error) throw setupResult.error;
            if (!isCurrent()) {
                try { connectedSession?.close?.(); } catch {}
                throw new Error('Sonic Forge connection cancelled.');
            }
            session = connectedSession;
            pendingSocket = null;
            await applySteering();
            publish({ phase: 'ready', connected: true, message: 'Connected. Press play to generate.' });
            return session;
        } catch (error) {
            connectionExpired = true;
            try { connectedSession?.close?.(); } catch {}
            try { attemptSocket?.close?.(); } catch {}
            if (session === connectedSession) session = null;
            if (pendingSocket === attemptSocket) pendingSocket = null;
            if (isCurrent()) publish({
                phase: 'error',
                connected: false,
                playing: false,
                message: error?.message || 'Could not connect.'
            });
            throw error;
        } finally {
            window.clearTimeout(timeout);
            resolveSetup = null;
            transportReject = null;
        }
    }

    async function connect() {
        if (session) return session;
        if (connectPromise) return connectPromise;
        const token = ++connectionToken;
        connectPromise = connectAttempt(token);
        try {
            return await connectPromise;
        } finally {
            if (token === connectionToken) connectPromise = null;
        }
    }

    async function play() {
        const liveSession = await connect();
        await ensureAudio();
        await applyOutputRoute();
        if (context.state === 'suspended') await context.resume();
        generation += 1;
        if (audioflixState().nativeBridgeEnabled === true) await window.EveAudioflixNative?.stopStream?.();
        publish({ phase: 'playing', playing: true, buffering: true, message: 'Starting music stream...' });
        await Promise.resolve(liveSession.play());
        playback?.start();
        return true;
    }

    async function pause() {
        session?.pause?.();
        if (context?.state === 'running') await context.suspend();
        playback?.pause();
        publish({ phase: 'paused', playing: false, buffering: false, message: 'Paused.' });
    }

    async function stop() {
        generation += 1;
        session?.stop?.();
        playback?.stop();
        await window.EveAudioflixNative?.stopStream?.();
        publish({ phase: session ? 'ready' : 'idle', playing: false, message: session ? 'Stopped. Prompts retained.' : 'Stopped.' });
    }

    function resetContext() {
        session?.resetContext?.();
        publish({ message: 'Generation context reset; prompts and controls retained.' });
    }

    async function disconnect() {
        generation += 1;
        connectionToken += 1;
        clearSteeringQueue();
        connectPromise = null;
        const closingSocket = pendingSocket;
        const closingSession = session;
        pendingSocket = null;
        session = null;
        playback?.stop();
        try { closingSocket?.close?.(); } catch {}
        try { closingSession?.close?.(); } catch {}
        if (context?.state === 'running') await context.suspend();
        publish({ phase: 'idle', connected: false, playing: false, message: 'Disconnected.' });
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
        setMasterVolume,
        getApiKey,
        setApiKey,
        getStatus: () => Object.assign({}, status),
        getTimeline: () => playback?.timeline() || {
            elapsedSeconds: 0,
            generatedSeconds: 0,
            bufferedSeconds: 0,
            running: false
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
