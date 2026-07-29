const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const apiKey = String(process.env.EVEOS_GEMINI_API_KEY || '').trim();
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const failAfter = (milliseconds) => new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Live Lyria smoke exceeded ${milliseconds / 1000} seconds.`)), milliseconds);
});

if (!apiKey) {
    console.log('AUDIOFLIX_SOUNDLAB_LIVE_SMOKE_SKIPPED no process credential');
    process.exit(0);
}

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-soundlab-live-${process.pid}.html`);
    const modules = [
        'audioflix.soundlab.state.js',
        'audioflix.soundlab.codec.js',
        'audioflix.soundlab.engine.js'
    ].map((name) => `<script src="${fileUrl(path.join(AUDIOFLIX, name))}"></script>`).join('');
    fs.writeFileSync(fixture, `<!doctype html><html><head>
        <base href="${fileUrl(ROOT)}/">
    </head><body>
        <script>
            window.__soundLabRoot = {};
            window.EveAudioflixState = {
                ensure: () => window.__soundLabRoot,
                update: (patch) => Object.assign(window.__soundLabRoot, patch || {})
            };
            window.EveAudioflixNative = {
                shouldSuppressBrowserPlayback: () => false,
                stopStream: async () => true
            };
        </script>
        ${modules}
    </body></html>`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--autoplay-policy=no-user-gesture-required']
    });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const generationRun = page.evaluate(async (credential) => {
            const engine = window.EveAudioflixSoundLabEngine;
            const state = window.EveAudioflixSoundLabState;
            state.ensure();
            state.update({
                prompts: [{ id: 'live-smoke', text: 'soft ambient instrumental, no vocals', weight: 1 }],
                bufferSeconds: 0.25
            }, 'live-smoke');
            engine.setApiKey(credential);
            let captured;
            try {
                await engine.play();
                const deadline = Date.now() + 30000;
                while (Date.now() < deadline) {
                    const current = engine.getStatus();
                    if (current.phase === 'error') throw new Error(current.message);
                    if (current.bufferedSeconds > 0 && current.playing) {
                        captured = {
                            phase: current.phase,
                            playing: current.playing,
                            bufferedSeconds: current.bufferedSeconds,
                            hasAudioContext: !!engine.getAudioContext()
                        };
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                if (!captured) throw new Error('Lyria connected but produced no PCM audio within 30 seconds.');
                return captured;
            } finally {
                await engine.stop().catch(() => {});
                await engine.disconnect().catch(() => {});
                engine.setApiKey('');
            }
        }, apiKey);
        const result = await Promise.race([generationRun, failAfter(55000)]);
        if (!result.playing || !result.hasAudioContext || result.bufferedSeconds <= 0) {
            throw new Error(`Invalid live generation state: ${JSON.stringify(result)}`);
        }
        console.log('AUDIOFLIX_SOUNDLAB_LIVE_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
});
