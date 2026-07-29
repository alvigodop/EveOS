window.EveAudioflixSoundLabVisualizerOverlay =
    window.EveAudioflixSoundLabVisualizerOverlay || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabVisualizerOverlay;
    if (ns.ready) return;

    const LABELS = [
        [40, '40'], [100, '100'], [250, '250'], [500, '500'],
        [1000, '1k'], [2500, '2.5k'], [5000, '5k'], [10000, '10k'], [20000, '20k']
    ];

    function safeCall(target, name, ...args) {
        try {
            if (typeof target?.[name] === 'function') target[name](...args);
        } catch {}
    }

    function frequencyX(hz, width, linear) {
        if (linear) return Math.max(0, Math.min(width, hz / 20000 * width));
        const minimum = 24;
        const maximum = 20000;
        const clamped = Math.max(minimum, Math.min(maximum, hz));
        return Math.log(clamped / minimum) / Math.log(maximum / minimum) * width;
    }

    function drawFrequencyLabels(context, canvas, mode) {
        const linear = mode === 'frequency-linear';
        const height = canvas.height;
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        context.font = `${10 * ratio}px ui-monospace, monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.strokeStyle = 'rgba(110, 224, 232, 0.13)';
        context.fillStyle = 'rgba(195, 239, 242, 0.72)';
        context.lineWidth = ratio;
        LABELS.forEach(([hz, label]) => {
            const x = frequencyX(hz, canvas.width, linear);
            context.beginPath();
            context.moveTo(x, height);
            context.lineTo(x, height - 9 * ratio);
            context.stroke();
            context.fillText(label, x, height - 11 * ratio);
        });
    }

    function drawSpectrogramLabels(context, canvas) {
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        context.font = `${10 * ratio}px ui-monospace, monospace`;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillStyle = 'rgba(213, 242, 244, 0.72)';
        [100, 500, 2500, 10000].forEach((hz) => {
            const normalized = Math.log(hz / 24) / Math.log(20000 / 24);
            const y = canvas.height * (1 - normalized);
            context.fillText(hz >= 1000 ? `${hz / 1000}k` : String(hz), 6 * ratio, y);
        });
    }

    function drawBeatGrid(context, canvas, bpm, elapsedSeconds) {
        const safeBpm = Math.max(30, Math.min(300, Number(bpm) || 120));
        const secondsPerBeat = 60 / safeBpm;
        const width = canvas.width;
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const beatWidth = Math.max(36 * ratio, Math.min(140 * ratio, secondsPerBeat * 110 * ratio));
        const phase = ((Number(elapsedSeconds) || 0) % secondsPerBeat) / secondsPerBeat;
        context.strokeStyle = 'rgba(255, 204, 92, 0.09)';
        context.lineWidth = ratio;
        safeCall(context, 'setLineDash', [2 * ratio, 5 * ratio]);
        let beat = -Math.ceil(width / beatWidth) - 1;
        for (; beat <= Math.ceil(width / beatWidth) + 1; beat += 1) {
            const x = width - phase * beatWidth - beat * beatWidth;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, canvas.height);
            context.stroke();
        }
        safeCall(context, 'setLineDash', []);
    }

    function drawTelemetry(context, canvas, diagnostics) {
        const playback = diagnostics?.playback || {};
        const native = diagnostics?.native || {};
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const lines = [
            `jitter ${Number(playback.jitterMs || 0).toFixed(0)}ms`,
            `underrun ${Number(playback.underruns || 0)}`,
            `route ${Number(native.queuedMs || 0).toFixed(0)}ms / drop ${Number(native.dropped || 0)}`
        ];
        const padding = 8 * ratio;
        const lineHeight = 14 * ratio;
        const width = 176 * ratio;
        const height = lines.length * lineHeight + padding * 2;
        const x = canvas.width - width - padding;
        const y = padding;
        context.fillStyle = 'rgba(1, 10, 14, 0.72)';
        context.fillRect(x, y, width, height);
        context.strokeStyle = 'rgba(53, 214, 225, 0.26)';
        context.strokeRect(x, y, width, height);
        context.fillStyle = 'rgba(218, 247, 247, 0.82)';
        context.font = `${10 * ratio}px ui-monospace, monospace`;
        context.textAlign = 'left';
        context.textBaseline = 'top';
        lines.forEach((line, index) => {
            context.fillText(line, x + padding, y + padding + index * lineHeight);
        });
    }

    function draw(options) {
        const context = options?.context;
        const canvas = options?.canvas;
        const state = options?.state || {};
        const diagnostics = state.diagnostics || {};
        if (!context || !canvas) return;
        safeCall(context, 'save');
        context.shadowBlur = 0;
        context.globalAlpha = 1;
        if (diagnostics.beatGrid) {
            drawBeatGrid(context, canvas, state.config?.bpm, options.timeline?.elapsedSeconds);
        }
        if (diagnostics.frequencyLabels) {
            if (options.mode === 'spectrogram') drawSpectrogramLabels(context, canvas);
            else if (options.mode === 'spectrum' || options.mode === 'frequency-linear') {
                drawFrequencyLabels(context, canvas, options.mode);
            }
        }
        if (diagnostics.showTelemetry) {
            drawTelemetry(context, canvas, options.engineDiagnostics);
        }
        safeCall(context, 'restore');
    }

    Object.assign(ns, { ready: true, draw });
})();
