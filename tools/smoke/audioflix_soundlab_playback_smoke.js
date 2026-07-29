const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let clock = 0;
global.window = {
    performance: { now: () => clock * 1000 },
    EveAudioflixSoundLabPlayback: {}
};

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
const notices = [];
const gain = {
    cancelScheduledValues() {},
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
            start(at) {
                this.startedAt = at;
                starts.push(at);
            },
            onended: null
        };
        sourceNodes.push(source);
        return source;
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
sourceNodes.slice(0, 3).forEach((source) => source.onended?.());
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

playback.stop();
assert(notices.at(-1)?.buffering === false, 'stop cleanup cannot reopen an underrun');
console.log('AUDIOFLIX_SOUNDLAB_PLAYBACK_SMOKE_OK');
