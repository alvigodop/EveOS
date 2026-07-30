const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const {
    staticContracts,
    assertResult
} = require('./helpers/audioflix_soundlab_contracts');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const GEMINI_SOCKET = path.join(
    ROOT, 'js', 'modules', 'gemini', 'client', 'connection_management', 'socket_core'
);
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;

(async () => {
    staticContracts();
    const fixture = path.join(os.tmpdir(), `eveos-soundlab-${process.pid}.html`);
    const modules = [
        path.join(AUDIOFLIX, 'audioflix.soundlab.config.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.drift.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.state.js'),
        path.join(AUDIOFLIX, 'audioflix.capture.processor.src.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.codec.js'),
        path.join(GEMINI_SOCKET, 'geminiApiFailure.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.sdk.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.playback.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.effects.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.native-capture.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.modulation.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.connection.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.continuity.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.steering.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.engine.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.scenes.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.overlay.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.visualizer.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.recording.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.rendered.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.midi.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.presets.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.advanced.js'),
        path.join(AUDIOFLIX, 'audioflix.soundlab.ui.advanced.events.js'),
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
            const migratedSchemaVersion = first.schemaVersion;
            const neutralEffects = {
                filter: first.effects.filter.enabled,
                delay: first.effects.delay.enabled,
                reverb: first.effects.reverb.enabled,
                stereo: first.effects.stereo.enabled,
                limiter: first.effects.limiter.enabled
            };
            const initialVolume = first.masterVolume;

            window.EveAudioflixSoundLabEngine.setApiKey('soundlab-session-test');
            window.EveAudioflixSoundLabEngine.setMasterVolume(0.31, false);
            const volumeAfterPreview = stateApi.ensure().masterVolume;
            window.EveAudioflixSoundLabEngine.setMasterVolume(0.31, true);
            const volumeAfterCommit = stateApi.ensure().masterVolume;

            stateApi.update({
                effects: stateApi.cleanEffects({
                    ...stateApi.ensure().effects,
                    delay: {
                        ...stateApi.ensure().effects.delay,
                        enabled: true,
                        mix: 0.19
                    }
                })
            }, 'soundlab-smoke-effect');
            stateApi.savePreset('Smoke Scene');
            const savedScene = stateApi.ensure().presets.find((preset) => preset.name === 'Smoke Scene');
            stateApi.captureSceneSlot('a');
            stateApi.update({
                config: { ...stateApi.ensure().config, bpm: 101 },
                masterVolume: 0.41
            }, 'soundlab-smoke-scene-b');
            stateApi.captureSceneSlot('b');
            const capturedSlots = stateApi.ensure().sceneSlots;
            stateApi.applySceneSlot('a');
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
            const advancedPanels = {
                effects: !!host.querySelector('.sonic-forge-effects'),
                modulation: !!host.querySelector('.sonic-forge-modulation'),
                scenes: !!host.querySelector('.sonic-forge-scene-slots'),
                diagnostics: !!host.querySelector('.sonic-forge-diagnostics'),
                rendered: !!host.querySelector('.sonic-forge-rendered')
            };
            const reverbDecay = host.querySelector(
                '[data-sf-field="effect"][data-sf-effect="reverb"][data-sf-effect-key="decay"]'
            );
            const decayBeforeInput = stateApi.ensure().effects.reverb.decay;
            const effectApplyCalls = [];
            const originalApplyEffects = window.EveAudioflixSoundLabEngine.applyEffects;
            window.EveAudioflixSoundLabEngine.applyEffects = (effects) => {
                effectApplyCalls.push(effects);
                return true;
            };
            reverbDecay.value = '3.4';
            window.EveAudioflixSoundLabUi.handleInput(reverbDecay);
            const decayAfterInput = stateApi.ensure().effects.reverb.decay;
            await window.EveAudioflixSoundLabUi.handleChange(reverbDecay);
            const decayAfterCommit = stateApi.ensure().effects.reverb.decay;
            window.EveAudioflixSoundLabEngine.applyEffects = originalApplyEffects;
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
            const renderedBinary = btoa('rendered-audio-smoke'.repeat(16));
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor(options) {
                        window.__renderedApiVersion = options?.apiVersion;
                        this.interactions = {
                            create: async (request) => {
                                window.__renderedRequest = request;
                                return {
                                    output_audio: {
                                        data: renderedBinary,
                                        mime_type: 'audio/mpeg'
                                    }
                                };
                            }
                        };
                    }
                }
            };
            const renderedGenerated = await window.EveAudioflixSoundLabRendered.generate({
                model: 'lyria-3-clip-preview',
                prompt: 'bounded render smoke'
            });
            const renderedStatus = window.EveAudioflixSoundLabRendered.getStatus();
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
                play: async () => { throw new Error('play transport rejected'); },
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
            let playFailure = '';
            try {
                await window.EveAudioflixSoundLabEngine.play();
            } catch (error) {
                playFailure = String(error?.message || error);
            }
            const playFailureStatus = window.EveAudioflixSoundLabEngine.getStatus();
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
                migratedSchemaVersion,
                migratedControlView,
                migratedPromptControlView,
                bufferSeconds: first.bufferSeconds,
                neutralEffects,
                savedSceneHasEffects: savedScene?.effects?.delay?.enabled === true
                    && savedScene?.effects?.delay?.mix === 0.19,
                capturedSlots: {
                    aBpm: capturedSlots.a?.config?.bpm,
                    bBpm: capturedSlots.b?.config?.bpm,
                    aVolume: capturedSlots.a?.masterVolume,
                    bVolume: capturedSlots.b?.masterVolume
                },
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
                playFailure,
                playFailureStatus,
                intentionalDisconnectStatus,
                apiVersion: window.__soundLabApiVersion,
                restrictedMessage,
                leakedCredential: serialized.includes('soundlab-session-test'),
                hasTitle: host.querySelector('h2')?.textContent === 'Sonic Forge',
                hasCredentialEditor: !!host.querySelector('[data-sf-field="api-key"]'),
                hasClearKey: !!host.querySelector('[data-af-action="soundlab-clear-key"]'),
                credentialNotice: host.querySelector('.sonic-forge-credential-note')?.textContent || '',
                visualModes,
                advancedPanels,
                decayBeforeInput,
                decayAfterInput,
                decayAfterCommit,
                effectApplyCalls: effectApplyCalls.length,
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
                renderedGenerated,
                renderedStatus,
                renderedRequest: window.__renderedRequest,
                renderedApiVersion: window.__renderedApiVersion,
                controlView: stateApi.ensure().controlView,
                promptControlView: stateApi.ensure().promptControlView,
                steeringCalls,
                hasRecording: !!host.querySelector('[data-af-action="soundlab-toggle-record"]'),
                hasImport: !!host.querySelector('[data-af-action="soundlab-import-presets"]'),
                errors: window.__soundLabErrors
            };
        });

        assertResult(result);
        console.log('AUDIOFLIX_SOUNDLAB_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
