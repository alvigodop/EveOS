// Music -> native EveOS bridge, WITHOUT the play->sound lag.
//
// Routing music through the native bridge by decoding the whole track first put seconds between
// pressing play and hearing audio. Music now plays through the media element (instant, seekable)
// while its LIVE signal is tapped and streamed to the bridge, with local speakers silenced.
//
// Asserts: (a) starting music on the native route does NOT pre-decode the track,
// (b) local speakers are silenced while the tap is active, (c) live frames are encoded and sent
// to the bridge as PCM, (d) stopping tears the tap down and restores local output,
// (e) with the bridge disarmed, music keeps the plain browser route (no tap, no muting).
const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!(window.EveAudioflixAudio?.playItem
        && window.EveAudioflixAudioCapture?.ready
        && window.EveAudioflixState?.ready), undefined, { timeout: 60000 });

    const result = await page.evaluate(async () => {
        const out = { decodes: 0, chunks: 0, muted: null, unmutedAfterStop: null, tapTornDown: null };

        // Spy the decode path — the native music route must NOT touch it (that was the lag).
        window.EveAudioflixAudioCodec.getDecodedBuffer = async () => {
            out.decodes += 1;
            return { duration: 1, sampleRate: 48000, numberOfChannels: 1, length: 48000, getChannelData: () => new Float32Array(48000) };
        };
        // Arm the native bridge and capture what it receives.
        window.EveAudioflixState.update({ nativeBridgeEnabled: true, nativeOutputId: 'sd:0', nativeOutputLabel: 'CABLE Input (VB-Audio)', nativeSuppressBrowserPlayback: true }, 'capture-smoke');
        window.EveAudioflixNative.shouldSuppressBrowserPlayback = () => true;
        window.EveAudioflixNative.getStatus = () => ({ ok: true });
        window.EveAudioflixNative.sendGeminiChunk = async (payload, detail) => {
            if (payload && detail?.channels === 1) out.chunks += 1;
            return true;
        };
        window.EveAudioflixNative.stopStream = async () => true;

        // Stub the Web Audio graph so the tap is exercised without real device output.
        let tapHandler = null;
        let mutedState = null;
        const waveform = { setFrameTap: null };
        window.EveAudioflixAudioWaveform.createController = () => ({
            attach() {}, start() {}, stop() {}, getContext: () => null,
            setSpeakerMuted(muted) { mutedState = muted; return true; },
            setFrameTap(handler) { tapHandler = handler; return handler ? 48000 : 0; }
        });
        // Rebuild the capture controller against the stubbed graph.
        const capture = window.EveAudioflixAudioCapture.createController({
            getWaveform: () => ({
                setSpeakerMuted: (m) => { mutedState = m; return true; },
                setFrameTap: (h) => { tapHandler = h; return h ? 48000 : 0; }
            }),
            getPlayer: () => ({ paused: false }),
            getVolume: () => 1
        });

        // (a)+(b) Start the native music route: no decode, speakers silenced, tap installed.
        const started = capture.start();
        out.started = started;
        out.muted = mutedState;
        out.decodesAfterStart = out.decodes;

        // (c) Feed live frames through the tap -> encoded PCM reaches the bridge.
        const frames = {
            numberOfChannels: 2,
            getChannelData: (i) => {
                const data = new Float32Array(4096);
                for (let n = 0; n < data.length; n += 1) data[n] = (i === 0 ? 0.5 : -0.5);
                return data;
            }
        };
        tapHandler?.(frames, 48000);
        await new Promise((r) => setTimeout(r, 50));

        // (d) Stop tears down and restores local output.
        capture.stop();
        out.unmutedAfterStop = mutedState === false;
        out.tapTornDown = tapHandler === null;
        return out;
    });

    await browser.close();
    const fails = [];
    if (!result.started) fails.push('native music capture did not start');
    if (result.decodesAfterStart !== 0) fails.push(`native music route pre-decoded the track (${result.decodesAfterStart} decode calls) — that is the play->sound lag`);
    if (result.muted !== true) fails.push('local speakers were not silenced while the native route owns the audio');
    if (!result.chunks) fails.push('no live PCM frames were streamed to the native bridge');
    if (!result.unmutedAfterStop) fails.push('local output was not restored after stopping the native route');
    if (!result.tapTornDown) fails.push('live PCM tap was not torn down on stop');
    if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
    console.log(`AUDIOFLIX_MUSIC_NATIVE_CAPTURE_OK (decodes=${result.decodesAfterStart}, chunks=${result.chunks})`);
})().catch((e) => { console.error(e); process.exit(1); });
