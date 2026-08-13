const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(
    ROOT, 'js', 'modules', 'features', 'audioflix',
    'audioflix.soundlab.steering.js'
);
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
    const browser = {
        setTimeout,
        clearTimeout,
        EveAudioflixSoundLabSteering: {}
    };
    browser.window = browser;
    vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), {
        window: browser,
        console,
        Promise,
        JSON,
        Object,
        Number,
        String
    }, { filename: SOURCE });

    let config = {
        bpm: 96,
        density: 0.42,
        brightness: 0.45,
        guidance: 4,
        temperature: 0.9,
        topK: 32,
        musicGenerationMode: 'QUALITY'
    };
    let prompts = [{ text: 'stable ambient motif', weight: 1 }];
    const calls = [];
    const session = {
        async setWeightedPrompts(payload) {
            calls.push(['prompts', payload]);
        },
        async setMusicGenerationConfig(payload) {
            calls.push(['config', payload]);
        },
        resetContext() {
            calls.push(['reset']);
        }
    };
    const errors = [];
    const steering = browser.EveAudioflixSoundLabSteering.create({
        getSession: () => session,
        getPrompts: () => prompts,
        getConfig: () => config,
        isPlaying: () => true,
        publish: (status) => errors.push(status),
        delayMs: 100,
        transitionSteps: 2,
        transitionDurationMs: 20
    });

    steering.queue();
    config = Object.assign({}, config, { density: 0.44 });
    steering.queue();
    config = Object.assign({}, config, { density: 0.46 });
    steering.queue();
    await wait(170);
    assert(calls.length === 2, 'rapid edits coalesce into one prompt/config update');
    assert(
        calls[1][1].musicGenerationConfig.density === 0.46,
        'the coalesced update sends the latest full configuration'
    );

    steering.queue();
    await wait(170);
    assert(calls.length === 2, 'an unchanged steering snapshot is not resent');

    config = Object.assign({}, config, { brightness: 0.5 });
    steering.queue();
    await wait(170);
    assert(calls.length === 3, 'a soft control change sends only the full configuration lane');
    assert(calls.at(-1)[0] === 'config', 'soft controls do not resend unchanged prompts');

    config = Object.assign({}, config, { bpm: 104 });
    steering.queue();
    await wait(170);
    assert(
        calls.slice(-2).map((call) => call[0]).join(',') === 'config,reset',
        'BPM changes apply the full config before one hard context reset'
    );

    const configCallsBeforePrompt = calls.filter((call) => call[0] === 'config').length;
    prompts = [{ text: 'stable ambient motif with piano', weight: 1 }];
    steering.queue();
    await wait(230);
    const promptRamp = calls.slice(-3);
    assert(promptRamp.every((call) => call[0] === 'prompts'),
        'prompt refinement uses intermediate prompt weights without resending config');
    assert(promptRamp[0][1].weightedPrompts.length === 2,
        'the transition briefly blends the prior and incoming prompt');
    const firstIncomingWeight = promptRamp[0][1].weightedPrompts
        .find((prompt) => prompt.text === 'stable ambient motif with piano')?.weight;
    assert(firstIncomingWeight > 0.01 && firstIncomingWeight < 1,
        'a newly added prompt ramps up from the minimum weight instead of arriving at full strength');
    assert(promptRamp[0][1].weightedPrompts.every((prompt) => prompt.weight !== 0),
        'intermediate prompt weights never send the forbidden zero value');
    assert(calls.filter((call) => call[0] === 'config').length === configCallsBeforePrompt,
        'prompt-only steering leaves the generation configuration untouched');
    assert(promptRamp.at(-1)[1].weightedPrompts[0].text === 'stable ambient motif with piano',
        'the ramp finishes on the exact newest prompt snapshot');
    assert(errors.length === 0, 'steering completes without publishing errors');
    console.log('AUDIOFLIX_SOUNDLAB_STEERING_SMOKE_OK');
})().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
