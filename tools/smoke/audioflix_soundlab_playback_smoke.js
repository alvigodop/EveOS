const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let clock = 0;
global.window = {
    performance: { now: () => clock * 1000 },
    EveAudioflixSoundLabPlayback: {},
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
require(path.join(
    ROOT,
    'js',
    'modules',
    'features',
    'audioflix',
    'audioflix.soundlab.playback.js'
));

const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

const starts = [];
const sourceNodes = [];
const playbackSources = [];
const cacheSources = [];
const cacheStarts = [];
const notices = [];
const gain = {
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
    setValueAtTime() {},
    linearRampToValueAtTime() {}
};
const context = {
    currentTime: 0,
    state: 'running',
    createBufferSource() {
        const source = {
            buffer: null,
            connect() {},
            disconnect() {},
            stop() { this.onended?.(); },
            start(at, offset, duration) {
                this.startedAt = at;
                if (arguments.length === 1) {
                    starts.push(at);
                    playbackSources.push(this);
                } else {
                    cacheStarts.push(at);
                    cacheSources.push(this);
                }
            },
            onended: null
        };
        sourceNodes.push(source);
        return source;
    },
    createGain() {
        return {
            gain: Object.assign({}, gain),
            connect() {},
            disconnect() {}
        };
    }
};
const output = { gain };
const playback = window.EveAudioflixSoundLabPlayback.create({
    context: () => context,
    output: () => output,
    isPlaying: () => true,
    targetSeconds: () => 0.65,
    publish: (notice) => notices.push(notice)
});
const oneSecond = () => ({ duration: 1 });

playback.start();
playback.enqueue(oneSecond());
playback.enqueue(oneSecond());
assert(starts.length === 0, 'playback waits for the robust initial reserve');

playback.enqueue(oneSecond());
assert(starts.length === 3, 'three buffered seconds start as one scheduled sequence');
assert(starts[0] >= 0.35, 'initial playback leaves a scheduling safety lead');
assert(
    Math.abs(starts[1] - starts[0] - 1) < 0.0001
        && Math.abs(starts[2] - starts[1] - 1) < 0.0001,
    'PCM chunks are scheduled gaplessly'
);

clock = starts[2] + 1;
context.currentTime = clock;
playbackSources.slice(0, 3).forEach((source) => source.onended?.());
assert(playback.metrics().underruns === 0, 'bounded concealment covers the first dry boundary');
clock += 3.1;
context.currentTime = clock;
cacheSources.at(-1).onended?.();
assert(playback.metrics().underruns === 1, 'a drained queue records one underrun');

playback.enqueue(oneSecond());
playback.enqueue(oneSecond());
playback.enqueue(oneSecond());
assert(starts.length === 3, 'recovery does not restart from a single fragment');

playback.enqueue(oneSecond());
playback.enqueue(oneSecond());
assert(starts.length === 8, 'adaptive recovery resumes only after a deeper reserve');
assert(
    notices.some((notice) => /Rebuffering 4\.5s/.test(notice.message || '')),
    'rebuffer diagnostics expose the adaptive target'
);
assert(playback.metrics().rebufferTargetSeconds === 4.5, 'adaptive target remains observable');

const expectedTail = starts.at(-1) + 1;
context.currentTime = expectedTail - 0.05;
clock = context.currentTime;
playback.enqueue(oneSecond());
assert(starts.length === 9, 'a chunk arriving near the tail is scheduled immediately');
assert(
    Math.abs(starts.at(-1) - expectedTail) < 0.0001,
    'the safety lead cannot insert silence into an otherwise contiguous stream'
);

const guardedTail = starts.at(-1) + 1;
context.currentTime = guardedTail + 0.05;
clock = context.currentTime;
playbackSources.at(-1).onended?.();
playback.enqueue(oneSecond());
assert(starts.length === 9, 'one late chunk waits behind the active continuity cache');
assert(
    notices.some((notice) => /Continuity cache active; rebuilding 1\.0 \/ 2\.0s/.test(notice.message || '')),
    'cache recovery reports the fresh-material reserve'
);
playback.enqueue(oneSecond());
assert(starts.length === 11, 'two fresh seconds crossfade back from the cache as one reserve');
assert(cacheStarts.length > 0, 'the fake context exercised the continuity replay lane');
assert(
    playback.metrics().continuityPressure === 1,
    'a concealed late boundary deepens the next forward buffer instead of repeatedly using cache'
);

playback.stop();
assert(notices.at(-1)?.buffering === false, 'stop cleanup cannot reopen an underrun');
console.log('AUDIOFLIX_SOUNDLAB_PLAYBACK_SMOKE_OK');
