const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const outerUi = fs.readFileSync(path.join(AUDIOFLIX, 'audioflix.ui.js'), 'utf8');
    assert(
        outerUi.includes("reason?.startsWith('audioflix-soundlab-')"),
        'in-place Sonic Forge state updates do not rebuild the outer Audioflix panel'
    );

    const fixture = path.join(os.tmpdir(), `eveos-soundlab-focus-${process.pid}.html`);
    const modules = [
        'audioflix.soundlab.state.js',
        'audioflix.soundlab.ui.render.js',
        'audioflix.soundlab.ui.events.js',
        'audioflix.soundlab.ui.js'
    ].map((name) => `<script src="${fileUrl(path.join(AUDIOFLIX, name))}"></script>`).join('');

    fs.writeFileSync(fixture, `<!doctype html><html><body><main id="host"></main>
        <script>
            window.__audioflixRoot = {};
            window.EveAudioflixState = {
                ensure: () => window.__audioflixRoot,
                update: (patch, reason) => {
                    Object.assign(window.__audioflixRoot, patch || {});
                    window.dispatchEvent(new CustomEvent('eve:audioflix-state-changed', {
                        detail: { reason }
                    }));
                    return window.__audioflixRoot;
                }
            };
            window.EveAudioflixSoundLabEngine = {
                getStatus: () => ({ phase: 'playing', connected: true, playing: true }),
                getTimeline: () => ({ elapsedSeconds: 1, generatedSeconds: 2 }),
                subscribe: () => () => {},
                queueSteering: () => {}
            };
            window.EveAudioflixSoundLabRecording = {
                getStatus: () => ({}),
                subscribe: () => () => {}
            };
            window.EveAudioflixSoundLabMidi = {
                getStatus: () => ({ inputs: [] }),
                subscribe: () => () => {},
                restore: async () => {}
            };
        </script>
        ${modules}
    </body></html>`);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const host = document.querySelector('#host');
            const ui = window.EveAudioflixSoundLabUi;
            let outerRenders = 0;
            const renderOuter = () => {
                outerRenders += 1;
                host.innerHTML = ui.render();
                ui.afterRender(host);
            };
            renderOuter();
            ui.setVisible(true);

            const input = host.querySelector('[data-sf-field="prompt-text"]');
            input.focus();
            input.setSelectionRange(0, input.value.length);
            const typing = 'ambient glass piano with patient rain';
            input.value = '';

            const interval = window.setInterval(() => {
                if (!ui.deferOuterRender(renderOuter)) renderOuter();
            }, 4);
            for (const character of typing) {
                input.value += character;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 2));
            }
            window.clearInterval(interval);

            const stayedFocused = document.activeElement === input;
            const draftSurvived = input.value === typing;
            const rendersWhileEditing = outerRenders;
            input.blur();
            await new Promise((resolve) => setTimeout(resolve, 30));

            const saved = window.EveAudioflixSoundLabState.ensure().prompts[0].text;
            return {
                stayedFocused,
                draftSurvived,
                rendersWhileEditing,
                rendersAfterBlur: outerRenders,
                saved
            };
        });

        assert(result.stayedFocused, 'background renders cannot steal prompt editor focus');
        assert(result.draftSurvived, 'the full prompt draft survives background updates');
        assert(result.rendersWhileEditing === 1, 'outer rerenders are deferred while typing');
        assert(result.rendersAfterBlur === 2, 'one deferred render flushes after editing');
        assert(
            result.saved === 'ambient glass piano with patient rain',
            'the completed prompt is committed once on blur'
        );
        console.log('AUDIOFLIX_SOUNDLAB_PROMPT_FOCUS_SMOKE_OK', JSON.stringify(result));
    } finally {
        await browser.close();
        try { fs.unlinkSync(fixture); } catch {}
    }
})().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
});
