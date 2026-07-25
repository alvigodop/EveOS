// The Audioflix capture AudioWorklet must load, register, and emit fixed-size mono blocks.
//
// It runs on the audio thread — unlike a ScriptProcessorNode, which is main-thread and delivers
// late/short frames under EveOS jank (heard as the song hitching) — so it is the tap the native
// music route prefers.
//
// The module is loaded from a data: URL built from the inlined source, because that is the ONLY
// form addModule() accepts on a file:// page (a file:// URL and a blob: URL both AbortError).
// This test covers both protocols to keep that true: http here, and file:// at the end, which is
// the case that used to be stuck on the main-thread fallback.
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3051;

function waitForStatus(url, timeoutMs = 30000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.get(url, (res) => { res.resume(); resolve(); });
            req.on('error', () => {
                if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
                else setTimeout(tick, 500);
            });
            req.setTimeout(1000, () => req.destroy());
        };
        tick();
    });
}

(async () => {
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-capture-worklet-'));
    const server = spawn('python', ['server/python-server.py', String(PORT), '--no-browser', '--modular-root', modularRoot], {
        cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    let browser = null;
    try {
        await waitForStatus(`http://localhost:${PORT}/api/status`);
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.addInitScript(() => { try { localStorage.clear(); } catch {} window.__eveSmokeNoAutoGemini = true; });
        await page.goto(`http://localhost:${PORT}/EveOS.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => !!window.EveAudioflixAudioCapture?.ready, undefined, { timeout: 120000 });

        const result = await page.evaluate(async () => {
            const RATE = 48000;
            const BLOCK = 4096;
            const ctx = new OfflineAudioContext(1, RATE, RATE); // 1 second
            await ctx.audioWorklet.addModule(
                'data:application/javascript,' + encodeURIComponent(window.EveAudioflixCaptureProcessorSrc));

            const node = new AudioWorkletNode(ctx, 'audioflix-capture-processor', {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
                processorOptions: { blockSize: BLOCK }
            });
            const blocks = [];
            node.port.onmessage = (event) => { if (event.data?.length) blocks.push(event.data.length); };

            // Constant-amplitude stereo in, so a correct (L+R)/2 downmix is verifiable.
            const source = ctx.createBufferSource();
            const buffer = ctx.createBuffer(2, RATE, RATE);
            buffer.getChannelData(0).fill(0.8);
            buffer.getChannelData(1).fill(0.4);
            source.buffer = buffer;
            source.connect(node);
            node.connect(ctx.destination);
            source.start();

            await ctx.startRendering();
            await new Promise((resolve) => setTimeout(resolve, 300)); // let port messages drain
            return { blocks: blocks.length, allFullSize: blocks.length > 0 && blocks.every((n) => n === BLOCK) };
        });

        const fails = [];
        if (!result.blocks) fails.push('capture worklet emitted no PCM blocks');
        if (!result.allFullSize) fails.push('capture worklet emitted ragged blocks (expected fixed-size)');
        if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exitCode = 1; return; }
        // The file:// leg. This is the case that regressed into the main-thread ScriptProcessor:
        // the worklet must load here too, or every UI interaction is audible in the playing track.
        const filePage = await browser.newPage();
        const fileErrors = [];
        filePage.on('pageerror', (e) => fileErrors.push(String(e)));
        const fileUrl = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').split('\\').join('/');
        await filePage.addInitScript(() => { try { localStorage.clear(); } catch {} window.__eveSmokeNoAutoGemini = true; });
        await filePage.goto(fileUrl, { waitUntil: 'load', timeout: 180000 });
        await filePage.waitForFunction(() => !!window.EveAudioflixCaptureProcessorSrc, undefined, { timeout: 120000 });
        const onFile = await filePage.evaluate(async () => {
            const ctx = new AudioContext();
            const out = { protocol: location.protocol, addModule: '', node: '' };
            try {
                await ctx.audioWorklet.addModule(
                    'data:application/javascript,' + encodeURIComponent(window.EveAudioflixCaptureProcessorSrc));
                out.addModule = 'OK';
                new AudioWorkletNode(ctx, 'audioflix-capture-processor', { processorOptions: { blockSize: 4096 } });
                out.node = 'OK';
            } catch (e) {
                out.addModule = out.addModule || ('FAIL: ' + (e.name || e.message));
                out.node = out.node || 'FAIL';
            }
            return out;
        });
        await filePage.close();
        if (onFile.protocol !== 'file:') throw new Error('the file:// leg did not run on file://');
        if (onFile.addModule !== 'OK') throw new Error(`worklet must load on file:// too, got ${onFile.addModule} — the tap would fall back to the main-thread ScriptProcessor`);
        if (onFile.node !== 'OK') throw new Error(`worklet node must construct on file://, got ${onFile.node}`);
        if (fileErrors.length) throw new Error('file:// page errors: ' + fileErrors.join(' | '));
        console.log('file:// leg OK — audio-thread worklet loads, no ScriptProcessor fallback');

        console.log(`AUDIOFLIX_CAPTURE_WORKLET_OK (blocks=${result.blocks})`);
    } catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
        process.exitCode = 1;
    } finally {
        if (browser) { try { await browser.close(); } catch { /* closing */ } }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
})();
