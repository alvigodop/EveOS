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
        canvas.width = width;
        canvas.height = height;
        spectrogram = document.createElement('canvas');
        spectrogram.width = width;
        spectrogram.height = height;
        spectrogramContext = spectrogram.getContext('2d', { alpha: false });
    }

    function prepareData(node) {
        const bins = node?.frequencyBinCount || 1024;
        if (!spectrum || spectrum.length !== bins) spectrum = new Uint8Array(bins);
        if (!waveform || waveform.length !== bins) waveform = new Uint8Array(bins);
        if (node) {
            node.getByteFrequencyData(spectrum);
            node.getByteTimeDomainData(waveform);
        } else {
            const tick = performance.now() / 550;
            for (let index = 0; index < bins; index += 1) {
                spectrum[index] = Math.max(0, 80 + Math.sin(tick + index / 13) * 35 - index / 15);
                waveform[index] = 128 + Math.sin(tick * 2 + index / 19) * 9;
            }
        }
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

    function drawFrequency(colors) {
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
            const sample = spectrum[Math.floor(index % points * spectrum.length / points)] / 255;
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
        context.shadowBlur = 0;
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
            const sample = spectrum[Math.floor((1 - y / height) * (spectrum.length - 1))] / 255;
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
        const mode = state().visualizerMode || 'frequency';
        if (mode !== 'spectrogram') backdrop(colors.colors);
        if (mode === 'waveform') drawWaveform(colors.mixed);
        else if (mode === 'radial') drawRadial(colors.colors);
        else if (mode === 'spectrogram') drawSpectrogram(colors.colors);
        else drawFrequency(colors.colors);
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
