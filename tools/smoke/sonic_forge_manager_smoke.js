const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const MANAGER = path.join(
    ROOT, 'js', 'modules', 'gemini', 'html_loaders', 'agentic',
    'sonic_forge', 'sonicForgeManagerUILoader.js'
);
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-sonic-forge-manager-${process.pid}.html`);
    const scripts = [
        path.join(AUDIOFLIX, 'audioflix.soundlab.config.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.drift.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.state.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.advanced.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.js'),
        MANAGER
    ].map((file) => `<script src="${fileUrl(file)}"></script>`).join('');
    fs.writeFileSync(fixture, `<!doctype html><html><body>
        <div id="sonic-forge-manager-card-placeholder"></div>
        <main id="host"></main>
        <script>
            window.componentHandler = { upgradeElements() {} };
            window.__root = {
                soundLab: {
                    schemaVersion: 3,
                    prompts: [
                        { id: 'a', text: 'warm cinematic atmosphere with evolving harmony', weight: 1 },
                        { id: 'b', text: 'patient electronic percussion and deep bass pulse', weight: 0.65 },
                        { id: 'c', text: 'shimmering analog synth texture, spacious and detailed', weight: 0.45 }
                    ],
                    config: {
                        bpm: 96, density: 0.55, brightness: 0.48, guidance: 3.2,
                        temperature: 1.1, topK: 40, seed: 0,
                        scale: 'SCALE_UNSPECIFIED', musicGenerationMode: 'QUALITY',
                        muteBass: false, muteDrums: false, onlyBassAndDrums: false
                    },
                    controlView: 'sliders',
                    promptControlView: 'knobs',
                    visualizerMode: 'spectrum'
                }
            };
            window.EveAudioflixState = {
                ensure: () => window.__root,
                update: (patch) => Object.assign(window.__root, patch || {})
            };
        </script>
        ${scripts}
    </body></html>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const stateApi = window.EveAudioflixSoundLabState;
            const state = stateApi.ensure();
            const host = document.getElementById('host');
            host.innerHTML = `<div data-audioflix-soundlab>
                ${window.EveAudioflixSoundLabUiAdvanced.renderRendered(state)}
            </div>`;
            window.EveAudioflixSoundLabUi.afterRender(host);
            await window.loadSonicForgeManagerCard();
            window.SonicForgeManagerAgentic.initialize();
            const panel = host.querySelector('.sonic-forge-rendered');
            const initialHidden = panel.hidden;
            window.SonicForgeManagerAgentic.setEnabled(true);
            const shownAfterEnable = !panel.hidden;
            const enabledNote = document.querySelector('[data-sonic-forge-paid-note]').textContent;
            window.SonicForgeManagerAgentic.setEnabled(false);
            const hiddenAfterDisable = panel.hidden;
            const custom = stateApi.normalize({
                prompts: [{ id: 'custom', text: 'custom jazz trio', weight: 0.8 }],
                config: { bpm: 123, guidance: 2.5 }
            });
            return {
                initialHidden,
                shownAfterEnable,
                hiddenAfterDisable,
                persisted: stateApi.ensure().showPaidApiFeatures,
                enabledNote,
                anchorWeight: state.prompts[0].weight,
                supportWeight: state.prompts[1].weight,
                guidance: state.config.guidance,
                temperature: state.config.temperature,
                customPrompt: custom.prompts[0].text,
                customBpm: custom.config.bpm,
                customGuidance: custom.config.guidance
            };
        });
        assert(result.initialHidden, 'paid Lyria render controls default to hidden');
        assert(result.shownAfterEnable, 'manager toggle reveals paid Lyria render controls live');
        assert(result.hiddenAfterDisable && result.persisted === false,
            'manager toggle hides and persists the paid-feature state');
        assert(/now available/i.test(result.enabledNote), 'enabled state explains availability');
        assert(
            result.anchorWeight === 1
                && result.supportWeight === 0.3
                && result.guidance === 4
                && result.temperature === 0.9,
            'legacy factory defaults migrate to stable realtime generation defaults'
        );
        assert(
            result.customPrompt === 'custom jazz trio'
                && result.customBpm === 123
                && result.customGuidance === 2.5,
            'custom prompts and generation controls survive normalization'
        );
        console.log('SONIC_FORGE_MANAGER_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
