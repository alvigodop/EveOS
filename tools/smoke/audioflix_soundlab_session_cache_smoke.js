const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
global.window = {
    EveAudioflixSoundLabConcealment: {},
    EveAudioflixSoundLabSessionCache: {}
};
require(path.join(
    ROOT,
    'js',
    'modules',
    'features',
    'audioflix',
    'audioflix.soundlab.concealment.js'
));
require(path.join(
    ROOT,
    'js',
    'modules',
    'features',
    'audioflix',
    'audioflix.soundlab.session-cache.js'
));

const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

function audioBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    data.forEach((channel, channelIndex) => {
        for (let index = 0; index < channel.length; index += 1) {
            channel[index] = Math.sin((index + channelIndex) / 19);
        }
    });
    return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (channel) => data[channel]
    };
}

const sources = [];
const context = {
    currentTime: 0,
    sampleRate: 48000,
    createBuffer: audioBuffer,
    createGain() {
        return {
            gain: {
                cancelScheduledValues() {},
                cancelAndHoldAtTime() {},
                setValueAtTime() {},
                linearRampToValueAtTime() {}
            },
            connect() {},
            disconnect() {}
        };
    },
    createBufferSource() {
        const source = {
            connect() {},
            disconnect() {},
            start(at, offset, duration) {
                this.startedAt = at;
                this.offset = offset;
                this.duration = duration;
            },
            stop(at) { this.stoppedAt = at; },
            onended: null
        };
        sources.push(source);
        return source;
    }
};
const output = {};
let exhausted = 0;
const cache = window.EveAudioflixSoundLabSessionCache.create({
    context: () => context,
    output: () => output,
    onExhausted: () => { exhausted += 1; }
});

const twoSecondStereo = audioBuffer(2, 96000, 48000);
assert(cache.remember(twoSecondStereo), 'a live PCM tail is retained');
let metrics = cache.metrics();
assert(metrics.mode === 'memory-concealment', 'the cache uses bounded overlap-add concealment');
assert(metrics.usableTailSeconds === 1.25, 'only a short recent tail remains usable for concealment');
assert(metrics.bytes <= 48000 * 1.25 * 2 * 4, 'the RAM cache has a strict usable-byte ceiling');
assert(metrics.retainedBytes === 96000 * 2 * 4, 'the cache reuses one decoded chunk without copying PCM');

assert(cache.arm(2, 7), 'a cached guard is armed at the scheduled stream tail');
const openingGrains = sources.slice();
assert(openingGrains.length > 8, 'a bridge is assembled from short overlapping grains');
assert(
    openingGrains.every((source) => source.duration <= 0.18 && source.loop !== true),
    'concealment cannot replay or loop a whole recognizable phrase'
);
assert(
    new Set(openingGrains.slice(1).map((source) => source.offset.toFixed(4))).size > 4,
    'grain offsets vary across the recent tail instead of repeating one fixed fragment'
);
context.currentTime = 1.95;
let handoff = cache.prepareHandoff(2);
assert(handoff.startAt === 2 && !handoff.covered, 'an on-time chunk preserves the exact boundary');

cache.arm(4, 7);
context.currentTime = 4.08;
handoff = cache.prepareHandoff(4);
metrics = cache.metrics();
assert(handoff.covered && handoff.startAt > context.currentTime, 'a late chunk gets a safe cache handoff');
assert(metrics.bridges === 1 && metrics.bridgedSeconds > 0, 'covered micro-gaps are observable');
assert(exhausted === 0, 'a successful cache handoff does not report an underrun');

cache.arm(6, 7);
context.currentTime = 8.7;
handoff = cache.prepareHandoff(6);
assert(handoff.exhausted && handoff.startAt === 0, 'an expired guard requests deep rebuffering');

cache.arm(8, 9);
context.currentTime = 10.7;
sources.at(-1).onended();
assert(exhausted === 1, 'an unfilled cache guard reports one bounded underrun');

cache.clear();
metrics = cache.metrics();
assert(
    metrics.bytes === 0 && metrics.retainedBytes === 0 && metrics.bridges === 0
        && !metrics.armed && metrics.activeSources === 0,
    'stop clears all session cache state and source references'
);
console.log('AUDIOFLIX_SOUNDLAB_SESSION_CACHE_SMOKE_OK');
