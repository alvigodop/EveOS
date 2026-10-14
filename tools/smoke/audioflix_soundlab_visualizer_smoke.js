const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const configPath = path.join(AUDIOFLIX, 'audioflix.soundlab.config.js');
const driftPath = path.join(AUDIOFLIX, 'audioflix.soundlab.drift.js');
const statePath = path.join(AUDIOFLIX, 'audioflix.soundlab.state.js');
const overlayPath = path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.overlay.js');
const visualizerPath = path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.js');
const diagnosticDir = path.join(ROOT, 'data', 'runtime', 'smoke-results');
const diagnosticPath = path.join(diagnosticDir, 'audioflix-soundlab-visualizer.json');
const diagnosticRun = { startedAt: new Date().toISOString(), pid: process.pid };
let diagnosticResult = null;
const stateSource = fs.readFileSync(statePath, 'utf8');
const overlaySource = fs.readFileSync(overlayPath, 'utf8');
const visualizerSource = fs.readFileSync(visualizerPath, 'utf8');
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

assert(
    stateSource.includes("if (value === 'frequency') return 'spectrum'")
        && stateSource.includes("'frequency-linear': 'Frequency (Linear Legacy)'"),
    'saved frequency mode migrates while the linear renderer remains selectable'
);
assert(
    visualizerSource.includes('aggregateSpectrum')
        && visualizerSource.includes('prepareLogBands')
        && visualizerSource.includes("mode === 'frequency-linear'"),
    'frequency bars use log aggregation and retain the original linear renderer'
);
assert(
    visualizerSource.includes('const timeBins = node?.fftSize || bins * 2')
        && visualizerSource.includes('const sample = bandAt((index % points)')
        && visualizerSource.includes('const sample = bandAt(1 - y'),
    'waveform, radial, and spectrogram sampling use corrected analysis domains'
);
assert(
    overlaySource.includes('drawFrequencyLabels')
        && overlaySource.includes('drawBeatGrid')
        && overlaySource.includes('drawTelemetry')
        && visualizerSource.includes('EveAudioflixSoundLabVisualizerOverlay?.draw?.'),
    'visual diagnostics add frequency labels, beat guides, and route telemetry without replacing modes'
);

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-soundlab-visualizer-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><html><body>
        <canvas id="visualizer" style="width:960px;height:260px"></canvas>
        <script>
            window.__soundLabRoot = { soundLab: {
                schemaVersion: 2,
                prompts: [{ id: 'one', text: 'test', weight: 1, color: '#20e3b2', cc: 16 }],
                config: {},
                presets: [],
                controlView: 'sliders',
                promptControlView: 'knobs',
                visualizerMode: 'spectrum'
            } };
            window.EveAudioflixState = {
                ensure: () => window.__soundLabRoot,
                update: (patch) => Object.assign(window.__soundLabRoot, patch || {})
            };
            const analyser = {
                frequencyBinCount: 1024,
                fftSize: 2048,
                context: { sampleRate: 48000 },
                getByteFrequencyData: (target) => target.forEach((_, index) => {
                    const bass = Math.max(0, 210 - index * 1.2);
                    const peaks = index % 71 < 4 ? 95 : 0;
                    target[index] = Math.min(255, 20 + bass + peaks);
                }),
                getByteTimeDomainData: (target) => target.forEach((_, index) => {
                    target[index] = 128 + Math.round(Math.sin(index / 17) * 54);
                })
            };
            window.EveAudioflixSoundLabEngine = { getAnalyser: () => analyser };
            window.__visualizerErrors = [];
            // Exercise mode invalidation even when a loaded browser delays animation frames
            // beyond the old fixed 90 ms fixture sleep.
            window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 160);
            window.cancelAnimationFrame = (handle) => clearTimeout(handle);
            addEventListener('error', (event) => window.__visualizerErrors.push(event.message));
        </script>
        <script src="${fileUrl(configPath)}"></script>
        <script src="${fileUrl(driftPath)}"></script>
        <script src="${fileUrl(statePath)}"></script>
        <script src="${fileUrl(overlayPath)}"></script>
        <script src="${fileUrl(visualizerPath)}"></script>
    </body></html>`);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const canvas = document.querySelector('#visualizer');
            const visualizer = window.EveAudioflixSoundLabVisualizer;
            const modes = window.EveAudioflixSoundLabState.modes;
            const originalGetContext = HTMLCanvasElement.prototype.getContext;
            const instrumented = new WeakSet();
            const methods = [
                'beginPath', 'closePath', 'moveTo', 'lineTo', 'stroke', 'fill',
                'fillRect', 'strokeRect', 'drawImage', 'fillText', 'setLineDash',
                'save', 'restore', 'createLinearGradient', 'createRadialGradient'
            ];
            const normalizeArg = (value) => {
                if (typeof value === 'number') return Number(value.toFixed(3));
                if (typeof value === 'string') return value;
                if (value instanceof HTMLCanvasElement) return `canvas:${value.width}x${value.height}`;
                if (Array.isArray(value)) return value.map(normalizeArg);
                return value?.constructor?.name || typeof value;
            };
            const instrument = (context) => {
                if (!context || instrumented.has(context)) return context;
                instrumented.add(context);
                methods.forEach((name) => {
                    const original = context[name]?.bind(context);
                    if (!original) return;
                    context[name] = (...args) => {
                        const trace = window.__visualizerTrace;
                        if (trace?.active) {
                            trace.ops.push(JSON.stringify([
                                name,
                                args.map(normalizeArg),
                                String(context.fillStyle),
                                String(context.strokeStyle),
                                Number(context.globalAlpha.toFixed(3)),
                                Number(context.lineWidth.toFixed(3))
                            ]));
                        }
                        return original(...args);
                    };
                });
                return context;
            };
            HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
                return instrument(originalGetContext.call(this, type, ...args));
            };
            const fnv = (values) => {
                let hash = 2166136261;
                for (const value of values) hash = Math.imul(hash ^ value, 16777619);
                return hash >>> 0;
            };
            const overlay = window.EveAudioflixSoundLabVisualizerOverlay;
            const drawOverlay = overlay.draw.bind(overlay);
            let frameWaiter = null;
            overlay.draw = (options) => {
                drawOverlay(options);
                if (frameWaiter?.mode !== options?.mode) return;
                const waiter = frameWaiter;
                frameWaiter = null;
                window.__visualizerTrace.active = false;
                waiter.resolve();
            };
            const waitForModeFrame = (mode) => new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    frameWaiter = null;
                    if (window.__visualizerTrace) window.__visualizerTrace.active = false;
                    reject(new Error(`Timed out waiting for visualizer mode ${mode}`));
                }, 1500);
                frameWaiter = {
                    mode,
                    resolve: () => {
                        clearTimeout(timer);
                        resolve();
                    }
                };
            });
            visualizer.mount(canvas);
            const frames = [];
            let started = false;
            for (const mode of modes) {
                const trace = { active: true, ops: [] };
                window.__visualizerTrace = trace;
                const rendered = waitForModeFrame(mode);
                window.__soundLabRoot.soundLab.visualizerMode = mode;
                if (!started) {
                    started = true;
                    visualizer.setVisible(true);
                }
                await rendered;
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let hash = 2166136261;
                for (let index = 0; index < pixels.length; index += 64) {
                    hash = Math.imul(hash ^ pixels[index] ^ pixels[index + 1], 16777619);
                }
                const counts = {};
                trace.ops.forEach((operation) => {
                    const name = JSON.parse(operation)[0];
                    counts[name] = (counts[name] || 0) + 1;
                });
                frames.push({
                    mode,
                    sparseHash: hash >>> 0,
                    fullHash: fnv(pixels),
                    operationHash: fnv(new TextEncoder().encode(trace.ops.join('|'))),
                    operationCount: trace.ops.length,
                    operationCounts: counts,
                    operationSample: trace.ops.slice(0, 8)
                });
            }
            visualizer.setVisible(false);
            return {
                modes,
                frames,
                labels: modes.map(window.EveAudioflixSoundLabState.modeLabel),
                migrated: window.EveAudioflixSoundLabState.normalize({ visualizerMode: 'frequency' }).visualizerMode,
                errors: window.__visualizerErrors
            };
        });
        diagnosticResult = result;
        fs.mkdirSync(diagnosticDir, { recursive: true });
        fs.writeFileSync(diagnosticPath, JSON.stringify({ ...diagnosticRun, ...result }, null, 2));
        assert(
            result.modes.join(',') === 'spectrum,waveform,radial,spectrogram,frequency-linear',
            'improved spectrum is first and the legacy frequency view is last'
        );
        const collisionsFor = (key) => [...new Set(result.frames.map((frame) => frame[key]))]
            .map((value) => result.frames.filter((frame) => frame[key] === value).map((frame) => frame.mode))
            .filter((modes) => modes.length > 1);
        assert(
            result.frames.every((frame) => frame.operationCount > 0),
            `every visualizer mode completes a draw; missing=${result.frames.filter((frame) => !frame.operationCount).map((frame) => frame.mode).join(',')}`
        );
        assert(
            collisionsFor('fullHash').length === 0,
            `every visualizer renders a distinct full-pixel frame; collisions=${JSON.stringify(collisionsFor('fullHash'))}; diagnostic=${path.relative(ROOT, diagnosticPath)}`
        );
        assert(
            collisionsFor('operationHash').length === 0,
            `every visualizer uses a distinct canvas operation path; collisions=${JSON.stringify(collisionsFor('operationHash'))}; diagnostic=${path.relative(ROOT, diagnosticPath)}`
        );
        assert(
            result.migrated === 'spectrum'
                && result.labels[0] === 'Spectrum (Log)'
                && /Legacy/.test(result.labels.at(-1)),
            'legacy saved state migrates to the labelled logarithmic spectrum'
        );
        assert(!result.errors.length, `visualizer emitted browser errors: ${result.errors.join('; ')}`);
        console.log(`AUDIOFLIX SOUNDLAB VISUALIZER: PASS ${result.frames.length} | FAIL 0 | TOTAL ${result.frames.length}`);
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    try {
        fs.mkdirSync(diagnosticDir, { recursive: true });
        fs.writeFileSync(diagnosticPath, JSON.stringify({
            ...diagnosticRun, ...diagnosticResult, ok: false,
            failure: { message: error.message, stack: error.stack }, finishedAt: new Date().toISOString()
        }, null, 2));
    } catch (diagnosticError) {
        console.error(`DIAGNOSTIC_WRITE_FAILED: ${diagnosticError.message}`);
    }
    console.error(`AUDIOFLIX SOUNDLAB VISUALIZER: FAIL 1 | ${error.message}`);
    console.error(`DIAGNOSTIC: ${path.relative(ROOT, diagnosticPath)}`);
    process.exitCode = 1;
});
