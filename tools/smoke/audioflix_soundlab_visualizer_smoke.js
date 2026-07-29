const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const configPath = path.join(AUDIOFLIX, 'audioflix.soundlab.config.js');
const statePath = path.join(AUDIOFLIX, 'audioflix.soundlab.state.js');
const overlayPath = path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.overlay.js');
const visualizerPath = path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.js');
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
            addEventListener('error', (event) => window.__visualizerErrors.push(event.message));
        </script>
        <script src="${fileUrl(configPath)}"></script>
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
            visualizer.mount(canvas);
            visualizer.setVisible(true);
            const hashes = [];
            for (const mode of modes) {
                window.__soundLabRoot.soundLab.visualizerMode = mode;
                await new Promise((resolve) => setTimeout(resolve, 90));
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let hash = 2166136261;
                for (let index = 0; index < pixels.length; index += 64) {
                    hash = Math.imul(hash ^ pixels[index] ^ pixels[index + 1], 16777619);
                }
                hashes.push(hash >>> 0);
            }
            visualizer.setVisible(false);
            return {
                modes,
                hashes,
                labels: modes.map(window.EveAudioflixSoundLabState.modeLabel),
                migrated: window.EveAudioflixSoundLabState.normalize({ visualizerMode: 'frequency' }).visualizerMode,
                errors: window.__visualizerErrors
            };
        });
        assert(
            result.modes.join(',') === 'spectrum,waveform,radial,spectrogram,frequency-linear',
            'improved spectrum is first and the legacy frequency view is last'
        );
        assert(new Set(result.hashes).size === result.modes.length, 'every visualizer renders a distinct frame');
        assert(
            result.migrated === 'spectrum'
                && result.labels[0] === 'Spectrum (Log)'
                && /Legacy/.test(result.labels.at(-1)),
            'legacy saved state migrates to the labelled logarithmic spectrum'
        );
        assert(!result.errors.length, `visualizer emitted browser errors: ${result.errors.join('; ')}`);
        console.log('AUDIOFLIX_SOUNDLAB_VISUALIZER_SMOKE_OK', JSON.stringify(result.hashes));
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
