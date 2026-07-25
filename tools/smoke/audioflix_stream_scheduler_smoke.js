const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js/modules/features/audioflix/audioflix.audio.bridge.js'), 'utf8');
const windowObject = {
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    EveAudioflixAudioBridge: {}
};
const context = vm.createContext({ window: windowObject, btoa: (value) => Buffer.from(value, 'binary').toString('base64') });
vm.runInContext(source, context, { filename: 'audioflix.audio.bridge.js' });

(async () => {
    const SAMPLE_RATE = 100;
    const samples = new Float32Array(100).fill(0.25);
    const buffer = { sampleRate: SAMPLE_RATE, getChannelData: () => samples };
    // Derive the expectation from the module's own chunk size. Hard-coding it meant that when
    // CHUNK_SECONDS moved 0.25 -> 0.5 the smoke started failing on arithmetic, not on a defect.
    const chunkSize = Math.max(1, Math.floor(SAMPLE_RATE * windowObject.EveAudioflixAudioBridge.CHUNK_SECONDS));
    const expectedChunks = Math.ceil(samples.length / chunkSize);
    let activeSends = 0;
    let maxConcurrentSends = 0;
    let sendCount = 0;
    let decodedSamples = 0;
    let stopCount = 0;
    let endedAt = 0;
    const progress = [];
    const startedAt = performance.now();

    const controller = windowObject.EveAudioflixAudioBridge.createStream({
        buffer,
        sendChunk: async (encoded) => {
            activeSends += 1;
            maxConcurrentSends = Math.max(maxConcurrentSends, activeSends);
            // Chunks are base64 Int16 PCM: 2 bytes per sample.
            decodedSamples += Buffer.from(String(encoded || ''), 'base64').length / 2;
            await new Promise((resolve) => setTimeout(resolve, 30));
            sendCount += 1;
            activeSends -= 1;
            return true;
        },
        stopRemote: async () => { stopCount += 1; return true; },
        onProgress: (current) => progress.push(current),
        onEnded: () => { endedAt = performance.now(); }
    });

    if (await controller.ready !== true) throw new Error('stream controller did not become ready');
    while (!endedAt && performance.now() - startedAt < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }

    if (maxConcurrentSends !== 1) throw new Error(`chunk sends overlapped (${maxConcurrentSends})`);
    if (sendCount !== expectedChunks) throw new Error(`expected ${expectedChunks} ordered chunks, got ${sendCount}`);
    if (decodedSamples !== samples.length) throw new Error(`chunks must cover every sample exactly once (${decodedSamples}/${samples.length})`);
    if (stopCount !== 1) throw new Error(`expected one pre-start queue clear, got ${stopCount}`);
    if (!endedAt || endedAt - startedAt < 850) throw new Error('stream reported ended before queued audio elapsed');
    if (progress.some((value, index) => index && value < progress[index - 1])) throw new Error('progress moved backwards');
    console.log('AUDIOFLIX_STREAM_SCHEDULER_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
