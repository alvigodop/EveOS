const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

function staticContracts() {
    const html = fs.readFileSync(path.join(ROOT, 'EveOS.html'), 'utf8');
    const ui = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.ui.js'), 'utf8');
    const engine = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.engine.js'), 'utf8');
    const bridge = fs.readFileSync(path.join(ROOT, 'server_modules', 'audioflix_bridge.py'), 'utf8');
    const order = ['soundboard', 'music', 'soundlab', 'router']
        .map((tab) => ui.indexOf(`tabButton('${tab}'`));
    assert(order.every((index) => index >= 0), 'all Audioflix tabs are wired');
    assert(order.every((index, position) => !position || index > order[position - 1]), 'Sonic Forge tab order is stable');
    [
        'audioflix.soundlab.state.js',
        'audioflix.soundlab.engine.js',
        'audioflix.soundlab.presets.js',
        'audioflix.soundlab.ui.js'
    ].forEach((name) => assert(html.includes(name), `${name} is loaded by EveOS`));
    const steering = engine.slice(
        engine.indexOf('async function applySteering'),
        engine.indexOf('function queueSteering')
    );
    assert(
        steering.indexOf('setMusicGenerationConfig') < steering.indexOf('resetContext'),
        'Lyria applies BPM/scale configuration before resetting generation context'
    );
    assert(bridge.includes('/api/audioflix/save-soundlab-recording'), 'recording save route is registered');
}

(async () => {
    staticContracts();
    const fixture = path.join(os.tmpdir(), `eveos-soundlab-${process.pid}.html`);
    const modules = [
        'audioflix.soundlab.state.js',
        'audioflix.soundlab.codec.js',
        'audioflix.soundlab.engine.js',
        'audioflix.soundlab.visualizer.js',
        'audioflix.soundlab.recording.js',
        'audioflix.soundlab.midi.js',
        'audioflix.soundlab.presets.js',
        'audioflix.soundlab.ui.render.js',
        'audioflix.soundlab.ui.events.js',
        'audioflix.soundlab.ui.js'
    ].map((name) => `<script src="${fileUrl(path.join(AUDIOFLIX, name))}"></script>`).join('');
    fs.writeFileSync(fixture, `<!doctype html><html><body>
        <main id="host"></main>
        <script>
            window.__soundLabRoot = {
                soundLab: {
                    schemaVersion: 1,
                    prompts: [{ id: 'legacy', text: 'legacy scene', weight: 1 }],
                    config: { bpm: 90 }
                }
            };
            window.__soundLabReasons = [];
            window.EveAudioflixState = {
                ensure: () => window.__soundLabRoot,
                update: (patch, reason) => {
                    Object.assign(window.__soundLabRoot, patch || {});
                    window.__soundLabReasons.push(reason || '');
                    return window.__soundLabRoot;
                },
                addItem: () => ({ id: 'generated-recording' }),
                addMusicGroup: () => true,
                toggleMusicGroup: () => true
            };
            window.EveAudioflixNative = {
                getStatus: () => ({ ok: false }),
                shouldSuppressBrowserPlayback: () => false
            };
            window.EveAudioflix = { render: () => {} };
            window.__soundLabErrors = [];
            addEventListener('error', event => window.__soundLabErrors.push(event.message));
            addEventListener('unhandledrejection', event => window.__soundLabErrors.push(String(event.reason)));
        </script>
        ${modules}
    </body></html>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const stateApi = window.EveAudioflixSoundLabState;
            const first = stateApi.ensure();
            const second = stateApi.ensure();
            const migratedControlView = first.controlView;
            const initialVolume = first.masterVolume;

            window.EveAudioflixSoundLabEngine.setApiKey('soundlab-session-test');
            window.EveAudioflixSoundLabEngine.setMasterVolume(0.31, false);
            const volumeAfterPreview = stateApi.ensure().masterVolume;
            window.EveAudioflixSoundLabEngine.setMasterVolume(0.31, true);
            const volumeAfterCommit = stateApi.ensure().masterVolume;

            stateApi.savePreset('Smoke Scene');
            const importPayload = {
                kind: 'eveos-sonic-forge-scenes',
                schemaVersion: 1,
                presets: [{
                    id: 'preset_imported',
                    name: 'Imported Scene',
                    prompts: [{ id: 'p1', text: 'glass percussion and warm strings', weight: 1 }],
                    config: { bpm: 112, density: 0.44 }
                }]
            };
            await window.EveAudioflixSoundLabPresets.importFile(new File(
                [JSON.stringify(importPayload)],
                'scenes.json',
                { type: 'application/json' }
            ));

            const host = document.querySelector('#host');
            host.innerHTML = window.EveAudioflixSoundLabUi.render();
            window.EveAudioflixSoundLabUi.setVisible(true);
            window.EveAudioflixSoundLabUi.afterRender(host);
            await new Promise((resolve) => setTimeout(resolve, 80));

            const current = stateApi.ensure();
            const serialized = JSON.stringify(window.__soundLabRoot);
            const visualModes = [...host.querySelectorAll('[data-sf-field="visualizer-mode"] option')]
                .map((option) => option.value);
            const knobButton = host.querySelector('[data-af-action="soundlab-control-view"][data-sf-view="knobs"]');
            await window.EveAudioflixSoundLabUi.handleAction(knobButton);
            host.innerHTML = window.EveAudioflixSoundLabUi.render();
            const knobCount = host.querySelectorAll('.sonic-forge-knob-shell').length;
            const steeringCalls = [];
            const originalQueueSteering = window.EveAudioflixSoundLabEngine.queueSteering;
            window.EveAudioflixSoundLabEngine.queueSteering = (options) => {
                steeringCalls.push(options || {});
            };
            const bpm = host.querySelector('[data-sf-config="bpm"]');
            bpm.value = '124';
            await window.EveAudioflixSoundLabUi.handleChange(bpm);
            const density = host.querySelector('[data-sf-config="density"]');
            density.value = '0.58';
            await window.EveAudioflixSoundLabUi.handleChange(density);
            window.EveAudioflixSoundLabEngine.queueSteering = originalQueueSteering;
            const sessionKeyBeforeClear = sessionStorage.getItem('eveAudioflixSoundLabApiKey');
            window.EveAudioflixSoundLabEngine.setApiKey('');
            window.EveAudioflixSoundLabUi.setVisible(false);
            return {
                sameIdentity: first === second,
                migratedControlView,
                promptCount: current.prompts.length,
                presetNames: current.presets.map((preset) => preset.name),
                initialVolume,
                volumeAfterPreview,
                volumeAfterCommit,
                sessionKeyBeforeClear,
                sessionKeyAfterClear: sessionStorage.getItem('eveAudioflixSoundLabApiKey'),
                leakedCredential: serialized.includes('soundlab-session-test'),
                hasTitle: host.querySelector('h2')?.textContent === 'Sonic Forge',
                visualModes,
                knobCount,
                controlView: stateApi.ensure().controlView,
                steeringCalls,
                hasRecording: !!host.querySelector('[data-af-action="soundlab-toggle-record"]'),
                hasImport: !!host.querySelector('[data-af-action="soundlab-import-presets"]'),
                errors: window.__soundLabErrors
            };
        });

        assert(result.sameIdentity, 'state reads preserve object identity');
        assert(result.migratedControlView === 'sliders', 'schema-v1 scenes migrate the control view default');
        assert(result.promptCount >= 1 && result.promptCount <= 12, 'prompt collection is bounded');
        assert(result.presetNames.includes('Smoke Scene'), 'saved scene persists in Audioflix state');
        assert(result.presetNames.includes('Imported Scene'), 'scene JSON imports into Audioflix state');
        assert(result.initialVolume === result.volumeAfterPreview, 'volume preview avoids config write amplification');
        assert(result.volumeAfterCommit === 0.31, 'volume change commits after interaction');
        assert(result.sessionKeyBeforeClear === 'soundlab-session-test', 'credential is retained for this browser session');
        assert(result.sessionKeyAfterClear === null, 'test credential is cleared after use');
        assert(result.leakedCredential === false, 'session credential never enters datapack state');
        assert(result.hasTitle && result.hasRecording && result.hasImport, 'Sonic Forge workbench renders all core tools');
        assert(['frequency', 'waveform', 'radial', 'spectrogram']
            .every((mode) => result.visualModes.includes(mode)), 'all visualizer modes are available');
        assert(result.controlView === 'knobs' && result.knobCount === 6, 'knob steering view is functional and persisted');
        assert(
            result.steeringCalls[0]?.resetContext === true
                && result.steeringCalls[1]?.resetContext === false,
            'BPM resets Lyria context while density remains a live steering update'
        );
        assert(result.errors.length === 0, `browser emitted errors: ${result.errors.join('; ')}`);
        console.log('AUDIOFLIX_SOUNDLAB_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
