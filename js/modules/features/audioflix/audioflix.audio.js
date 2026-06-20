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
            routeMode: 'browser'
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
                .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output device ${i + 1}` }));
        } catch (error) {
            console.warn('[Audioflix] enumerateDevices failed:', error);
            return [];
        }
    }

    async function setOutputById(deviceId, label) {
        if (!deviceId) return false;
        return await commitOutput(deviceId, label || 'Selected output device');
    }

    async function playItem(item) {
        const safeItem = item && typeof item === 'object' ? item : {};
        if (!safeItem.url) throw new Error('Audioflix item is missing a URL.');
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

    function pause() {
        ensureAudio().pause();
    }

    function attachWaveform(targetCanvas) {
        canvas = targetCanvas || null;
        fitCanvas();
        if (canvas && !animationFrame && audio && !audio.paused) startWaveform();
    }

    Object.assign(ns, {
        ready: true,
        playItem,
        pause,
        selectOutput,
        listOutputs,
        setOutputById,
        applySink,
        attachWaveform,
        getAudioElement: ensureAudio,
        getStatus: function () {
            return {
                status: lastStatus,
                item: currentItem,
                sinkId: ensureAudio().sinkId || '',
                hasSetSinkId: typeof ensureAudio().setSinkId === 'function',
                hasOutputPicker: typeof navigator.mediaDevices?.selectAudioOutput === 'function',
                hasEnumerate: typeof navigator.mediaDevices?.enumerateDevices === 'function'
            };
        }
    });
})();
