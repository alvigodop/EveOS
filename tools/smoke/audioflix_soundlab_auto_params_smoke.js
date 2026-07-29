/**
 * audioflix_soundlab_auto_params_smoke.js
 *
 * "Auto" on a Sonic Forge generation control must mean the parameter is ABSENT from the Lyria
 * payload, so the model infers it from the text direction. Sending a number while the UI claims
 * "auto" would fail silently: generation would keep obeying a pinned value nobody can see.
 *
 * musicGenerationConfig is a PARTIAL config — the SDK passes it through verbatim and
 * JSON.stringify drops absent keys — so omission is the mechanism, and it only makes sense for the
 * musical qualities. guidance / temperature / topK are sampler controls that always carry a value,
 * and bpm / scale force resetContext(), so neither may be modulated continuously.
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
    const modules = [
        'audioflix.soundlab.config.js',
        'audioflix.soundlab.state.js'
    ].map((name) => `<script src="${fileUrl(path.join(AUDIOFLIX, name))}"></script>`).join('\n');

    const fixture = path.join(os.tmpdir(), `sf-auto-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors = [];
        addEventListener('error', (e) => window.__errors.push(e.message));</script>
        ${modules}
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(() => {
            const cfg = window.EveAudioflixSoundLabConfig;
            const pinned = cfg.toWireConfig({ bpm: 128, density: 0.7, brightness: 0.3 });
            const partial = cfg.toWireConfig({
                bpm: 128, density: 0.7, brightness: 0.3,
                autoParams: { bpm: true, density: true, brightness: false }
            });
            const everything = cfg.toWireConfig({
                autoParams: { bpm: true, density: true, brightness: true }
            });
            // A round trip through the state normalizer must preserve the flags, or a datapack
            // save/restore would silently un-auto every control.
            const stored = window.EveAudioflixSoundLabState.normalize({
                config: { bpm: 150, autoParams: { bpm: true, density: false, brightness: true } }
            });
            return {
                errors: window.__errors,
                pinnedKeys: Object.keys(pinned).sort(),
                partial: {
                    hasBpm: Object.hasOwn(partial, 'bpm'),
                    hasDensity: Object.hasOwn(partial, 'density'),
                    hasBrightness: Object.hasOwn(partial, 'brightness'),
                    brightnessValue: partial.brightness,
                    hasGuidance: Object.hasOwn(partial, 'guidance'),
                    hasTemperature: Object.hasOwn(partial, 'temperature'),
                    hasTopK: Object.hasOwn(partial, 'topK'),
                    hasAutoParams: Object.hasOwn(partial, 'autoParams')
                },
                everythingKeys: Object.keys(everything).sort(),
                autoable: cfg.autoParamKeys(),
                resetKeys: cfg.resetOnChangeKeys(),
                modulateBpm: cfg.isSafeToModulate('bpm'),
                modulateScale: cfg.isSafeToModulate('scale'),
                modulateGuidance: cfg.isSafeToModulate('guidance'),
                autoableGuidance: cfg.isAutoable('guidance'),
                storedAuto: stored.config.autoParams
            };
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));

        // Nothing on auto: every parameter is still sent.
        ['bpm', 'density', 'brightness', 'guidance', 'temperature', 'topK']
            .forEach((key) => assert(result.pinnedKeys.includes(key), `a pinned config still sends ${key}`));
        assert(!result.pinnedKeys.includes('autoParams'),
            'autoParams is EveOS bookkeeping and never reaches the payload');

        // Auto is per-parameter.
        assert(result.partial.hasBpm === false, 'an auto bpm is omitted, not sent');
        assert(result.partial.hasDensity === false, 'an auto density is omitted, not sent');
        assert(result.partial.hasBrightness === true && result.partial.brightnessValue === 0.3,
            'a parameter left pinned keeps its exact value while its neighbours go auto');
        assert(result.partial.hasAutoParams === false, 'autoParams stays out of the payload');

        // Sampler controls are never dropped: omitting them would mean "API default", not "decide".
        assert(result.partial.hasGuidance && result.partial.hasTemperature && result.partial.hasTopK,
            'guidance, temperature and topK are always sent');
        assert(result.autoableGuidance === false, 'guidance is not offered as an auto parameter');
        assert(result.autoable.join(',') === 'bpm,density,brightness',
            `only the musical qualities are autoable, got ${result.autoable.join(',')}`);

        // Everything on auto still leaves a valid payload — the sampler controls carry it.
        ['guidance', 'temperature', 'topK'].forEach((key) =>
            assert(result.everythingKeys.includes(key), `all-auto still sends ${key}`));
        ['bpm', 'density', 'brightness'].forEach((key) =>
            assert(!result.everythingKeys.includes(key), `all-auto omits ${key}`));

        // A bpm/scale change forces resetContext(), an audible discontinuity, so nothing may drive
        // them continuously.
        assert(result.resetKeys.join(',') === 'bpm,scale', 'bpm and scale are the reset-forcing keys');
        assert(result.modulateBpm === false && result.modulateScale === false,
            'bpm and scale are refused for continuous modulation');
        assert(result.modulateGuidance === true, 'sampler controls remain safe to modulate');

        // Persistence.
        assert(result.storedAuto.bpm === true && result.storedAuto.brightness === true
            && result.storedAuto.density === false,
            'auto flags survive the state normalizer, so a datapack restore keeps them');

        console.log('auto params OK — omitted keys:', result.autoable.join(', '));
        console.log('AUDIOFLIX_SOUNDLAB_AUTO_PARAMS_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
