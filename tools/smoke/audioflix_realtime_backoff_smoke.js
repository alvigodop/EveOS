/**
 * audioflix_realtime_backoff_smoke.js
 *
 * A native bridge that fails every chunk must stop gating live playback.
 *
 * The realtime PCM lane deliberately ignores the ordinary bridge-down cooldown, so one transient
 * failure cannot mute the router mid-sentence. Nothing handled a bridge that fails EVERY time --
 * a stale output device, or a server still running older code -- and each 40ms chunk then awaited a
 * full HTTP round-trip before it could be scheduled. The scheduler starved between bursts and the
 * voice broke into fragments: the audio path was gated on a dead endpoint.
 *
 * Both directions are pinned, because a backoff that is too eager is its own bug:
 *   - a lone failure (and a second) still retries immediately, preserving why the bypass exists;
 *   - a sustained streak goes quiet, so playback stops waiting on it;
 *   - success clears the streak at once, so a recovered bridge is used again rather than shunned.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'js', 'modules', 'features', 'audioflix', 'audioflix.native.backoff.js');
const fileUrl = (target) => 'file:///' + target.split(path.sep).join('/');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

async function main() {
    const fixture = path.join(os.tmpdir(), `af-backoff-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script>
        <script src="${fileUrl(MODULE)}"></script>
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(() => {
            const B = window.EveAudioflixNativeBackoff;
            const out = { ready: !!B };
            if (!B) return out;

            out.tolerance = B.FAIL_TOLERANCE;

            // A healthy bridge is never skipped.
            B.reset();
            out.skipWhenHealthy = B.shouldSkipRealtime();

            // Failures below the tolerance keep retrying — the whole point of the bypass.
            B.reset();
            const duringStreak = [];
            for (let i = 0; i < B.FAIL_TOLERANCE - 1; i += 1) {
                B.noteRealtimeResult(false);
                duringStreak.push(B.shouldSkipRealtime());
            }
            out.skippedBeforeTolerance = duringStreak.some(Boolean);

            // Reaching the tolerance goes quiet.
            B.noteRealtimeResult(false);
            out.skipAtTolerance = B.shouldSkipRealtime();
            out.quietWindowMs = B.getQuietUntil() - Date.now();

            // After the first quiet window, one failed recovery probe should re-arm a longer
            // window instead of opening another three-request burst against a known-dead bridge.
            const firstQuietUntil = B.getQuietUntil();
            const recoveryProbeAt = firstQuietUntil + 1;
            out.skipAfterQuietExpires = B.shouldSkipRealtime(recoveryProbeAt);
            B.noteRealtimeResult(false, recoveryProbeAt);
            out.skipAfterFailedRecoveryProbe = B.shouldSkipRealtime(recoveryProbeAt);
            out.recoveryQuietWindowMs = B.getQuietUntil() - recoveryProbeAt;
            out.outageLevelAfterRecoveryFailure = B.getOutageLevel();

            // A success while quiet clears it immediately: a recovered bridge is not shunned.
            B.noteRealtimeResult(true, recoveryProbeAt + 1);
            out.skipAfterSuccess = B.shouldSkipRealtime(recoveryProbeAt + 1);

            // And a single failure after recovery does NOT re-arm instantly.
            B.noteRealtimeResult(false);
            out.skipAfterLoneFailure = B.shouldSkipRealtime();

            out.errors = window.__errors;
            return out;
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));
        assert(result.ready, 'the backoff module loaded');

        assert(result.skipWhenHealthy === false, 'a healthy bridge is never skipped');
        assert(result.skippedBeforeTolerance === false,
            'failures below the tolerance still retry, so a lone hiccup cannot mute the router');
        assert(result.skipAtTolerance === true,
            `a sustained failure streak goes quiet (tolerance ${result.tolerance})`);
        assert(result.quietWindowMs > 0 && result.quietWindowMs <= 10000,
            `the quiet window is short enough to notice recovery (got ${result.quietWindowMs}ms)`);
        assert(result.skipAfterQuietExpires === false,
            'one recovery probe is allowed after the quiet window expires');
        assert(result.skipAfterFailedRecoveryProbe === true
                && result.outageLevelAfterRecoveryFailure === 2,
            'a failed recovery probe re-arms backoff without another request burst');
        assert(result.recoveryQuietWindowMs > result.quietWindowMs
                && result.recoveryQuietWindowMs <= result.quietWindowMs * 2 + 50,
            `repeated outage windows escalate in a bounded way (got ${result.recoveryQuietWindowMs}ms)`);

        assert(result.skipAfterSuccess === false,
            'a success clears the quiet window at once rather than leaving the bridge shunned');
        assert(result.skipAfterLoneFailure === false,
            'one failure after recovery does not immediately re-arm the backoff');

        console.log(`audioflix realtime backoff OK — tolerates ${result.tolerance - 1} failures,`
            + ` quiets for ${result.quietWindowMs}ms, clears on success`);
        console.log('AUDIOFLIX_REALTIME_BACKOFF_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
