// The Audioflix capture AudioWorklet must load, register, and emit fixed-size mono blocks.
//
// It runs on the audio thread — unlike a ScriptProcessorNode, which is main-thread and delivers
// late/short frames under EveOS jank (heard as blips) — so it is the tap the native music route
// prefers. Served over http because AudioWorklet modules cannot be loaded from a file:// opaque
// origin; that is also exactly where the native route lives (it needs the EveOS server), and the
// waveform tap falls back to a ScriptProcessor anywhere the worklet is unavailable.
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
            await ctx.audioWorklet.addModule('js/modules/features/audioflix/audioflix-capture-processor.js');

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
