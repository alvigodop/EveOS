const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const GEMINI_SOCKET = path.join(
    ROOT, 'js', 'modules', 'gemini', 'client', 'connection_management', 'socket_core'
);
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

function staticContracts() {
    const html = fs.readFileSync(path.join(ROOT, 'EveOS.html'), 'utf8');
    const ui = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.ui.js'), 'utf8');
    const engine = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.engine.js'), 'utf8');
    const playback = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.soundlab.playback.js'), 'utf8');
    const failureApi = fs.readFileSync(path.join(GEMINI_SOCKET, 'geminiApiFailure.js'), 'utf8');
    const credentials = fs.readFileSync(
        path.join(ROOT, 'js', 'modules', 'gemini', 'server_control', 'geminiCredentialWorkflow.js'),
        'utf8'
    );
    const bridge = fs.readFileSync(path.join(ROOT, 'server_modules', 'audioflix_bridge.py'), 'utf8');
    const order = ['soundboard', 'music', 'soundlab', 'router']
        .map((tab) => ui.indexOf(`tabButton('${tab}'`));
    assert(order.every((index) => index >= 0), 'all Audioflix tabs are wired');
    assert(order.every((index, position) => !position || index > order[position - 1]), 'Sonic Forge tab order is stable');
    [
        'audioflix.soundlab.state.js',
        'audioflix.soundlab.sdk.js',
        'audioflix.soundlab.playback.js',
        'audioflix.soundlab.engine.js',
        'audioflix.soundlab.presets.js',
        'audioflix.soundlab.ui.js',
        'geminiApiFailure.js'
    ].forEach((name) => assert(html.includes(name), `${name} is loaded by EveOS`));
    const steering = engine.slice(
        engine.indexOf('async function applySteering'),
        engine.indexOf('function queueSteering')
    );
    assert(
        steering.indexOf('setMusicGenerationConfig') < steering.indexOf('resetContext'),
        'Lyria applies BPM/scale configuration before resetting generation context'
    );
    assert(
        engine.includes('Promise.race([connection, transportFailure, deadline])')
            && engine.includes('connectionExpired')
            && engine.includes('EveGeminiApiFailure?.connectWithNormalizedWebSocket')
            && failureApi.includes('connectWithNormalizedWebSocket'),
        'Lyria connection has a deadline, closes late sessions, and normalizes its SDK WebSocket'
    );
    assert(!engine.includes('setupReject'), 'Lyria setup cannot leave a rejected promise after transport failure');
    assert(!engine.includes('fade.gain.linearRampToValueAtTime'), 'Lyria no longer fades every PCM chunk independently');
    assert(playback.includes('source.connect(output)'), 'Lyria chunks share one continuous playback bus');
    assert(
        engine.includes('gain: liveMasterVolume') && engine.includes('liveMasterVolume = safe'),
        'native Lyria chunks follow live volume changes before settings persistence'
    );
    assert(!engine.includes('audioFormat:') && !engine.includes('sampleRateHz:'),
        'Lyria sends only fields supported by the deployed Live Music generation config');
    assert(bridge.includes('/api/audioflix/save-soundlab-recording'), 'recording save route is registered');
    assert(
        credentials.includes("sessionStorage.setItem('eveAudioflixSoundLabApiKey', normalizedKey)"),
        'Gemini Link securely hands its saved credential to Sonic Forge for this tab'
    );
}

(async () => {
    staticContracts();
    const fixture = path.join(os.tmpdir(), `eveos-soundlab-${process.pid}.html`);
    const modules = [
        path.join(AUDIOFLIX, 'audioflix.soundlab.state.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.codec.js'),
        path.join(GEMINI_SOCKET, 'geminiApiFailure.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.sdk.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.playback.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.engine.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.recording.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.midi.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.presets.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.render.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.events.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.knob-input.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.js')
    ].map((file) => `<script src="${fileUrl(file)}"></script>`).join('');
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
            const migratedPromptControlView = first.promptControlView;
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
            const legacyPayload = [
                ['Legacy Chill', [
                    ['prompt-0', {
                        promptId: 'prompt-0',
                        text: 'legacy glass bells',
                        weight: 1.4,
                        cc: 4,
                        color: '#20e3b2'
                    }]
                ]],
                ['Legacy Config', {
                    bpm: 123,
                    density: 0.61,
                    currentScale: 'G_MAJOR_E_MINOR'
                }]
            ];
            await window.EveAudioflixSoundLabPresets.importFile(new File(
                [JSON.stringify(legacyPayload)],
                'legacy-scenes.json',
                { type: 'application/json' }
            ));

            const host = document.querySelector('#host');
            host.innerHTML = window.EveAudioflixSoundLabUi.render();
            window.EveAudioflixSoundLabUi.setVisible(true);
            window.EveAudioflixSoundLabUi.afterRender(host);
            await new Promise((resolve) => setTimeout(resolve, 80));

            const current = stateApi.ensure();
            const legacyPromptPreset = current.presets.find((preset) => preset.name === 'Legacy Chill');
            const legacyConfigPreset = current.presets.find((preset) => preset.name === 'Legacy Config');
            const serialized = JSON.stringify(window.__soundLabRoot);
            const visualModes = [...host.querySelectorAll('[data-sf-field="visualizer-mode"] option')]
                .map((option) => option.value);
            const knobButton = host.querySelector('[data-af-action="soundlab-control-view"][data-sf-view="knobs"]');
            await window.EveAudioflixSoundLabUi.handleAction(knobButton);
            host.innerHTML = window.EveAudioflixSoundLabUi.render();
            window.EveAudioflixSoundLabUi.afterRender(host);
            const generationKnobCount = host.querySelectorAll(
                '.sonic-forge-control .sonic-forge-knob-shell:not(.is-prompt)'
            ).length;
            const promptKnobCount = host.querySelectorAll('.sonic-forge-knob-shell.is-prompt').length;
            const knobBoundCount = host.querySelectorAll('[data-sf-knob-bound="1"]').length;
            const promptText = host.querySelector('[data-sf-field="prompt-text"]');
            const promptId = promptText.dataset.sfPrompt;
            const promptBeforeInput = stateApi.ensure().prompts.find((prompt) => prompt.id === promptId).text;
            const promptSteeringCalls = [];
            const promptQueueSteering = window.EveAudioflixSoundLabEngine.queueSteering;
            window.EveAudioflixSoundLabEngine.queueSteering = () => promptSteeringCalls.push(true);
            promptText.value = 'committed only after blur';
            window.EveAudioflixSoundLabUi.handleInput(promptText);
            const promptAfterInput = stateApi.ensure().prompts.find((prompt) => prompt.id === promptId).text;
            await window.EveAudioflixSoundLabUi.handleChange(promptText);
            await window.EveAudioflixSoundLabUi.handleChange(promptText);
            const promptAfterCommit = stateApi.ensure().prompts.find((prompt) => prompt.id === promptId).text;
            window.EveAudioflixSoundLabEngine.queueSteering = promptQueueSteering;
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
            const pcmBytes = new Uint8Array(400);
            const pcmView = new DataView(pcmBytes.buffer);
            for (let frame = 0; frame < 100; frame += 1) {
                pcmView.setInt16(frame * 4, frame % 2 ? 26000 : -26000, true);
                pcmView.setInt16(frame * 4 + 2, frame % 2 ? 6500 : -6500, true);
            }
            let binary = '';
            pcmBytes.forEach((value) => { binary += String.fromCharCode(value); });
            const transformed = window.EveAudioflixSoundLabCodec.decodeBase64(
                window.EveAudioflixSoundLabCodec.transformPcm16Base64(btoa(binary), {
                    channels: 2,
                    gain: 0.5,
                    stereoBalance: true
                })
            );
            const transformedView = new DataView(
                transformed.buffer,
                transformed.byteOffset,
                transformed.byteLength
            );
            const transformedLevels = [0, 0];
            for (let frame = 0; frame < 100; frame += 1) {
                transformedLevels[0] += Math.abs(transformedView.getInt16(frame * 4, true));
                transformedLevels[1] += Math.abs(transformedView.getInt16(frame * 4 + 2, true));
            }
            const NativeWebSocket = window.WebSocket;
            window.WebSocket = class SmokeWebSocket {
                constructor(url) { window.__soundLabSocketUrl = String(url); }
            };
            const fakeSession = {
                setWeightedPrompts: async () => true,
                setMusicGenerationConfig: async (value) => {
                    window.__soundLabMusicConfig = value?.musicGenerationConfig;
                    return true;
                },
                close: () => queueMicrotask(() => window.__soundLabFirstCallbacks?.onclose({
                    code: 1000,
                    reason: 'Intentional disconnect'
                }))
            };
            window.__soundLabConnectCalls = 0;
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor(options) {
                        window.__soundLabApiVersion = options?.apiVersion;
                        this.live = { music: { connect: (options) => {
                            window.__soundLabConnectCalls += 1;
                            window.__soundLabFirstCallbacks = options.callbacks;
                            new WebSocket('wss://generativelanguage.googleapis.com//ws/test');
                            queueMicrotask(() => options.callbacks.onmessage({ setupComplete: {} }));
                            return Promise.resolve(fakeSession);
                        } } };
                    }
                }
            };
            const connected = await Promise.all([
                window.EveAudioflixSoundLabEngine.connect(),
                window.EveAudioflixSoundLabEngine.connect()
            ]);
            const normalizedSocketUrl = window.__soundLabSocketUrl;
            const singleFlightConnect = connected[0] === connected[1]
                && window.__soundLabConnectCalls === 1;
            const musicConfig = window.__soundLabMusicConfig;
            await window.EveAudioflixSoundLabEngine.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 0));
            const intentionalDisconnectStatus = window.EveAudioflixSoundLabEngine.getStatus();
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor(options) {
                        this.live = { music: { connect: (connectOptions) => {
                            queueMicrotask(() => connectOptions.callbacks.onclose({
                                code: 1008,
                                reason: 'The provided API key has an IP address restriction. The originating IP address is not allowed.'
                            }));
                            return new Promise(() => {});
                        } } };
                    }
                }
            };
            let restrictedMessage = '';
            try {
                await window.EveAudioflixSoundLabEngine.connect();
            } catch (error) {
                restrictedMessage = String(error?.message || error);
            }
            window.WebSocket = NativeWebSocket;
            delete window.EveAudioflixGenAI;
            const sessionKeyBeforeClear = sessionStorage.getItem('eveAudioflixSoundLabApiKey');
            window.EveAudioflixSoundLabEngine.setApiKey('');
            window.EveAudioflixSoundLabUi.setVisible(false);
            return {
                sameIdentity: first === second,
                migratedControlView,
                migratedPromptControlView,
                promptCount: current.prompts.length,
                presetNames: current.presets.map((preset) => preset.name),
                legacyPromptText: legacyPromptPreset?.prompts?.[0]?.text || '',
                legacyConfig: legacyConfigPreset?.config || {},
                presetMessage: window.EveAudioflixSoundLabPresets.getMessage(),
                initialVolume,
                volumeAfterPreview,
                volumeAfterCommit,
                sessionKeyBeforeClear,
                sessionKeyAfterClear: sessionStorage.getItem('eveAudioflixSoundLabApiKey'),
                normalizedSocketUrl,
                singleFlightConnect,
                musicConfig,
                intentionalDisconnectStatus,
                apiVersion: window.__soundLabApiVersion,
                restrictedMessage,
                leakedCredential: serialized.includes('soundlab-session-test'),
                hasTitle: host.querySelector('h2')?.textContent === 'Sonic Forge',
                hasCredentialEditor: !!host.querySelector('[data-sf-field="api-key"]'),
                hasClearKey: !!host.querySelector('[data-af-action="soundlab-clear-key"]'),
                credentialNotice: host.querySelector('.sonic-forge-credential-note')?.textContent || '',
                visualModes,
                generationKnobCount,
                promptKnobCount,
                knobBoundCount,
                promptBeforeInput,
                promptAfterInput,
                promptAfterCommit,
                promptSteeringCalls: promptSteeringCalls.length,
                hasSessionTimer: !!host.querySelector('[data-sf-session-time]'),
                timeline: window.EveAudioflixSoundLabEngine.getTimeline(),
                transformedLevels,
                controlView: stateApi.ensure().controlView,
                promptControlView: stateApi.ensure().promptControlView,
                steeringCalls,
                hasRecording: !!host.querySelector('[data-af-action="soundlab-toggle-record"]'),
                hasImport: !!host.querySelector('[data-af-action="soundlab-import-presets"]'),
                errors: window.__soundLabErrors
            };
        });

        assert(result.sameIdentity, 'state reads preserve object identity');
        assert(result.migratedControlView === 'sliders', 'schema-v1 scenes migrate the control view default');
        assert(result.migratedPromptControlView === 'knobs', 'legacy scenes gain Prompt Mixer knobs');
        assert(result.promptCount >= 1 && result.promptCount <= 16, 'prompt collection is bounded');
        assert(result.presetNames.includes('Smoke Scene'), 'saved scene persists in Audioflix state');
        assert(result.presetNames.includes('Imported Scene'), 'scene JSON imports into Audioflix state');
        assert(
            result.legacyPromptText === 'legacy glass bells'
                && result.legacyConfig.bpm === 123
                && result.legacyConfig.scale === 'G_MAJOR_E_MINOR'
                && /legacy/i.test(result.presetMessage),
            'original AI Sound prompt and config preset arrays import as native scenes'
        );
        assert(result.initialVolume === result.volumeAfterPreview, 'volume preview avoids config write amplification');
        assert(result.volumeAfterCommit === 0.31, 'volume change commits after interaction');
        assert(result.sessionKeyBeforeClear === 'soundlab-session-test', 'credential is retained for this browser session');
        assert(result.sessionKeyAfterClear === null, 'test credential is cleared after use');
        assert(
            result.normalizedSocketUrl === 'wss://generativelanguage.googleapis.com/ws/test',
            'Lyria SDK double-slash WebSocket paths are normalized before connection'
        );
        assert(result.singleFlightConnect, 'concurrent Lyria connect requests share one transport attempt');
        assert(
            result.intentionalDisconnectStatus.phase === 'idle'
                && result.intentionalDisconnectStatus.message === 'Disconnected.',
            'an intentional disconnect cannot be overwritten by its stale close callback'
        );
        assert(
            !Object.hasOwn(result.musicConfig, 'audioFormat')
                && !Object.hasOwn(result.musicConfig, 'sampleRateHz')
                && !Object.hasOwn(result.musicConfig, 'scale'),
            'default steering omits unsupported transport fields and the unspecified scale'
        );
        assert(result.apiVersion === 'v1alpha', 'Lyria uses the deployed Live Music WebSocket endpoint');
        assert(
            /ip allowlist/i.test(result.restrictedMessage),
            'Lyria exposes actionable IP restriction diagnostics instead of a generic disconnect'
        );
        assert(result.leakedCredential === false, 'session credential never enters datapack state');
        assert(
            !result.hasCredentialEditor && !result.hasClearKey
                && result.credentialNotice.includes('Session Controls'),
            'Sonic Forge exposes Gemini Link credential status without a second key editor'
        );
        assert(result.hasTitle && result.hasRecording && result.hasImport, 'Sonic Forge workbench renders all core tools');
        assert(['frequency', 'waveform', 'radial', 'spectrogram']
            .every((mode) => result.visualModes.includes(mode)), 'all visualizer modes are available');
        assert(
            result.controlView === 'knobs' && result.generationKnobCount === 6,
            'generation knob view is functional and persisted'
        );
        assert(
            result.promptControlView === 'knobs' && result.promptKnobCount === result.promptCount,
            'each prompt weight has a persisted knob control'
        );
        assert(result.knobBoundCount >= result.promptKnobCount, 'knob controls use the low-sensitivity vertical input adapter');
        assert(
            result.promptAfterInput === result.promptBeforeInput
                && result.promptAfterCommit === 'committed only after blur'
                && result.promptSteeringCalls === 1,
            'prompt text is committed once after editing instead of steering on every keystroke'
        );
        assert(
            result.hasSessionTimer
                && Object.hasOwn(result.timeline, 'elapsedSeconds')
                && Object.hasOwn(result.timeline, 'generatedSeconds'),
            'Sonic Forge exposes a live/generated session timeline'
        );
        assert(
            Math.max(...result.transformedLevels) < 1300000
                && Math.max(...result.transformedLevels) / Math.min(...result.transformedLevels) <= 1.21,
            'native PCM volume and extreme stereo imbalance are corrected before routing'
        );
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
