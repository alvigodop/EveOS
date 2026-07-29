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

const modulePaths = [
    'audioflix.soundlab.config.js',
    'audioflix.soundlab.state.js',
    'audioflix.soundlab.effects.js',
    'audioflix.soundlab.modulation.js',
    'audioflix.soundlab.continuity.js',
    'audioflix.soundlab.scenes.js'
].map((name) => path.join(AUDIOFLIX, name));

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-soundlab-advanced-${process.pid}.html`);
    const scripts = modulePaths.map((file) => `<script src="${fileUrl(file)}"></script>`).join('');
    fs.writeFileSync(fixture, `<!doctype html><html><body>
        <script>
            window.__root = { soundLab: {
                schemaVersion: 2,
                prompts: [{ id: 'base', text: 'ambient pulse', weight: 1 }],
                config: { bpm: 84 },
                presets: []
            } };
            window.__writes = [];
            window.EveAudioflixState = {
                ensure: () => window.__root,
                update: (patch, reason) => {
                    Object.assign(window.__root, patch || {});
                    window.__writes.push(reason || '');
                    return window.__root;
                }
            };
        </script>
        ${scripts}
    </body></html>`);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            class Param {
                constructor(value = 0) { this.value = value; }
                setTargetAtTime(value) { this.value = value; }
            }
            let createdNodes = 0;
            let createdBuffers = 0;
            const node = (extra = {}) => Object.assign({
                connect(target) { return target; },
                disconnect() {}
            }, extra);
            const createNode = (extra) => {
                createdNodes += 1;
                return node(extra);
            };
            const context = {
                currentTime: 0,
                sampleRate: 48000,
                createGain: () => createNode({ gain: new Param(1) }),
                createBiquadFilter: () => createNode({
                    type: 'lowpass',
                    frequency: new Param(18000),
                    Q: new Param(0.7)
                }),
                createDelay: () => createNode({ delayTime: new Param(0) }),
                createConvolver: () => createNode({ buffer: null }),
                createStereoPanner: () => createNode({ pan: new Param(0) }),
                createDynamicsCompressor: () => createNode({
                    threshold: new Param(-3),
                    knee: new Param(3),
                    ratio: new Param(12),
                    attack: new Param(0.003),
                    release: new Param(0.25),
                    reduction: 0
                }),
                createChannelSplitter: () => createNode(),
                createChannelMerger: () => createNode(),
                createBuffer: (channels, length) => {
                    createdBuffers += 1;
                    const data = Array.from({ length: channels }, () => new Float32Array(length));
                    return { getChannelData: (channel) => data[channel] };
                }
            };

            const stateApi = window.EveAudioflixSoundLabState;
            const state = stateApi.ensure();
            const rack = window.EveAudioflixSoundLabEffects.create(context);
            rack.apply(state.effects);
            const nodesAfterCreate = createdNodes;
            const buffersWhileDisabled = createdBuffers;
            for (let index = 0; index < 8; index += 1) {
                rack.apply(stateApi.cleanEffects({
                    ...state.effects,
                    filter: {
                        ...state.effects.filter,
                        enabled: true,
                        frequency: 12000 - index * 300
                    }
                }));
            }
            const nodesAfterUpdates = createdNodes;
            const wet = stateApi.cleanEffects({
                ...state.effects,
                reverb: { ...state.effects.reverb, enabled: true, decay: 1.2, mix: 0.2 }
            });
            rack.apply(wet);
            rack.apply(wet);
            const buffersAfterSameDecay = createdBuffers;
            rack.apply(stateApi.cleanEffects({
                ...wet,
                reverb: { ...wet.reverb, decay: 2.1 }
            }));
            const buffersAfterDecayChange = createdBuffers;

            const modulationValues = [];
            const rafQueue = [];
            const nativeRaf = window.requestAnimationFrame;
            const nativeCancelRaf = window.cancelAnimationFrame;
            window.requestAnimationFrame = (callback) => {
                rafQueue.push(callback);
                return rafQueue.length;
            };
            window.cancelAnimationFrame = () => {};
            const analyser = {
                frequencyBinCount: 64,
                fftSize: 128,
                context: { sampleRate: 48000 },
                getByteFrequencyData(target) {
                    target.fill(92);
                    for (let index = 0; index < 12; index += 1) target[index] = 220;
                },
                getFloatTimeDomainData(target) {
                    target.forEach((_, index) => {
                        target[index] = Math.sin(index / 5) * 0.2;
                    });
                }
            };
            const modulationState = {
                modulation: {
                    enabled: true,
                    smoothing: 0,
                    lowToFilter: { enabled: true, depth: 0.7 },
                    rmsToReverb: { enabled: true, depth: 0.5 },
                    highToWidth: { enabled: true, depth: 0.4 }
                },
                effects: {
                    filter: { enabled: true, frequency: 8000 },
                    reverb: { enabled: true, mix: 0.2 },
                    stereo: { enabled: true, width: 1 }
                }
            };
            const writesBeforeModulation = window.__writes.length;
            const modulation = window.EveAudioflixSoundLabModulation.create({
                analyser: () => analyser,
                effects: () => ({ applyModulation: (values) => modulationValues.push(values) }),
                state: () => modulationState
            });
            modulation.start();
            rafQueue.shift()(50);
            modulation.stop();
            window.requestAnimationFrame = nativeRaf;
            window.cancelAnimationFrame = nativeCancelRaf;
            const modulationWrites = window.__writes.length - writesBeforeModulation;

            stateApi.update({
                effects: wet,
                masterVolume: 0.32,
                config: { ...stateApi.ensure().config, bpm: 84 }
            }, 'smoke-scene-a');
            stateApi.captureSceneSlot('a');
            stateApi.update({
                effects: stateApi.cleanEffects({
                    ...wet,
                    delay: { ...wet.delay, enabled: true, mix: 0.35 }
                }),
                masterVolume: 0.76,
                config: { ...stateApi.ensure().config, bpm: 132 }
            }, 'smoke-scene-b');
            stateApi.captureSceneSlot('b');
            const sceneApplies = [];
            window.EveAudioflixSoundLabEngine = {
                applyScene: (scene, options) => sceneApplies.push({
                    bpm: scene.config.bpm,
                    volume: scene.masterVolume,
                    steer: options?.steer === true,
                    transient: options?.transient === true
                })
            };
            const writesBeforeMorph = window.__writes.length;
            window.EveAudioflixSoundLabScenes.morph('a', 'b', 0.5);
            await new Promise((resolve) => setTimeout(resolve, 760));
            const morphWrites = window.__writes.slice(writesBeforeMorph);

            const nativeTimeout = window.setTimeout;
            const nativeClearTimeout = window.clearTimeout;
            const nativeRandom = Math.random;
            const scheduled = [];
            window.setTimeout = (callback) => {
                scheduled.push(callback);
                return scheduled.length;
            };
            window.clearTimeout = () => {};
            Math.random = () => 0;
            let recoveryCalls = 0;
            const recoveryNotices = [];
            const continuity = window.EveAudioflixSoundLabContinuity.create({
                policy: () => ({ autoReconnect: true, maxAttempts: 2 }),
                recover: async () => {
                    recoveryCalls += 1;
                    throw new Error(`failure ${recoveryCalls}`);
                },
                publish: (notice) => recoveryNotices.push(notice)
            });
            continuity.setIntent('playing');
            continuity.onDisconnect({ message: 'transport lost' });
            while (scheduled.length) await scheduled.shift()();
            const continuityState = continuity.getState();
            window.setTimeout = nativeTimeout;
            window.clearTimeout = nativeClearTimeout;
            Math.random = nativeRandom;

            return {
                nodesAfterCreate,
                nodesAfterUpdates,
                buffersWhileDisabled,
                buffersAfterSameDecay,
                buffersAfterDecayChange,
                modulationValues,
                modulationWrites,
                sceneApplies,
                morphWrites,
                finalBpm: stateApi.ensure().config.bpm,
                finalVolume: stateApi.ensure().masterVolume,
                recoveryCalls,
                recoveryNotices,
                continuityState
            };
        });

        assert(
            result.nodesAfterCreate === result.nodesAfterUpdates,
            'effect edits reuse one persistent WebAudio graph'
        );
        assert(result.buffersWhileDisabled === 0, 'disabled reverb allocates no impulse buffer');
        assert(
            result.buffersAfterSameDecay === 1 && result.buffersAfterDecayChange === 2,
            'reverb reuses an unchanged impulse and rebuilds only after decay changes'
        );
        assert(
            result.modulationValues.some((value) => Object.keys(value).length === 3)
                && result.modulationWrites === 0,
            'analyser modulation drives local DSP without datapack write amplification'
        );
        assert(
            result.sceneApplies.length >= 4
                && result.sceneApplies.filter((entry) => entry.steer).length <= 2
                && result.sceneApplies.some((entry) => entry.transient)
                && result.sceneApplies.at(-1)?.transient === false
                && result.morphWrites.filter((reason) =>
                    reason === 'audioflix-soundlab-scene-morph').length === 1
                && result.finalBpm === 132
                && result.finalVolume === 0.76,
            'A/B morph previews locally, throttles remote steering, and commits once'
        );
        assert(
            result.recoveryCalls === 2
                && result.continuityState.attempt === 2
                && result.recoveryNotices.at(-1)?.connectionState === 'error',
            'continuity recovery stops at its configured attempt budget'
        );
        console.log('AUDIOFLIX_SOUNDLAB_ADVANCED_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
