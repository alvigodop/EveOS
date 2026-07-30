/**
 * audioflix_soundlab_transparency_smoke.js
 *
 * Lyria streams pre-mastered 48k stereo audio, so the effects chain's job when nothing is switched
 * on is to be INAUDIBLE. Two ways that silently failed:
 *
 *   1. The "limiter" defaulted to a compressor — threshold -1 with a 6 dB knee and 8:1 ratio, so it
 *      began acting at -7 dBFS and squashed essentially every peak of material that needed no
 *      processing. It is now a hard-knee safety brickwall at -0.3.
 *   2. Every stage was born with its GainNodes at the WebAudio default of 1. A blend stage summed
 *      dry+wet (+6 dB, processor fully wet) and the stereo stage emitted L+R on both channels — a
 *      mono collapse whose phase cancellation is an audible comb filter. Both now construct
 *      bypassed, so a chain is safe before apply() rather than because of it.
 *
 * Measured on rendered audio, because "transparent" is a property of the output, not of the config.
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
    const modules = ['audioflix.soundlab.config.js', 'audioflix.soundlab.drift.js',
        'audioflix.soundlab.state.js', 'audioflix.soundlab.effects.js']
        .map((name) => `<script src="${fileUrl(path.join(AUDIOFLIX, name))}"></script>`).join('\n');

    const fixture = path.join(os.tmpdir(), `sf-clean-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script>
        ${modules}
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const RATE = 48000;

            // Hard-panned stereo: L and R differ, so any cross-channel leak shows up as the two
            // output channels converging. A correlated signal would hide a mono collapse entirely.
            function source(ctx) {
                const buf = ctx.createBuffer(2, RATE, RATE);
                const left = buf.getChannelData(0);
                const right = buf.getChannelData(1);
                for (let i = 0; i < RATE; i += 1) {
                    const t = i / RATE;
                    left[i] = Math.sin(2 * Math.PI * 220 * t) * 0.9;
                    right[i] = Math.sin(2 * Math.PI * 660 * t) * 0.9;
                }
                return buf;
            }

            function analyse(rendered) {
                const l = rendered.getChannelData(0);
                const r = rendered.getChannelData(1);
                let peak = 0, dot = 0, ll = 0, rr = 0;
                for (let i = 0; i < l.length; i += 1) {
                    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
                    dot += l[i] * r[i]; ll += l[i] * l[i]; rr += r[i] * r[i];
                }
                return {
                    peak: +peak.toFixed(4),
                    // 0 for independent channels, ~1 once they collapse to the same signal.
                    correlation: +Math.abs(dot / Math.sqrt((ll * rr) || 1)).toFixed(4)
                };
            }

            async function render(applyConfig) {
                const ctx = new OfflineAudioContext(2, RATE, RATE);
                const chain = window.EveAudioflixSoundLabEffects.create(ctx);
                if (applyConfig) chain.apply(window.EveAudioflixSoundLabState.cleanEffects({}));
                const src = ctx.createBufferSource();
                src.buffer = source(ctx);
                src.connect(chain.input);
                chain.output.connect(ctx.destination);
                src.start();
                return analyse(await ctx.startRendering());
            }

            // Baseline: the same signal with no chain at all.
            const bare = await (async () => {
                const ctx = new OfflineAudioContext(2, RATE, RATE);
                const src = ctx.createBufferSource();
                src.buffer = source(ctx);
                src.connect(ctx.destination);
                src.start();
                return analyse(await ctx.startRendering());
            })();

            const defaults = window.EveAudioflixSoundLabState.cleanEffects({});
            return {
                errors: window.__errors,
                bare,
                unconfigured: await render(false),
                configured: await render(true),
                limiter: defaults.limiter,
                stereo: defaults.stereo,
                othersOff: {
                    filter: defaults.filter.enabled,
                    delay: defaults.delay.enabled,
                    reverb: defaults.reverb.enabled
                }
            };
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));

        // The limiter is a safety brickwall, not a compressor.
        assert(result.limiter.knee === 0, `hard knee so it does not act early, got ${result.limiter.knee}`);
        assert(result.limiter.ratio >= 20, `brickwall ratio, got ${result.limiter.ratio}`);
        assert(result.limiter.threshold >= -1 && result.limiter.threshold <= 0,
            `threshold sits just under full scale, got ${result.limiter.threshold}`);
        // Guard the exact regression: -1 threshold WITH a 6 dB knee starts acting at -7 dBFS.
        assert(!(result.limiter.knee >= 6 && result.limiter.ratio >= 8),
            'the default limiter must not be a soft-knee compressor on pre-mastered audio');

        // Nothing else is on by default.
        assert(result.othersOff.filter === false && result.othersOff.delay === false
            && result.othersOff.reverb === false, 'filter, delay and reverb stay off by default');

        // An UNCONFIGURED chain must already be transparent — no gain, no channel collapse.
        assert(Math.abs(result.unconfigured.peak - result.bare.peak) < 0.02,
            `an un-applied chain must not change level (bare ${result.bare.peak} vs ${result.unconfigured.peak})`);
        assert(result.unconfigured.correlation < 0.2,
            `an un-applied chain must not collapse the stereo image (correlation ${result.unconfigured.correlation})`);

        // And with the real defaults applied, still transparent.
        assert(Math.abs(result.configured.peak - result.bare.peak) < 0.02,
            `default effects must not change level (bare ${result.bare.peak} vs ${result.configured.peak})`);
        assert(result.configured.correlation < 0.2,
            `default effects must not comb-filter the stereo image (correlation ${result.configured.correlation})`);

        console.log(`transparency OK — peak ${result.bare.peak} -> ${result.configured.peak},`
            + ` channel correlation ${result.configured.correlation},`
            + ` limiter ${result.limiter.threshold}dB knee ${result.limiter.knee} ratio ${result.limiter.ratio}`);
        console.log('AUDIOFLIX_SOUNDLAB_TRANSPARENCY_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
