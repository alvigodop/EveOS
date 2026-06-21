window.EveAudioflixAudio = window.EveAudioflixAudio || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixAudio;
    if (ns.ready) return;

    let audio = null;
    let context = null;
    let source = null;
    let analyser = null;
    let canvas = null;
    let canvasCtx = null;
    let animationFrame = 0;
    let currentItem = null;
    let lastStatus = 'Idle';
    let activeStreamTimer = null;
    let isStreamPlaying = false;
    const activeLayers = new Map();
    // Cache decoded AudioBuffers by URL so retriggering the SAME sound is instant
    // (skip the fetch + decodeAudioData that otherwise runs on every press).
    const decodedBufferCache = new Map();
    const MAX_DECODED_CACHE = 80;
    let activeStreamVolume = 1.0;

    async function getDecodedBuffer(url) {
        if (decodedBufferCache.has(url)) return decodedBufferCache.get(url);
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const audioCtx = context || ensureGraph() || new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (decodedBufferCache.size >= MAX_DECODED_CACHE) {
            decodedBufferCache.delete(decodedBufferCache.keys().next().value); // evict oldest
        }
        decodedBufferCache.set(url, audioBuffer);
        return audioBuffer;
    }

    // Encode a whole AudioBuffer (channel 0) to base64 16-bit PCM, in chunks to avoid
    // the O(n^2) string concat the per-chunk streamer used. For one-shot voice sends.
    function encodeBufferToBase64(audioBuffer) {
        const float = audioBuffer.getChannelData(0);
        const n = float.length;
        const int16 = new Int16Array(n);
        for (let i = 0; i < n; i++) {
            const s = Math.max(-1, Math.min(1, float[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const bytes = new Uint8Array(int16.buffer);
        let binary = '';
        const STEP = 0x8000;
        for (let i = 0; i < bytes.length; i += STEP) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
        }
        return btoa(binary);
    }

    function stopActiveStream() {
        if (activeStreamTimer) {
            clearInterval(activeStreamTimer);
            activeStreamTimer = null;
        }
        isStreamPlaying = false;
    }

    async function streamPCMToBridge(audioBuffer, sampleRate, volume, isLayer = false) {
        // Smaller chunks + a send-AHEAD scheduler keep the bridge's output queue filled
        // ahead of the device clock. The previous code sent exactly 0.25s every 250ms
        // (just-in-time, zero headroom), so any HTTP/timer jitter underran the queue and
        // the bridge filled silence -> choppy. We pre-buffer LEAD_SECONDS and keep that
        // much audio queued in front of real-time, which absorbs the jitter.
        const CHUNK_SECONDS = 0.1;     // finer granularity than 0.25 -> smoother top-ups
        const LEAD_SECONDS = 0.8;      // keep ~0.8s queued ahead of playback as a cushion
        const TOP_UP_MS = 40;          // re-check the lead often
        let playingFlag = true;
        let timerId = null;
        let done = false;
        if (!isLayer) {
            stopActiveStream();
            isStreamPlaying = true;
            activeStreamVolume = volume;
        }
        const floatSamples = audioBuffer.getChannelData(0);
        const totalSamples = floatSamples.length;
        const chunkSize = Math.max(1, Math.floor(sampleRate * CHUNK_SECONDS));
        let offset = 0;
        let sentSeconds = 0;
        const clock = (typeof performance !== 'undefined' ? performance : Date);
        const startTime = clock.now();
        const elapsedSeconds = () => (clock.now() - startTime) / 1000;

        const finish = () => {
            if (done) return;
            done = true;
            if (timerId) { clearInterval(timerId); timerId = null; }
            playingFlag = false;
            if (!isLayer) {
                stopActiveStream();
                lastStatus = 'Ended';
                dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            }
        };

        const sendOneChunk = async () => {
            const count = Math.min(chunkSize, totalSamples - offset);
            const intSamples = new Int16Array(count);
            for (let i = 0; i < count; i++) {
                const s = Math.max(-1, Math.min(1, floatSamples[offset + i] * activeStreamVolume));
                intSamples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            const uint8 = new Uint8Array(intSamples.buffer);
            let binary = '';
            for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
            await window.EveAudioflixNative?.sendGeminiChunk?.(btoa(binary), { sampleRate, channels: 1 });
            offset += count;
            sentSeconds += count / sampleRate;
        };

        // Send whatever is needed to keep ~LEAD_SECONDS of audio queued ahead of "now".
        const pump = async () => {
            if (isLayer ? !playingFlag : !isStreamPlaying) { finish(); return; }
            while (offset < totalSamples && sentSeconds < elapsedSeconds() + LEAD_SECONDS) {
                await sendOneChunk();
            }
            if (offset >= totalSamples) finish();
        };

        await pump(); // pre-buffer the lead up front before any pacing
        if (!done) {
            timerId = setInterval(pump, TOP_UP_MS);
            if (!isLayer) activeStreamTimer = timerId;
        }
        return { stop: () => { finish(); } };
    }

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function dispatch(name, detail) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    function ensureAudio() {
        if (audio) return audio;
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.preload = 'metadata';
        audio.addEventListener('play', function () {
            lastStatus = `Playing ${currentItem?.title || 'audio'}`;
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
            startWaveform();
        });
        audio.addEventListener('pause', function () {
            lastStatus = 'Paused';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
        });
        audio.addEventListener('ended', function () {
            lastStatus = 'Ended';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem });
        });
        audio.addEventListener('error', function () {
            lastStatus = 'Audio failed to load';
            dispatch('eve:audioflix-playback', { status: lastStatus, item: currentItem, error: true });
        });
        return audio;
    }

    function ensureGraph() {
        const player = ensureAudio();
        if (!context) {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextCtor) return null;
            context = new AudioContextCtor();
        }
        if (!source) {
            source = context.createMediaElementSource(player);
            analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            analyser.connect(context.destination);
        }
        return context;
    }

    function fitCanvas() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(240, Math.floor(rect.width * dpr));
        const height = Math.max(64, Math.floor(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        canvasCtx = canvas.getContext('2d');
    }

    function drawWaveform() {
        if (!canvas || !canvasCtx || !analyser) return;
        fitCanvas();
        const width = canvas.width;
        const height = canvas.height;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        canvasCtx.clearRect(0, 0, width, height);
        const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#00d4ff');
        gradient.addColorStop(0.5, '#9cffad');
        gradient.addColorStop(1, '#ffca5f');
        canvasCtx.strokeStyle = gradient;
        canvasCtx.lineWidth = Math.max(2, width / 420);
        canvasCtx.beginPath();
        const slice = width / data.length;
        for (let i = 0; i < data.length; i += 1) {
            const x = i * slice;
            const y = (data[i] / 255) * height;
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
        }
        canvasCtx.stroke();
        animationFrame = requestAnimationFrame(drawWaveform);
    }

    function startWaveform() {
        try {
            ensureGraph();
            if (context?.state === 'suspended') context.resume();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            drawWaveform();
        } catch (error) {
            console.warn('[Audioflix] waveform unavailable for this source:', error);
        }
    }

    async function applySink(deviceId) {
        const player = ensureAudio();
        if (!deviceId || typeof player.setSinkId !== 'function') return false;
        await player.setSinkId(deviceId);
        return true;
    }

    async function selectOutput() {
        const devices = navigator.mediaDevices || {};
        if (typeof devices.selectAudioOutput !== 'function') {
            lastStatus = 'Browser output picker unavailable';
            dispatch('eve:audioflix-playback', { status: lastStatus, unsupported: true });
            return false;
        }
        const device = await devices.selectAudioOutput();
        if (!device?.deviceId) return false;
        return await commitOutput(device.deviceId, device.label || 'Selected output device');
    }

    // Persist a chosen output device and route both Audioflix's own player and the
    // live Gemini voice context to it (so picking "CABLE Input" arms the mic-spoof).
    async function commitOutput(deviceId, label) {
        const applied = await applySink(deviceId);
        window.EveAudioflixState?.update?.({
            preferredSinkId: deviceId,
            preferredSinkLabel: label || 'Selected output device',
            routeMode: 'browser-selective'
        }, 'audioflix-output-device');
        try { await window.EveAudioflixGemini?.applyVoiceSink?.(window.audioInputContext); } catch { }
        lastStatus = applied ? `Output routed to ${label || 'selected device'}` : 'Output saved for supported browsers';
        dispatch('eve:audioflix-playback', { status: lastStatus, deviceId, label });
        return true;
    }

    // Enumerate available audio output devices for the in-app dropdown picker.
    // Labels are only populated in a secure context after a media permission has
    // been granted at least once; we still return ids so selection works.
    async function listOutputs() {
        const devices = navigator.mediaDevices || {};
        if (typeof devices.enumerateDevices !== 'function') return [];
        try {
            const all = await devices.enumerateDevices();
            return all
                .filter((d) => d.kind === 'audiooutput')
                .map((d, i) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Output device ${i + 1}`,
                    anonymous: !d.label
                }));
        } catch (error) {
            console.warn('[Audioflix] enumerateDevices failed:', error);
            return [];
        }
    }

    function hasNamedOutputs(list) {
        return (list || []).some((device) => device && device.label && !device.anonymous);
    }

    async function unlockDeviceLabels() {
        const devices = navigator.mediaDevices || {};

        // Browsers only expose audio-output device NAMES in a secure context (https or
        // http://localhost). On file:// or a LAN IP, getUserMedia can't reveal them, so
        // "Grant Output Access" can never work there. Say so plainly + point to the fix.
        if (window.isSecureContext !== true || typeof devices.enumerateDevices !== 'function') {
            lastStatus = 'Output names need a secure page. Open EveOS at http://localhost:8765 (not file://) to unlock names, or use the Native Bridge / Windows Mixer below.';
            dispatch('eve:audioflix-playback', { status: lastStatus, insecure: true });
            return false;
        }

        let micPermissionTried = false;
        let stream = null;
        try {
            if (typeof devices.getUserMedia === 'function') {
                micPermissionTried = true;
                // Hold an active mic capture and enumerate WHILE it is live; Chromium/Edge
                // expose labels lazily, so retry briefly before giving up. Track is stopped
                // in finally so we never leave the mic open.
                stream = await devices.getUserMedia({ audio: true, video: false });
                for (let attempt = 0; attempt < 4; attempt += 1) {
                    if (hasNamedOutputs(await listOutputs())) {
                        lastStatus = 'Audio output names unlocked. Pick CABLE Input from the list.';
                        dispatch('eve:audioflix-playback', { status: lastStatus, labelsUnlocked: true });
                        return true;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }
            }
            if (typeof devices.selectAudioOutput === 'function') {
                const device = await devices.selectAudioOutput();
                if (device?.deviceId) {
                    await commitOutput(device.deviceId, device.label || 'Selected output device');
                    lastStatus = `Output access granted for ${device.label || 'selected output'}.`;
                    dispatch('eve:audioflix-playback', { status: lastStatus, labelsUnlocked: true });
                    return true;
                }
            }
            lastStatus = micPermissionTried
                ? 'Mic permission is granted, but Edge is still hiding output names. Try "Pick Browser Output", the Native Bridge, or Windows Mixer.'
                : 'Cannot unlock device names here; use Pick Browser Output, Native Bridge, or Windows Mixer.';
            dispatch('eve:audioflix-playback', { status: lastStatus, unsupported: true });
            return false;
        } catch (error) {
            lastStatus = error?.name === 'NotAllowedError'
                ? 'Microphone access was blocked, so output names stay hidden. Allow the mic for this site, then try Grant Output Access again.'
                : (error?.message || 'Device-name unlock was blocked');
            dispatch('eve:audioflix-playback', { status: lastStatus, error: true });
            return false;
        } finally {
            if (stream) stream.getTracks().forEach((track) => { try { track.stop(); } catch { } });
        }
    }

    async function setOutputById(deviceId, label) {
        if (!deviceId) return false;
        return await commitOutput(deviceId, label || 'Selected output device');
    }

    async function tryNativePlayback(safeItem) {
        if (safeItem.type === 'sound') return false; // Force soundboard sounds to use voice playback path for layering/volume support!
        if (!window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) return false;
        const isWav = String(safeItem.url || '').toLowerCase().split('?')[0].split('#')[0].endsWith('.wav');
        if (!isWav) return false;
        const payload = await window.EveAudioflixNative?.playMediaItem?.(safeItem);
        if (payload?.ok !== true) {
            return false;
        }
        currentItem = safeItem;
        lastStatus = `Native route playing ${safeItem.title || 'audio'} -> ${state().nativeOutputLabel || 'selected output'}`;
        dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem, native: true, payload });
        window.EveAudioflixState?.recordPlay?.(safeItem);
        return true;
    }

    async function playItem(item) {
        stopActiveStream();
        const safeItem = item && typeof item === 'object' ? item : {};
        if (!safeItem.url) throw new Error('Audioflix item is missing a URL.');
        if (await tryNativePlayback(safeItem)) return true;

        if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
            try {
                lastStatus = `Decoding ${safeItem.title || 'audio'}...`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem });
                const audioBuffer = await getDecodedBuffer(safeItem.url);
                currentItem = safeItem;
                lastStatus = `Native route playing ${safeItem.title || 'audio'} -> ${state().nativeOutputLabel || 'selected output'}`;
                dispatch('eve:audioflix-playback', { status: lastStatus, item: safeItem, native: true });
                
                if (safeItem.type === 'sound') {
                    // Fast non-choppy voice upload for soundboard clips, matching layerPlay
                    window.EveAudioflixNative?.clearVoices?.('singleton-main');
                    window.EveAudioflixNative?.playVoice(encodeBufferToBase64(audioBuffer), {
                        sampleRate: audioBuffer.sampleRate,
                        channels: 1,
                        volume: safeItem.volume ?? 1,
                        voiceId: 'singleton-main'
                    }).catch(()=>{});
                } else {
                    // Stream long audio
                    await streamPCMToBridge(audioBuffer, audioBuffer.sampleRate, safeItem.volume ?? 1);
                }
                
                window.EveAudioflixState?.recordPlay?.(safeItem);
                return true;
            } catch (err) {
                console.warn('[Audioflix] native stream failed, falling back:', err);
            }
        }

        const player = ensureAudio();
        currentItem = safeItem;
        player.volume = Math.max(0, Math.min(1, Number(safeItem.volume ?? 1) || 1));
        const preferredSinkId = state().preferredSinkId;
        if (preferredSinkId) {
            try { await applySink(preferredSinkId); } catch { }
        }
        if (player.src !== safeItem.url) player.src = safeItem.url;
        await player.play();
        window.EveAudioflixState?.recordPlay?.(safeItem);
        return true;
    }

    function makeToneUrl() {
        const sr = 24000, sec = 0.55, n = Math.floor(sr * sec), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
        w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVEfmt '); v.setUint32(16,16,true);
        v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,sr,true); v.setUint32(28,sr*2,true);
        v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
        for (let i = 0; i < n; i++) { const t = i/sr, fade = Math.min(1,i/900,(n-i)/900); v.setInt16(44+i*2, Math.sin(2*Math.PI*880*t)*0.28*fade*32767, true); }
        return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    }

    async function playTestSignal() {
        if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
            const payload = await window.EveAudioflixNative?.sendTone?.({ frequency: 880, seconds: 0.55 });
            if (payload?.ok === true) { lastStatus = `Native route test tone -> ${state().nativeOutputLabel || 'selected output'}`; dispatch('eve:audioflix-playback', { status: lastStatus, native: true, payload }); return true; }
            if (payload?.message) { lastStatus = `${payload.message} Falling back to browser test tone.`; dispatch('eve:audioflix-playback', { status: lastStatus, fallback: true }); }
        }
        const url = makeToneUrl();
        try { await playItem({ id: 'audioflix-test-signal', type: 'sound', title: 'Audioflix test signal', url, volume: 0.62 }); return true; }
        finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    }

    async function layerPlay(item) {
        if (!item?.url) return;
        const safeItem = typeof item === 'object' ? item : { url: item };

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
        a.volume = Math.max(0, Math.min(1, Number(safeItem.volume ?? 1) || 1));
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
        if (currentItem?.id === itemId) { stopActiveStream(); ensureAudio().pause(); }
    }

    function pause() {
        stopActiveStream();
        ensureAudio().pause();
    }

    function updateItemVolume(itemId, vol) {
        if (currentItem?.id === itemId) {
            ensureAudio().volume = Math.max(0, Math.min(1, vol));
            window.EveAudioflixNative?.setVoiceVolume?.('singleton-main', vol);
            activeStreamVolume = vol;
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
        canvas = targetCanvas || null;
        fitCanvas();
        if (canvas && !animationFrame && audio && !audio.paused) startWaveform();
    }

    function browserOutputStatus() {
        const devices = navigator.mediaDevices || {};
        const player = ensureAudio();
        return {
            secureContext: window.isSecureContext === true,
            hasSetSinkId: typeof player.setSinkId === 'function',
            hasAudioContextSink: typeof AudioContext !== 'undefined'
                && typeof AudioContext.prototype?.setSinkId === 'function',
            hasOutputPicker: typeof devices.selectAudioOutput === 'function',
            hasEnumerate: typeof devices.enumerateDevices === 'function',
            activeSinkId: player.sinkId || ''
        };
    }

    Object.assign(ns, {
        ready: true, playItem, pause, selectOutput, listOutputs, setOutputById,
        unlockDeviceLabels, playTestSignal, applySink, attachWaveform, browserOutputStatus,
        layerPlay, stopItemLayers, updateItemVolume,
        getAudioElement: ensureAudio,
        getStatus() {
            const o = browserOutputStatus();
            return { status: lastStatus, item: currentItem, sinkId: o.activeSinkId, hasSetSinkId: o.hasSetSinkId, hasAudioContextSink: o.hasAudioContextSink, hasOutputPicker: o.hasOutputPicker, hasEnumerate: o.hasEnumerate, secureContext: o.secureContext };
        }
    });
})();
