window.EveAudioflixAudioWaveform = window.EveAudioflixAudioWaveform || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioWaveform;
    if (ns.ready) return;

    function createController(ensureAudio) {
        let context = null;
        let source = null;
        let analyser = null;
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

        return { attach, start, stop, getContext: ensureGraph };
    }

    Object.assign(ns, { ready: true, createController });
})();
