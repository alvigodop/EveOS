/**
 * gemini_audio_worklet_smoke.js
 *
 * The Gemini AudioWorklet must load from a file:// page.
 *
 * It could not. addModule('js/.../pcm-processor.js') is a fetch from an opaque origin and Chromium
 * refuses it ("Cross origin requests are only supported for protocol schemes: ... http, https"), so
 * every file:// session silently dropped to the legacy player. The initializer already had the
 * processor source inline and threw it away, loading the path instead -- the comment there records
 * an earlier blob: attempt, which fails differently (blob:null inherits the null origin).
 *
 * A data: URL carries the source inline, so there is no fetch left to block. Both directions are
 * pinned, because the fix is only correct if it stays a preference rather than a replacement:
 *   - the data: URL is tried FIRST, so file:// never reaches the failing path;
 *   - the file path is still tried when data: fails, so http:// keeps working and an environment
 *     without the inline source is not left with nothing.
 *
 * Runs the real module against a fake AudioContext; no audio device and no Gemini session.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const INIT = path.join(ROOT, 'js', 'modules', 'gemini', 'agentic', 'audio_proc',
    'context_mgmt', 'initialization_modules', 'audioWorkletInitializer.js');
const fileUrl = (target) => 'file:///' + target.split(path.sep).join('/');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

async function main() {
    const fixture = path.join(os.tmpdir(), `gem-worklet-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script>
        <script src="${fileUrl(INIT)}"></script>
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const out = { ready: !!(window.AudioContextInitializer && window.AudioContextInitializer.AudioWorkletHelper) };

            // The inline source the initializer is supposed to prefer.
            window.AudioWorkletCode = {
                getProcessorCode: () => "registerProcessor('simple-audio-processor', class extends AudioWorkletProcessor { process() { return true; } });"
            };

            function rig(addModule) {
                const tried = [];
                const ctx = {
                    audioWorklet: { addModule: (url) => { tried.push(url); return addModule(url); } },
                    destination: {}
                };
                return { tried, state: { audioInputContext: ctx } };
            }

            // Chromium's real file:// behaviour: the path is refused, data: is accepted.
            const fileMode = rig((url) => (url.startsWith('data:')
                ? Promise.resolve()
                : Promise.reject(new Error('Cross origin requests are only supported for protocol schemes'))));
            window.AudioWorkletNode = function () { return { connect() {} }; };
            try {
                await window.AudioContextInitializer.AudioWorkletHelper.initialize(fileMode.state, {});
                out.fileModeLoaded = true;
            } catch (error) {
                out.fileModeLoaded = false;
                out.fileModeError = String(error && error.message);
            }
            out.fileModeFirstTry = (fileMode.tried[0] || '').slice(0, 5);
            out.fileModeTriedCount = fileMode.tried.length;

            // With no inline source, the file path must still be attempted.
            window.AudioWorkletCode = { getProcessorCode: () => '' };
            const pathOnly = rig(() => Promise.resolve());
            try {
                await window.AudioContextInitializer.AudioWorkletHelper.initialize(pathOnly.state, {});
                out.pathModeLoaded = true;
            } catch (error) {
                out.pathModeLoaded = false;
            }
            out.pathModeFirstTry = pathOnly.tried[0] || '';

            // Every route failing must still surface as a throw, not a silent success.
            window.AudioWorkletCode = {
                getProcessorCode: () => "registerProcessor('simple-audio-processor', class {});"
            };
            const allFail = rig(() => Promise.reject(new Error('nope')));
            try {
                await window.AudioContextInitializer.AudioWorkletHelper.initialize(allFail.state, {});
                out.allFailThrew = false;
            } catch (error) {
                out.allFailThrew = true;
            }
            out.allFailTried = allFail.tried.length;

            out.errors = window.__errors;
            return out;
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));
        assert(result.ready, 'the initializer module loaded');

        assert(result.fileModeLoaded,
            `the worklet loads on file:// where the path is refused (got ${result.fileModeError})`);
        assert(result.fileModeFirstTry === 'data:',
            `the data: URL is tried FIRST so file:// never hits the failing path (got ${result.fileModeFirstTry})`);
        assert(result.fileModeTriedCount === 1,
            `a working data: URL short-circuits the rest (tried ${result.fileModeTriedCount})`);

        assert(result.pathModeLoaded, 'without inline source the file path still loads');
        assert(result.pathModeFirstTry.includes('pcm-processor.js'),
            `the path is the fallback, keeping http:// working (got ${result.pathModeFirstTry})`);

        assert(result.allFailThrew, 'every route failing throws rather than reporting success');
        assert(result.allFailTried === 2, `both routes are attempted before giving up (tried ${result.allFailTried})`);

        console.log('gemini audio worklet OK — data: preferred, path retained as fallback,'
            + ' total failure still throws');
        console.log('GEMINI_AUDIO_WORKLET_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
