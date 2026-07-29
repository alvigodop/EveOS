window.EveAudioflixSoundLabVisualizer = window.EveAudioflixSoundLabVisualizer || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabVisualizer;
    if (ns.ready) return;

    let canvas = null;
    let context = null;
    let resizeObserver = null;
    let resizeFallback = false;
    let frameId = 0;
    let lastFrame = 0;
    let visible = false;
    let spectrum = null;
    let waveform = null;
    let frequencyBands = null;
    let spectrumPeaks = null;
    let sampleRate = 48000;
    let lastMode = '';
    let spectrogram = null;
    let spectrogramContext = null;

    const state = () => window.EveAudioflixSoundLabState?.ensure?.() || {};
    const analyser = () => window.EveAudioflixSoundLabEngine?.getAnalyser?.() || null;

    function hexRgb(value) {
        const match = /^#([0-9a-f]{6})$/i.exec(String(value || ''));
        if (!match) return [32, 227, 178];
        const number = parseInt(match[1], 16);
        return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
    }

    function palette() {
        const prompts = (state().prompts || []).filter((prompt) => Number(prompt.weight) > 0);
        const weighted = prompts.length ? prompts : [{ color: '#20e3b2', weight: 1 }];
        const total = weighted.reduce((sum, prompt) => sum + Number(prompt.weight || 0), 0) || 1;
        const mixed = weighted.reduce((result, prompt) => {
            const rgb = hexRgb(prompt.color);
            const weight = Number(prompt.weight || 0) / total;
            return result.map((value, index) => value + rgb[index] * weight);
        }, [0, 0, 0]).map(Math.round);
        return {
            mixed: `rgb(${mixed.join(',')})`,
            colors: weighted.map((prompt) => prompt.color || '#20e3b2')
        };
    }

    function resize() {
        if (!canvas || !context) return;
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(320, Math.round(rect.width * ratio));
        const height = Math.max(180, Math.round(rect.height * ratio));
        if (canvas.width === width && canvas.height === height) return;
        const previous = spectrogram;
        canvas.width = width;
        canvas.height = height;
        spectrogram = document.createElement('canvas');
        spectrogram.width = width;
        spectrogram.height = height;
        spectrogramContext = spectrogram.getContext('2d', { alpha: false });
        if (previous?.width && previous?.height) {
            spectrogramContext.drawImage(previous, 0, 0, width, height);
        }
    }

    function spectrumAt(position) {
        const lower = Math.max(1, Math.min(spectrum.length - 1, Math.floor(position)));
        const upper = Math.min(spectrum.length - 1, lower + 1);
        const blend = Math.max(0, Math.min(1, position - lower));
        return (spectrum[lower] * (1 - blend) + spectrum[upper] * blend) / 255;
    }

    function aggregateSpectrum(lowerBin, upperBin) {
        if (upperBin - lowerBin < 1) return spectrumAt((lowerBin + upperBin) / 2);
        const start = Math.max(1, Math.floor(lowerBin));
        const end = Math.min(spectrum.length - 1, Math.ceil(upperBin));
        let peak = 0;
        let squares = 0;
        let count = 0;
        for (let index = start; index <= end; index += 1) {
            const level = spectrum[index] / 255;
            peak = Math.max(peak, level);
            squares += level * level;
            count += 1;
        }
        const rms = count ? Math.sqrt(squares / count) : 0;
        return Math.min(1, rms * 0.72 + peak * 0.28);
    }

    function prepareLogBands(count = 96) {
        if (!frequencyBands || frequencyBands.length !== count) {
            frequencyBands = new Float32Array(count);
            spectrumPeaks = new Float32Array(count);
        }
        const binHz = sampleRate / Math.max(2, spectrum.length * 2);
        const minimumHz = Math.max(24, binHz);
        const maximumHz = Math.max(minimumHz * 2, Math.min(20000, sampleRate / 2 - binHz));
        const frequencyRange = maximumHz / minimumHz;
        for (let index = 0; index < count; index += 1) {
            const lowerHz = minimumHz * Math.pow(frequencyRange, index / count);
            const upperHz = minimumHz * Math.pow(frequencyRange, (index + 1) / count);
            const rawLevel = aggregateSpectrum(lowerHz / binHz, upperHz / binHz);
            const position = (index + 0.5) / count;
            const level = Math.min(1, Math.pow(rawLevel, 0.82) * (0.92 + position * 0.18));
            frequencyBands[index] = level;
            spectrumPeaks[index] = Math.max(level, spectrumPeaks[index] - 0.018);
        }
    }

    function bandAt(position) {
        const scaled = Math.max(0, Math.min(1, position)) * (frequencyBands.length - 1);
        const lower = Math.floor(scaled);
        const upper = Math.min(frequencyBands.length - 1, lower + 1);
        return frequencyBands[lower] * (1 - (scaled - lower))
            + frequencyBands[upper] * (scaled - lower);
    }

    function prepareData(node) {
        const bins = node?.frequencyBinCount || 1024;
        const timeBins = node?.fftSize || bins * 2;
        if (!spectrum || spectrum.length !== bins) spectrum = new Uint8Array(bins);
        if (!waveform || waveform.length !== timeBins) waveform = new Uint8Array(timeBins);
        if (node) {
            sampleRate = Number(node.context?.sampleRate) || sampleRate;
            node.getByteFrequencyData(spectrum);
            node.getByteTimeDomainData(waveform);
        } else {
            const tick = performance.now() / 550;
            for (let index = 0; index < bins; index += 1) {
                spectrum[index] = Math.max(0, 80 + Math.sin(tick + index / 13) * 35 - index / 15);
            }
            for (let index = 0; index < timeBins; index += 1) {
                waveform[index] = 128 + Math.sin(tick * 2 + index / 19) * 9;
            }
        }
        prepareLogBands(Math.min(96, bins));
    }

    function backdrop(colors) {
        const width = canvas.width;
        const height = canvas.height;
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#05151b');
        gradient.addColorStop(0.55, '#081015');
        gradient.addColorStop(1, '#171109');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 0.13;
        colors.forEach((color, index) => {
            const x = width * ((index + 1) / (colors.length + 1));
            const glow = context.createRadialGradient(x, height * 0.55, 0, x, height * 0.55, width * 0.32);
            glow.addColorStop(0, color);
            glow.addColorStop(1, 'transparent');
            context.fillStyle = glow;
            context.fillRect(0, 0, width, height);
        });
        context.globalAlpha = 1;
    }

    function drawSpectrum(colors) {
        const width = canvas.width;
        const height = canvas.height;
        const count = frequencyBands.length;
        const gap = Math.max(2, width * 0.0025);
        const barWidth = (width - gap * (count - 1)) / count;
        for (let index = 0; index < count; index += 1) {
            const sample = frequencyBands[index];
            const barHeight = Math.max(3, sample * height * 0.82);
            const x = index * (barWidth + gap);
            context.fillStyle = colors[index % colors.length];
            context.globalAlpha = 0.32 + sample * 0.68;
            context.fillRect(x, height - barHeight, barWidth, barHeight);
            const peakY = height - spectrumPeaks[index] * height * 0.82;
            context.globalAlpha = 0.42 + spectrumPeaks[index] * 0.45;
            context.fillRect(x, Math.max(0, peakY), barWidth, Math.max(1, height / 180));
        }
        context.globalAlpha = 1;
    }

    function drawLinearFrequency(colors) {
        const width = canvas.width;
        const height = canvas.height;
        const count = Math.min(96, spectrum.length);
        const gap = Math.max(2, width * 0.0025);
        const barWidth = (width - gap * (count - 1)) / count;
        for (let index = 0; index < count; index += 1) {
            const sample = spectrum[Math.floor(index * spectrum.length / count)] / 255;
            const barHeight = Math.max(3, sample * height * 0.82);
            context.fillStyle = colors[index % colors.length];
            context.globalAlpha = 0.35 + sample * 0.65;
            context.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
        }
        context.globalAlpha = 1;
    }

    function drawWaveform(color) {
        const width = canvas.width;
        const height = canvas.height;
        context.beginPath();
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
        context.strokeStyle = color;
        context.globalAlpha = 0.16;
        context.lineWidth = Math.max(1, width / 900);
        context.stroke();
        context.globalAlpha = 1;
        context.beginPath();
        waveform.forEach((sample, index) => {
            const x = index / (waveform.length - 1) * width;
            const y = sample / 255 * height;
            if (index) context.lineTo(x, y);
            else context.moveTo(x, y);
        });
        context.strokeStyle = color;
        context.lineWidth = Math.max(2, width / 480);
        context.shadowColor = color;
        context.shadowBlur = 18;
        context.stroke();
        context.shadowBlur = 0;
    }

    function drawRadial(colors) {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.22;
        const points = 128;
        context.beginPath();
        for (let index = 0; index <= points; index += 1) {
            const angle = (index / points) * Math.PI * 2 - Math.PI / 2;
            const sample = bandAt((index % points) / Math.max(1, points - 1));
            const distance = radius + sample * radius * 1.25;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            if (index) context.lineTo(x, y);
            else context.moveTo(x, y);
        }
        context.closePath();
        const gradient = context.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
        colors.forEach((color, index) => gradient.addColorStop(index / Math.max(1, colors.length - 1), color));
        context.strokeStyle = gradient;
        context.lineWidth = Math.max(2, width / 420);
        context.shadowColor = colors[0];
        context.shadowBlur = 22;
        context.stroke();
        context.globalAlpha = 0.08;
        context.fillStyle = colors[0];
        context.fill();
        context.globalAlpha = 1;
        context.shadowBlur = 0;
    }

    function clearSpectrogram() {
        if (!spectrogramContext || !spectrogram) return;
        spectrogramContext.fillStyle = '#02080b';
        spectrogramContext.fillRect(0, 0, spectrogram.width, spectrogram.height);
    }

    function drawSpectrogram(colors) {
        if (!spectrogramContext) return;
        const width = spectrogram.width;
        const height = spectrogram.height;
        spectrogramContext.drawImage(spectrogram, -2, 0);
        const gradient = spectrogramContext.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#02080b');
        colors.forEach((color, index) => gradient.addColorStop(0.25 + index * 0.65 / colors.length, color));
        gradient.addColorStop(1, '#fff6d5');
        for (let y = 0; y < height; y += 3) {
            const sample = bandAt(1 - y / Math.max(1, height - 1));
            spectrogramContext.globalAlpha = Math.max(0.08, sample);
            spectrogramContext.fillStyle = gradient;
            spectrogramContext.fillRect(width - 2, y, 2, 3);
        }
        spectrogramContext.globalAlpha = 1;
        context.drawImage(spectrogram, 0, 0);
    }

    function draw(timestamp) {
        frameId = 0;
        if (!canvas || !visible) return;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (timestamp - lastFrame < (reduced ? 66 : 33)) return requestFrame();
        lastFrame = timestamp;
        resize();
        const node = analyser();
        prepareData(node);
        const colors = palette();
        const mode = state().visualizerMode || 'spectrum';
        if (mode !== lastMode) {
            if (mode === 'spectrogram') clearSpectrogram();
            lastMode = mode;
        }
        if (mode !== 'spectrogram') backdrop(colors.colors);
        if (mode === 'waveform') drawWaveform(colors.mixed);
        else if (mode === 'radial') drawRadial(colors.colors);
        else if (mode === 'spectrogram') drawSpectrogram(colors.colors);
        else if (mode === 'frequency-linear') drawLinearFrequency(colors.colors);
        else drawSpectrum(colors.colors);
        window.EveAudioflixSoundLabVisualizerOverlay?.draw?.({
            context,
            canvas,
            mode,
            state: state(),
            timeline: window.EveAudioflixSoundLabEngine?.getTimeline?.() || {},
            engineDiagnostics: window.EveAudioflixSoundLabEngine?.getDiagnostics?.() || {}
        });
        requestFrame();
    }

    function requestFrame() {
        if (!frameId && visible && canvas) frameId = requestAnimationFrame(draw);
        return frameId;
    }

    function mount(target) {
        if (canvas === target) {
            resize();
            return requestFrame();
        }
        if (resizeObserver) resizeObserver.disconnect();
        if (resizeFallback) window.removeEventListener('resize', resize);
        resizeFallback = false;
        if (frameId) cancelAnimationFrame(frameId);
        canvas = target || null;
        context = canvas?.getContext?.('2d') || null;
        frameId = 0;
        if (!canvas) return;
        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(resize);
            resizeObserver.observe(canvas);
        } else {
            resizeObserver = null;
            resizeFallback = true;
            window.addEventListener('resize', resize);
        }
        resize();
        requestFrame();
    }

    function setVisible(next) {
        visible = next === true;
        if (!visible && frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        if (visible) requestFrame();
    }

    Object.assign(ns, { ready: true, mount, setVisible });
})();
