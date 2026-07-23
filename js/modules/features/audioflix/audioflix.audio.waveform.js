window.EveAudioflixAudioWaveform = window.EveAudioflixAudioWaveform || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioWaveform;
    if (ns.ready) return;

    function createController(ensureAudio) {
        let context = null;
        let source = null;
        let analyser = null;
        let outputGain = null;
        let captureNode = null;
        let captureSink = null;
        let onFrames = null;
        let canvas = null;
        let canvasContext = null;
        let animationFrame = 0;

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
                // A gain stage before the speakers lets the native EveOS route silence local
                // output ("bypasser") while the same live signal is tapped for the bridge.
                outputGain = context.createGain();
                source.connect(analyser);
                analyser.connect(outputGain);
                outputGain.connect(context.destination);
            }
            return context;
        }

        // The graph can legitimately fail to build (no AudioContext, a non-media element, a source
        // already claimed elsewhere). Never let that throw into playback — callers fall back.
        function safeGraph() {
            try { return ensureGraph(); } catch (error) {
                console.warn('[Audioflix] audio graph unavailable:', error);
                return null;
            }
        }

        // Silence the browser speakers without pausing playback (native route owns the sound).
        function setSpeakerMuted(muted) {
            const ctx = safeGraph();
            if (!ctx || !outputGain) return false;
            outputGain.gain.value = muted ? 0 : 1;
            return true;
        }

        function teardownTap() {
            if (captureNode) {
                captureNode.onaudioprocess = null;
                try { captureNode.disconnect(); } catch (error) { /* already detached */ }
                captureNode = null;
            }
            if (captureSink) {
                try { captureSink.disconnect(); } catch (error) { /* already detached */ }
                captureSink = null;
            }
        }

        // Real-time PCM tap on the live player. Lets the native bridge play a track WITHOUT
        // pre-decoding it, which is what made music lag between pressing play and hearing it.
        // Pass null to tear the tap down. Returns the context sample rate, or 0 if unavailable.
        function setFrameTap(handler) {
            const ctx = safeGraph();
            if (!ctx) return 0;
            onFrames = typeof handler === 'function' ? handler : null;
            if (!onFrames) {
                teardownTap();
                return ctx.sampleRate;
            }
            if (!captureNode && typeof ctx.createScriptProcessor === 'function') {
                try {
                    captureNode = ctx.createScriptProcessor(4096, 2, 2);
                    captureSink = ctx.createGain();
                    captureSink.gain.value = 0;
                    captureNode.onaudioprocess = (event) => onFrames?.(event.inputBuffer, ctx.sampleRate);
                    analyser.connect(captureNode);
                    captureNode.connect(captureSink);
                    captureSink.connect(ctx.destination);
                } catch (error) {
                    console.warn('[Audioflix] live PCM tap unavailable:', error);
                    teardownTap();
                    onFrames = null;
                    return 0;
                }
            }
            return ctx.sampleRate;
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
            canvasContext = canvas.getContext('2d');
        }

        function draw() {
            if (!canvas || !canvasContext || !analyser) {
                animationFrame = 0;
                return;
            }
            fitCanvas();
            const width = canvas.width;
            const height = canvas.height;
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteTimeDomainData(data);
            canvasContext.clearRect(0, 0, width, height);
            const gradient = canvasContext.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, '#00d4ff');
            gradient.addColorStop(0.5, '#9cffad');
            gradient.addColorStop(1, '#ffca5f');
            canvasContext.strokeStyle = gradient;
            canvasContext.lineWidth = Math.max(2, width / 420);
            canvasContext.beginPath();
            const slice = width / data.length;
            for (let index = 0; index < data.length; index += 1) {
                const x = index * slice;
                const y = (data[index] / 255) * height;
                if (index === 0) canvasContext.moveTo(x, y);
                else canvasContext.lineTo(x, y);
            }
            canvasContext.stroke();
            animationFrame = window.requestAnimationFrame(draw);
        }

        function stop() {
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }

        function start() {
            try {
                ensureGraph();
                if (context?.state === 'suspended') context.resume();
                stop();
                draw();
            } catch (error) {
                console.warn('[Audioflix] waveform unavailable for this source:', error);
            }
        }

        function attach(targetCanvas) {
            canvas = targetCanvas || null;
            if (!canvas) {
                stop();
                return;
            }
            fitCanvas();
            const player = ensureAudio();
            if (!player.dataset.audioflixWaveformEvents) {
                player.dataset.audioflixWaveformEvents = 'true';
                player.addEventListener('pause', stop);
                player.addEventListener('ended', stop);
                player.addEventListener('error', stop);
            }
            if (canvas && !animationFrame && !player.paused) start();
        }

        return { attach, start, stop, getContext: ensureGraph, setSpeakerMuted, setFrameTap };
    }

    Object.assign(ns, { ready: true, createController });
})();
