const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE = path.join(
    ROOT,
    'js',
    'modules',
    'features',
    'audioflix',
    'audioflix.soundlab.session-cache.js'
);
const fileUrl = (target) => `file:///${target.split(path.sep).join('/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

async function main() {
    const fixture = path.join(os.tmpdir(), `sf-session-cache-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8">
        <script src="${fileUrl(CACHE)}"></script>`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const sampleRate = 48000;
            const context = new OfflineAudioContext(2, sampleRate * 2.4, sampleRate);
            const output = context.createGain();
            output.connect(context.destination);

            function tone(seconds, frequency) {
                const buffer = context.createBuffer(2, Math.round(sampleRate * seconds), sampleRate);
                for (let channel = 0; channel < 2; channel += 1) {
                    const values = buffer.getChannelData(channel);
                    for (let index = 0; index < values.length; index += 1) {
                        values[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.45;
                    }
                }
                return buffer;
            }

            const first = tone(1, 220);
            const firstSource = context.createBufferSource();
            const firstGain = context.createGain();
            firstSource.buffer = first;
            firstSource.connect(firstGain);
            firstGain.connect(output);
            firstSource.start(0);

            const cache = window.EveAudioflixSoundLabSessionCache.create({
                context: () => context,
                output: () => output
            });
            cache.remember(first);
            cache.arm(1, 1, firstGain);

            let handoff = null;
            const suspended = context.suspend(1.08).then(() => {
                const nextSource = context.createBufferSource();
                const nextGain = context.createGain();
                handoff = cache.prepareHandoff(1, nextGain);
                nextSource.buffer = tone(1, 220);
                nextSource.connect(nextGain);
                nextGain.connect(output);
                nextSource.start(handoff.startAt);
                return context.resume();
            });
            const rendered = await context.startRendering();
            await suspended;
            const values = rendered.getChannelData(0);

            function rms(startSeconds, endSeconds) {
                const start = Math.round(startSeconds * sampleRate);
                const end = Math.round(endSeconds * sampleRate);
                let sum = 0;
                for (let index = start; index < end; index += 1) sum += values[index] ** 2;
                return Math.sqrt(sum / Math.max(1, end - start));
            }

            function peak(startSeconds, endSeconds) {
                const start = Math.round(startSeconds * sampleRate);
                const end = Math.round(endSeconds * sampleRate);
                let value = 0;
                for (let index = start; index < end; index += 1) {
                    value = Math.max(value, Math.abs(values[index]));
                }
                return value;
            }

            let minimumBoundaryRms = Infinity;
            const windowFrames = 256;
            const boundaryStart = Math.round(0.99 * sampleRate);
            const boundaryEnd = Math.round(1.13 * sampleRate);
            for (let start = boundaryStart; start + windowFrames <= boundaryEnd; start += windowFrames) {
                let sum = 0;
                for (let index = start; index < start + windowFrames; index += 1) {
                    sum += values[index] ** 2;
                }
                minimumBoundaryRms = Math.min(minimumBoundaryRms, Math.sqrt(sum / windowFrames));
            }
            return {
                covered: handoff?.covered === true,
                baselineRms: rms(0.7, 0.9),
                bridgeRms: rms(1, 1.075),
                resumedRms: rms(1.11, 1.3),
                minimumBoundaryRms,
                boundaryPeak: peak(0.99, 1.13),
                metrics: cache.metrics()
            };
        });

        assert(result.covered, 'the intentionally late chunk uses the session cache');
        assert(
            result.bridgeRms > result.baselineRms * 0.65,
            `cached PCM stays near normal level (${result.bridgeRms} vs ${result.baselineRms})`
        );
        assert(
            result.resumedRms > result.baselineRms * 0.65,
            `the live stream resumes without a weak handoff (${result.resumedRms})`
        );
        assert(
            result.minimumBoundaryRms > result.baselineRms * 0.25,
            `no deep volume hole appears at either crossfade (${result.minimumBoundaryRms})`
        );
        assert(
            result.boundaryPeak < 0.7,
            `the crossfade stays below the clipping/level-doubling ceiling (${result.boundaryPeak})`
        );
        assert(result.metrics.bridges === 1, 'the rendered bridge is reflected in diagnostics');
        console.log('AUDIOFLIX_SOUNDLAB_SESSION_CACHE_BROWSER_SMOKE_OK', JSON.stringify(result));
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
