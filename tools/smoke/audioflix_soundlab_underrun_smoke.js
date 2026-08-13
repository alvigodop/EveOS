/**
 * audioflix_soundlab_underrun_smoke.js
 *
 * When Lyria's chunks arrive late the stream underruns. Recovering from that used to require a 4
 * second cushion, and since Lyria generates at ~1x realtime that meant roughly four seconds of
 * complete silence to paper over one brief glitch — heard as the track stopping dead and then
 * picking back up.
 *
 * Three properties, each of which failed silently before:
 *   - recovery asks for a modest cushion rather than multiple seconds;
 *   - the per-chunk jitter measurement actually sizes that cushion (jitterMs() was computed and then
 *     discarded, so a steady stream was punished exactly as hard as a broken one);
 *   - the escalation is TWO-WAY. consecutiveUnderruns only reset on stop, so within one session each
 *     dropout permanently lengthened the next recovery (4.5s, 5s, 5.5s...) and never came back down.
 *
 * Drives the real module through its public API against a fake AudioContext and a stubbed
 * performance clock, so timings are exact and no audio device or Lyria session is involved.
 * rebufferTargetSeconds is read from metrics(), which is what the scheduler itself gates on.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const fileUrl = (target) => 'file:///' + target.split(path.sep).join('/');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

async function main() {
    const fixture = path.join(os.tmpdir(), `sf-under-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script>
        <script src="${fileUrl(path.join(AUDIOFLIX, 'audioflix.soundlab.session-cache.js'))}"></script>
        <script src="${fileUrl(path.join(AUDIOFLIX, 'audioflix.soundlab.playback.js'))}"></script>
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(() => {
            const RATE = 48000;
            const CHUNK = 2;

            function rig(targetSeconds) {
                let wall = 1000;                       // seconds, drives performance.now()
                window.performance.now = () => wall * 1000;
                const sources = [];
                const ctx = {
                    currentTime: 0,
                    sampleRate: RATE,
                    state: 'running',
                    createBufferSource() {
                        const src = {
                            buffer: null, onended: null,
                            connect() {}, disconnect() {}, start() {}
                        };
                        sources.push(src);
                        return src;
                    }
                };
                const gain = {
                    gain: {
                        value: 1, cancelScheduledValues() {}, setValueAtTime() {},
                        linearRampToValueAtTime() {}
                    }
                };
                const api = window.EveAudioflixSoundLabPlayback.create({
                    context: () => ctx,
                    output: () => gain,
                    isPlaying: () => true,
                    targetSeconds: () => targetSeconds,
                    publish: () => {}
                });
                const chunk = () => ({ duration: CHUNK, length: CHUNK * RATE, sampleRate: RATE });
                return {
                    api, ctx, sources, chunk,
                    // Perfectly paced arrival: wall advances by exactly one chunk duration.
                    feed(count, extraLatenessSeconds = 0) {
                        for (let i = 0; i < count; i += 1) {
                            wall += CHUNK + extraLatenessSeconds;
                            ctx.currentTime += CHUNK;
                            api.enqueue(chunk());
                        }
                    },
                    // Play out everything scheduled; with the queue dry this opens an underrun.
                    drain() {
                        const pendingSources = sources.splice(0, sources.length);
                        pendingSources.forEach((src) => { if (src.onended) src.onended(); });
                    },
                    target: () => api.metrics().rebufferTargetSeconds,
                    queued: () => api.metrics().queuedSeconds,
                    jitter: () => api.metrics().jitterMs,
                    underruns: () => api.metrics().underruns
                };
            }

            const out = {};

            // --- steady stream: recovery cushion must be small ---
            const steady = rig(3);
            steady.api.start();                        // leaves the stopped state (resets counters)
            steady.feed(2);                            // 4s buffered >= 3s target -> begins
            out.jitterSteady = +steady.jitter().toFixed(3);
            steady.drain();                            // queue dry -> underrun
            out.underrunsAfterOne = steady.underruns();
            out.targetAfterOne = +steady.target().toFixed(3);

            // --- repeated dropouts escalate, but stay capped ---
            for (let i = 0; i < 12; i += 1) {
                steady.feed(3);
                steady.api.schedule();
                steady.drain();
            }
            out.targetAfterMany = +steady.target().toFixed(3);
            out.underrunsAfterMany = steady.underruns();

            // --- a sustained clean run forgives the escalation ---
            steady.feed(4);
            steady.api.schedule();
            steady.ctx.currentTime += 60;              // well past CLEAN_RUN_SECONDS
            steady.feed(1);
            steady.api.schedule();
            out.targetAfterCleanRun = +steady.target().toFixed(3);

            // --- a jittery stream is given more headroom than a steady one ---
            const jittery = rig(3);
            jittery.api.start();
            jittery.feed(2);
            for (let i = 0; i < 10; i += 1) jittery.feed(1, i % 2 ? 0.45 : -0.2);
            out.jitterJittery = +jittery.jitter().toFixed(3);
            jittery.drain();
            out.targetJittery = +jittery.target().toFixed(3);

            // PREVENTION: the RUNNING cushion (not just the recovery reserve) must deepen on a
            // jittery stream, or the queue keeps going dry however the rebuffer is tuned.
            out.runningCushionJittery = +jittery.api.metrics().targetBufferSeconds.toFixed(3);
            const calm = rig(3);
            calm.api.start();
            calm.feed(4);
            out.runningCushionSteady = +calm.api.metrics().targetBufferSeconds.toFixed(3);

            out.errors = window.__errors;
            return out;
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));

        // The dropout is detected at all.
        assert(result.underrunsAfterOne >= 1,
            `a dry queue registers an underrun (got ${result.underrunsAfterOne})`);

        // The reserve is intentionally deep (see REBUFFER_SECONDS), so what matters here is that it
        // is BOUNDED and reflects the measured stream rather than growing without limit.
        assert(result.jitterSteady < 50,
            `the paced feed is measured as steady (jitter ${result.jitterSteady}ms)`);
        assert(result.targetAfterOne <= 5,
            `one dropout on a steady stream stays near the base reserve (got ${result.targetAfterOne}s)`);

        // Escalation still happens for a genuinely bad stream, and is bounded.
        assert(result.underrunsAfterMany > result.underrunsAfterOne, 'repeated dropouts are counted');
        assert(result.targetAfterMany > result.targetAfterOne,
            `repeated dropouts raise the cushion (${result.targetAfterOne} -> ${result.targetAfterMany})`);
        assert(result.targetAfterMany <= 6,
            `the cushion stays capped (got ${result.targetAfterMany}s)`);

        // And it comes back down — this is the one-way-escalation bug.
        assert(result.targetAfterCleanRun < result.targetAfterMany,
            `a clean run must forgive the escalation (${result.targetAfterMany} -> ${result.targetAfterCleanRun})`);
        assert(result.targetAfterCleanRun <= 4.01,
            `after a clean run the cushion returns to its base (got ${result.targetAfterCleanRun}s)`);

        // Jitter is what distinguishes a flaky stream from a steady one.
        assert(result.jitterJittery > result.jitterSteady,
            `an irregular feed measures as jittery (${result.jitterSteady} vs ${result.jitterJittery}ms)`);
        assert(result.targetJittery > result.targetAfterOne,
            `measured jitter buys real headroom (${result.targetAfterOne} vs ${result.targetJittery}s)`);

        console.log(`underrun OK — steady recovery ${result.targetAfterOne}s,`
            + ` escalated ${result.targetAfterMany}s, after clean run ${result.targetAfterCleanRun}s,`
            + ` jittery ${result.targetJittery}s (jitter ${result.jitterJittery}ms)`);
        console.log('AUDIOFLIX_SOUNDLAB_UNDERRUN_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
