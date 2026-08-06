/**
 * gemini_interim_lead_smoke.js
 *
 * Live Gemini audio must stay near the live edge, not fall seconds behind and stay there.
 *
 * The scheduler guarded one direction only. RESYNC_THRESHOLD catches the queue falling BEHIND the
 * context clock, but nothing capped it running AHEAD -- and ahead is the case that actually
 * happens. Chunks that arrive while the AudioContext is still waiting for its user gesture are all
 * scheduled the moment it opens, back to back from ~0. An observed backlog of ~140 chunks put the
 * queue 6.5s into the future while the clock had advanced 0.7s, and because every later chunk is
 * scheduled after the previous one, that lead is inherited for the rest of the turn: the voice is
 * heard seconds after it was spoken and never catches up.
 *
 * Pinned here: a long backlog is dropped and playback rejoins the live edge, while ordinary jitter
 * well under the cap is left alone -- the fix is worthless if it also resets during normal
 * streaming, since that would chop the audio it is meant to smooth.
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

            const CHUNK = 0.04;
            // Every chunk decodes to a fixed-length buffer; the context clock is driven manually so
            // the arithmetic is exact rather than dependent on real playback timing.
            window.base64ToArrayBuffer = () => new ArrayBuffer(1920);
            window.createAudioBufferFromPCM = () => ({ duration: CHUNK });

            const started = [];
            const ctx = {
                currentTime: 0,
                createBuffer: () => ({ duration: 0 }),
                createBufferSource: () => ({
                    buffer: null, playbackRate: { value: 1 },
                    connect() {}, disconnect() {},
                    start(at) { started.push(at); }, stop() {}, onended: null
                }),
                createGain: () => ({ gain: { value: 1 }, connect() {} }),
                destination: {}
            };

            async function feed(count) {
                for (let i = 0; i < count; i += 1) await H.playInterimAudio('AAAA', ctx);
            }

            // A backlog arriving before the clock moves: exactly the queued-until-gesture case.
            H.stopAll();
            await feed(140);
            out.leadAfterBacklog = +(H.nextStartTime - ctx.currentTime).toFixed(3);
            // Fall back so the assertions below measure the LEAD, not the presence of a constant:
            // without this, a build missing the cap fails on "MAX_LEAD is defined" and never
            // demonstrates the seconds-behind playback that is the actual regression.
            out.maxLead = typeof H.MAX_LEAD === 'number' ? H.MAX_LEAD : 2.0;
            out.capDeclared = typeof H.MAX_LEAD === 'number';
            out.backlogScheduled = started.length;

            // Normal streaming: the clock advances with the audio, so the lead stays small and the
            // backlog guard must NOT fire and chop it.
            H.stopAll();
            ctx.currentTime = 0;
            started.length = 0;
            for (let i = 0; i < 40; i += 1) {
                await H.playInterimAudio('AAAA', ctx);
                ctx.currentTime += CHUNK;              // played out as fast as it arrives
            }
            out.leadWhenSteady = +(H.nextStartTime - ctx.currentTime).toFixed(3);
            out.steadyMonotonic = started.every((v, i) => i === 0 || v >= started[i - 1]);

            out.errors = window.__errors;
            return out;
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));
        assert(result.ready, 'the interim handler loaded');
        // Without this the rig can throw internally, schedule nothing, and every lead assertion
        // below passes on zeros. It did exactly that until the mock grew a playbackRate.
        assert(result.backlogScheduled === 140,
            `all 140 chunks actually reached the scheduler (got ${result.backlogScheduled})`);

        // THE regression: 140 chunks of 0.04s is 5.6s of audio. Unbounded, the lead ends up there.
        assert(result.leadAfterBacklog <= result.maxLead + 0.2,
            `a long backlog is dropped instead of queued out (lead ${result.leadAfterBacklog}s, cap ${result.maxLead}s)`);

        // ...but only because it was capped, not because the numbers happen to be small.
        assert(result.maxLead < 5.6,
            `the cap is below the backlog it must catch (cap ${result.maxLead}s vs 5.6s of audio)`);

        assert(result.leadWhenSteady <= result.maxLead,
            `steady streaming stays under the cap (lead ${result.leadWhenSteady}s)`);
        assert(result.steadyMonotonic,
            'steady streaming schedules chunks in order, so the guard never chops normal playback');

        console.log(`gemini interim lead OK — backlog lead ${result.leadAfterBacklog}s`
            + ` (cap ${result.maxLead}s), steady lead ${result.leadWhenSteady}s`);
        console.log('GEMINI_INTERIM_LEAD_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
