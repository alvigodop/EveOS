window.EveAudioflixSoundLabEngine = window.EveAudioflixSoundLabEngine || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabEngine;
    if (ns.ready) return;

    const MODEL = 'models/lyria-realtime-exp';
    const SAMPLE_RATE = 48000;
    const SESSION_KEY = 'eveAudioflixSoundLabApiKey';
    const listeners = new Set();
    const sources = new Set();
    let sdkPromise = null;
    let context = null;
    let mixBus = null;
    let analyser = null;
    let masterGain = null;
    let outputGain = null;
    let recordDestination = null;
    let session = null;
    let setupResolve = null;
    let setupReject = null;
    let pending = [];
    let nextStartTime = 0;
    let streamStarted = false;
    let steeringTimer = 0;
    let nativeSendChain = Promise.resolve();
    let generation = 0;
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

    function loadSdk() {
        if (window.EveAudioflixGenAI?.GoogleGenAI) return Promise.resolve(window.EveAudioflixGenAI);
        if (sdkPromise) return sdkPromise;
        sdkPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-audioflix-genai-sdk]');
            const script = existing || document.createElement('script');
            const timeout = window.setTimeout(() => reject(new Error('Google GenAI SDK load timed out.')), 15000);
            const finish = () => {
                window.clearTimeout(timeout);
                if (window.EveAudioflixGenAI?.GoogleGenAI) resolve(window.EveAudioflixGenAI);
                else reject(new Error('Google GenAI SDK did not initialize.'));
            };
            script.addEventListener('load', finish, { once: true });
            script.addEventListener('error', () => {
                window.clearTimeout(timeout);
                reject(new Error('Could not load the local Google GenAI SDK bundle.'));
            }, { once: true });
            if (!existing) {
                script.dataset.audioflixGenaiSdk = '1';
                script.src = new URL('js/vendor/audioflix-genai.js?v=2.13.0', document.baseURI).href;
                document.head.appendChild(script);
            }
        }).catch((error) => {
            sdkPromise = null;
            throw error;
        });
        return sdkPromise;
    }

    function getApiKey() {
        try {
            return String(sessionStorage.getItem(SESSION_KEY)
                || localStorage.getItem('geminiApiKey')
                || '').trim();
        } catch {
            return '';
        }
    }

    function setApiKey(value) {
        const key = String(value || '').trim();
        try {
            if (key) sessionStorage.setItem(SESSION_KEY, key);
            else sessionStorage.removeItem(SESSION_KEY);
        } catch {}
        return !!key;
    }

    async function ensureAudio() {
        if (context) return context;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Web Audio is unavailable in this browser.');
        context = new AudioContextCtor({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
        mixBus = context.createGain();
        analyser = context.createAnalyser();
        masterGain = context.createGain();
        outputGain = context.createGain();
        recordDestination = context.createMediaStreamDestination();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.78;
        mixBus.connect(analyser);
        analyser.connect(masterGain);
        masterGain.connect(outputGain);
        masterGain.connect(recordDestination);
        outputGain.connect(context.destination);
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
            scale: config.scale,
            musicGenerationMode: config.musicGenerationMode,
            muteBass: config.muteBass === true,
            muteDrums: config.muteDrums === true,
            onlyBassAndDrums: config.onlyBassAndDrums === true
        };
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

    function queueSteering(options) {
        if (steeringTimer) window.clearTimeout(steeringTimer);
        steeringTimer = window.setTimeout(() => {
            steeringTimer = 0;
            applySteering(options).catch((error) => publish({
                phase: 'error',
                message: error?.message || 'Could not update music controls.'
            }));
        }, 140);
    }

    function stopScheduled() {
        sources.forEach((source) => {
            try { source.stop(); } catch {}
        });
        sources.clear();
        pending = [];
        nextStartTime = 0;
        streamStarted = false;
        publish({ buffering: false, bufferedSeconds: 0 });
    }

    function pendingSeconds() {
        return pending.reduce((total, buffer) => total + Number(buffer.duration || 0), 0);
    }

    function scheduleBuffers() {
        if (!context || !status.playing || context.state === 'suspended') return;
        const target = Number(soundState().bufferSeconds || 0.65);
        const available = pendingSeconds();
        if (!streamStarted && available < target) {
            publish({ buffering: true, bufferedSeconds: available, message: `Buffering ${available.toFixed(1)}s...` });
            return;
        }
        if (!streamStarted) {
            streamStarted = true;
            nextStartTime = Math.max(context.currentTime + 0.12, nextStartTime);
        }
        while (pending.length && nextStartTime < context.currentTime + 3) {
            const buffer = pending.shift();
            const source = context.createBufferSource();
            const fade = context.createGain();
            const start = Math.max(nextStartTime, context.currentTime + 0.04);
            const end = start + buffer.duration;
            source.buffer = buffer;
            fade.gain.setValueAtTime(0.0001, start);
            fade.gain.linearRampToValueAtTime(1, start + Math.min(0.012, buffer.duration / 4));
            fade.gain.setValueAtTime(1, Math.max(start + 0.012, end - 0.012));
            fade.gain.linearRampToValueAtTime(0.0001, end);
            source.connect(fade);
            fade.connect(mixBus);
            source.onended = () => {
                sources.delete(source);
                try { source.disconnect(); fade.disconnect(); } catch {}
                if (!pending.length && !sources.size && status.playing) {
                    streamStarted = false;
                    publish({ buffering: true, bufferedSeconds: 0, message: 'Waiting for the next music phrase...' });
                }
            };
            sources.add(source);
            source.start(start);
            nextStartTime = end;
        }
        publish({
            buffering: false,
            bufferedSeconds: Math.max(0, nextStartTime - context.currentTime) + pendingSeconds(),
            message: 'Generating and playing.'
        });
    }

    function routeNativeChunk(data) {
        if (!window.EveAudioflixNative?.sendGeminiChunk) return;
        const token = generation;
        nativeSendChain = nativeSendChain.then(async () => {
            if (token !== generation || audioflixState().nativeBridgeEnabled !== true) return;
            await window.EveAudioflixNative.sendGeminiChunk(data, { sampleRate: SAMPLE_RATE, channels: 2 });
        }).catch(() => {});
    }

    function handleMessage(message) {
        if (message?.setupComplete) setupResolve?.(true);
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
                pending.push(buffer);
                while (pendingSeconds() > 12 && pending.length > 1) {
                    pending.shift();
                    status.droppedChunks += 1;
                }
                if (audioflixState().nativeBridgeEnabled === true) routeNativeChunk(chunk.data);
                scheduleBuffers();
            } catch (error) {
                publish({ phase: 'error', message: error?.message || 'Music PCM decode failed.' });
            }
        });
    }

    async function connect() {
        if (session) return session;
        const apiKey = getApiKey();
        if (!apiKey) throw new Error('Add a Gemini API key for this session before connecting.');
        publish({ phase: 'connecting', message: 'Connecting Sonic Forge...', filteredPrompt: '' });
        await ensureAudio();
        const sdk = await loadSdk();
        const ai = new sdk.GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
        let timeout = 0;
        const setup = new Promise((resolve, reject) => {
            setupResolve = resolve;
            setupReject = reject;
            timeout = window.setTimeout(() => reject(new Error('Lyria setup timed out.')), 12000);
        });
        try {
            session = await ai.live.music.connect({
                model: MODEL,
                callbacks: {
                    onmessage: handleMessage,
                    onerror: (event) => {
                        const message = event?.error?.message || event?.message || 'Lyria connection error.';
                        setupReject?.(new Error(message));
                        publish({ phase: 'error', message });
                    },
                    onclose: () => {
                        session = null;
                        stopScheduled();
                        publish({ phase: 'idle', connected: false, playing: false, message: 'Sonic Forge disconnected.' });
                    }
                }
            });
            await setup;
            await applySteering();
            publish({ phase: 'ready', connected: true, message: 'Connected. Press play to generate.' });
            return session;
        } catch (error) {
            try { session?.close?.(); } catch {}
            session = null;
            publish({ phase: 'error', connected: false, playing: false, message: error?.message || 'Could not connect.' });
            throw error;
        } finally {
            window.clearTimeout(timeout);
            setupResolve = setupReject = null;
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
        liveSession.play();
        scheduleBuffers();
        return true;
    }

    async function pause() {
        session?.pause?.();
        if (context?.state === 'running') await context.suspend();
        publish({ phase: 'paused', playing: false, buffering: false, message: 'Paused.' });
    }

    async function stop() {
        generation += 1;
        session?.stop?.();
        stopScheduled();
        await window.EveAudioflixNative?.stopStream?.();
        publish({ phase: session ? 'ready' : 'idle', playing: false, message: session ? 'Stopped. Prompts retained.' : 'Stopped.' });
    }

    function resetContext() {
        session?.resetContext?.();
        publish({ message: 'Generation context reset; prompts and controls retained.' });
    }

    async function disconnect() {
        generation += 1;
        stopScheduled();
        try { session?.close?.(); } catch {}
        session = null;
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
