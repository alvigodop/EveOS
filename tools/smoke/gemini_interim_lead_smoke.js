/**
 * gemini_interim_lead_smoke.js
 *
 * Exercises the actual InterimIngestHandler used when Gemini Live's
 * "Play Interim Audio Chunks" path is enabled. The scheduler must start with
 * jitter headroom, recover from a realistic packet stall, and preserve every
 * PCM chunk in a long monotonic response without cutting audible speech.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const HANDLER = path.join(ROOT, 'js', 'modules', 'gemini', 'agentic', 'audio_proc',
    'playback_proc', 'audio_injest_core', 'interimIngestHandler.js');
const fileUrl = (target) => 'file:///' + target.split(path.sep).join('/');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

async function main() {
    const fixture = path.join(os.tmpdir(), `gem-lead-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script>
        <script src="${fileUrl(HANDLER)}"></script>
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const H = window.AudioIngestCore && window.AudioIngestCore.InterimIngestHandler;
            const out = { ready: !!H };
            if (!H) return out;

            const waveformSchedules = [];
            window.EveLiveWaveform = {
                queueFromPcm(chunk, container, options) {
                    waveformSchedules.push({ chunk, container, options });
                }
            };
            const voiceMessage = { id: 'voice-message-player' };

            const CHUNK = 0.04;
            window.base64ToArrayBuffer = () => new ArrayBuffer(1920);
            window.createAudioBufferFromPCM = () => ({ duration: CHUNK });

            const started = [];
            let stoppedAudible = 0;
            let stoppedQueued = 0;
            const ctx = {
                currentTime: 0,
                state: 'running',
                sampleRate: 48000,
                createBuffer: () => ({ duration: 0 }),
                createBufferSource: () => {
                    const source = {
                        buffer: null,
                        playbackRate: { value: 1 },
                        connect() {}, disconnect() {},
                        start(at = 0) {
                            source.startedAt = at;
                            if (source.buffer?.duration === CHUNK) started.push(at);
                        },
                        stop() {
                            if (Number(source.startedAt) <= ctx.currentTime + 0.01) stoppedAudible += 1;
                            else stoppedQueued += 1;
                        },
                        onended: null,
                        startedAt: Number.POSITIVE_INFINITY
                    };
                    return source;
                },
                createGain: () => ({ gain: { value: 1 }, connect() {} }),
                destination: {}
            };

            async function feed(count) {
                for (let i = 0; i < count; i += 1) await H.playInterimAudio('AAAA', ctx);
            }

            // Regression: a newly created AudioContext is normally well under ten seconds old.
            // The old scheduler treated that as a normal timeline and started the first PCM
            // chunk at currentTime with no jitter cushion.
            H.stopAll('first-stream-test');
            ctx.currentTime = 0.10;
            started.length = 0;
            await H.playInterimAudio('AAAA', ctx, voiceMessage);
            out.firstStart = started[0];
            out.firstHeadroom = +(started[0] - ctx.currentTime).toFixed(3);
            out.configuredHeadroom = H.INITIAL_HEADROOM;
            out.waveformFirstDelayMs = waveformSchedules[0]?.options?.startInMs;
            out.waveformBoundToMessage = waveformSchedules[0]?.container === voiceMessage;

            // Healthy arrivals remain contiguous on the buffered timeline.
            ctx.currentTime += CHUNK;
            await H.playInterimAudio('AAAA', ctx);
            ctx.currentTime += CHUNK;
            await H.playInterimAudio('AAAA', ctx);
            out.firstThreeStarts = started.slice(0, 3);
            out.healthySpacing = +(started[2] - started[1]).toFixed(3);

            // Regression: a realistic 60 ms websocket/network stall used to put playback at
            // the live edge because the resync threshold was five seconds. Rebuffer instead.
            const beforeUnderflows = H.diagnostics.underflows;
            ctx.currentTime = H.nextStartTime + 0.06;
            const stalledAt = ctx.currentTime;
            await H.playInterimAudio('AAAA', ctx);
            const recoveredStart = started[started.length - 1];
            out.jitterRecoveryHeadroom = +(recoveredStart - stalledAt).toFixed(3);
            out.underflowRecorded = H.diagnostics.underflows > beforeUnderflows;
            out.rebufferReason = H.diagnostics.lastRebufferReason;

            ctx.currentTime += CHUNK;
            await H.playInterimAudio('AAAA', ctx);
            const afterRecoveryStart = started[started.length - 1];
            out.recoverySpacing = +(afterRecoveryStart - recoveredStart).toFixed(3);

            // Gemini can deliver long replies faster than wall-clock playback. Every PCM chunk
            // is content, not disposable latency: the prior two-second "lead cap" stopped queued
            // sources and produced the long-reply breakup that short replies never crossed.
            H.stopAll('backlog-test');
            ctx.currentTime = 0;
            started.length = 0;
            stoppedAudible = 0;
            stoppedQueued = 0;
            await feed(750); // 30 seconds of model speech arriving in a burst
            out.leadAfterBacklog = +(H.nextStartTime - ctx.currentTime).toFixed(3);
            out.backlogScheduled = started.length;
            out.backlogMonotonic = started.every((v, i) => i === 0 || v >= started[i - 1]);
            out.backlogSpan = +(started.at(-1) - started[0] + CHUNK).toFixed(3);
            out.stoppedAudibleDuringBacklog = stoppedAudible;
            out.stoppedQueuedDuringBacklog = stoppedQueued;
            out.diagnostics = H.getDiagnostics ? H.getDiagnostics() : null;

            H.stopAll('steady-test');
            ctx.currentTime = 0;
            started.length = 0;
            for (let i = 0; i < 40; i += 1) {
                await H.playInterimAudio('AAAA', ctx);
                ctx.currentTime += CHUNK;
            }
            out.leadWhenSteady = +(H.nextStartTime - ctx.currentTime).toFixed(3);
            out.steadyMonotonic = started.every((v, i) => i === 0 || v >= started[i - 1]);

            out.errors = window.__errors;
            return out;
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));
        assert(result.ready, 'the interim handler loaded');
        assert(result.firstHeadroom >= result.configuredHeadroom - 0.005,
            `first Gemini PCM chunk gets jitter headroom (${result.firstHeadroom}s)`);
        assert(result.firstHeadroom <= result.configuredHeadroom + 0.02,
            `first-turn latency stays bounded (${result.firstHeadroom}s)`);
        assert(result.waveformBoundToMessage,
            'live waveform is bound to the incoming voice message player');
        assert(Math.abs(result.waveformFirstDelayMs - (result.firstHeadroom * 1000)) < 2,
            `live waveform follows scheduled audible playback (${result.waveformFirstDelayMs}ms vs ${result.firstHeadroom * 1000}ms)`);
        assert(Math.abs(result.healthySpacing - 0.04) <= 0.002,
            `healthy chunks remain contiguous (${result.healthySpacing}s spacing)`);
        assert(result.jitterRecoveryHeadroom >= result.configuredHeadroom - 0.005,
            `60 ms packet stall re-buffers instead of starting at the live edge (${result.jitterRecoveryHeadroom}s)`);
        assert(result.underflowRecorded, 'the realistic packet stall is recorded as an underflow');
        assert(result.rebufferReason === 'underflow',
            `jitter recovery reports underflow (got ${result.rebufferReason})`);
        assert(Math.abs(result.recoverySpacing - 0.04) <= 0.002,
            `chunks after rebuffer return to contiguous scheduling (${result.recoverySpacing}s spacing)`);
        assert(result.backlogScheduled === 750,
            `all 750 long-reply chunks reached the scheduler (got ${result.backlogScheduled})`);
        assert(result.stoppedQueuedDuringBacklog === 0,
            `long reply must not discard queued speech (${result.stoppedQueuedDuringBacklog} dropped)`);
        assert(result.stoppedAudibleDuringBacklog === 0,
            'backlog recovery must never stop the source already being heard');
        assert(result.backlogMonotonic, 'long reply scheduling never jumps backward');
        assert(Math.abs(result.backlogSpan - 30) < 0.01,
            `all 30 seconds remain contiguous (got ${result.backlogSpan}s)`);
        assert(result.leadWhenSteady < 0.25,
            `steady real-time streaming keeps only jitter headroom (${result.leadWhenSteady}s)`);
        assert(result.steadyMonotonic,
            'steady streaming schedules chunks in order');

        if (process.env.EVE_SMOKE_VERBOSE === '1') {
            console.log(`gemini interim stream OK — first ${result.firstHeadroom}s headroom, `
                + `60ms stall recovered with ${result.jitterRecoveryHeadroom}s headroom, `
                + `steady lead ${result.leadWhenSteady}s`);
        }
        console.log('GEMINI_INTERIM_LEAD_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
