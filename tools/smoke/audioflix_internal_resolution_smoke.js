const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch { }
        window.__eveSmokeNoAutoGemini = true;
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!(
        window.EveAudioflixAudio?.openInternalView
        && window.EveAudioflixAudioSource?.resolveItem
        && window.EveAudioflixUrlPlayback?.createController
    ), undefined, { timeout: 60000 });

    const result = await page.evaluate(async () => {
        const fakePlayers = [];
        class FakeAudio extends EventTarget {
            constructor() {
                super();
                this.currentTime = 0;
                this.duration = 240;
                this.paused = true;
                this.volume = 1;
                this.src = '';
                // A real HTMLAudioElement always has these; the waveform controller reads them.
                this.dataset = {};
                this.crossOrigin = null;
                fakePlayers.push(this);
            }
            async play() {
                this.paused = false;
                this.dispatchEvent(new Event('play'));
            }
            pause() {
                this.paused = true;
                this.dispatchEvent(new Event('pause'));
            }
            load() { }
            removeAttribute(name) { if (name === 'src') this.src = ''; }
            async setSinkId(value) { this.sinkId = value; }
        }

        const originalAudio = window.Audio;
        const source = window.EveAudioflixAudioSource;
        const native = window.EveAudioflixNative;
        const originalNeedsResolution = source.needsResolution;
        const originalResolveItem = source.resolveItem;
        const originalGetStatus = native.getStatus;
        const originalSuppress = native.shouldSuppressBrowserPlayback;
        const state = window.EveAudioflixState;
        const originalState = JSON.parse(JSON.stringify(state.ensure()));
        let resolutions = 0;
        try {
            window.Audio = FakeAudio;
            state.update({ preferredSinkId: 'test-output', preferredSinkLabel: 'Test output' }, 'smoke-output');
            source.needsResolution = () => true;
            source.resolveItem = async (item) => {
                resolutions += 1;
                return {
                    ...item,
                    sourceUrl: item.url,
                    url: 'https://media.example.test/resolved-track.m4a',
                    resolvedDuration: 240
                };
            };
            native.getStatus = () => ({ ok: true });
            native.shouldSuppressBrowserPlayback = () => true;

            const item = {
                id: 'resolved-youtube-track',
                type: 'music',
                title: 'Resolved YouTube Track',
                url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
                volume: 0.65
            };
            await window.EveAudioflixAudio.openInternalView(item);
            const stage = document.querySelector('.audioflix-provider-stage:not([hidden])');
            const internal = {
                resolutions,
                provider: stage?.dataset.provider || '',
                sourceHref: stage?.querySelector('header a')?.href || '',
                playerSrc: fakePlayers[0]?.src || '',
                playing: fakePlayers[0]?.paused === false
            };

            await window.EveAudioflixAudio.stopAll();
            native.getStatus = () => ({ ok: false });
            await window.EveAudioflixAudio.playItem(item);
            // The library reuses ONE long-lived media element ("continuous"), so identify the
            // music player by the element actually carrying the resolved track, not by a new
            // object appearing — counting allocations asserted the opposite of the design.
            const musicPlayer = fakePlayers.filter((p) => p.src && !p.paused).pop()
                || fakePlayers[fakePlayers.length - 1];
            return {
                internal,
                totalResolutions: resolutions,
                continuousPlayers: fakePlayers.length,
                musicSrc: musicPlayer?.src || '',
                musicPlaying: musicPlayer?.paused === false,
                musicSink: musicPlayer?.sinkId || '',
                status: window.EveAudioflixAudio.getStatus?.() || {}
            };
        } finally {
            await window.EveAudioflixAudio.stopAll().catch(() => { });
            window.Audio = originalAudio;
            source.needsResolution = originalNeedsResolution;
            source.resolveItem = originalResolveItem;
            native.getStatus = originalGetStatus;
            native.shouldSuppressBrowserPlayback = originalSuppress;
            state.replaceState(originalState, 'smoke-restore');
        }
    });

    await browser.close();
    assert(result.internal.resolutions === 1, 'internal view did not resolve the platform URL first');
    assert(result.internal.provider.includes('direct'), `internal view used ${result.internal.provider || 'no'} provider instead of resolved direct audio`);
    assert(result.internal.playerSrc.includes('resolved-track.m4a'), 'internal view did not use the resolved audio URL');
    assert(result.internal.sourceHref.includes('youtube.com/watch'), 'internal view lost the original source link');
    assert(result.internal.playing, 'resolved internal audio did not start');
    assert(result.totalResolutions === 2, 'file-mode music skipped resolver-first playback while the native probe was cold');
    // One reused element for the whole run, not a fresh one per track.
    assert(result.continuousPlayers <= 2, `music should reuse the continuous media element (saw ${result.continuousPlayers})`);
    assert(result.musicSrc.includes('resolved-track.m4a'), 'music player did not use the resolved URL');
    assert(result.musicPlaying, 'music player did not start');
    assert(result.musicSink === 'test-output', 'continuous music did not preserve the selected browser output');
    assert(result.status.native !== true, 'music incorrectly entered the chunked native PCM route');
    console.log('AUDIOFLIX_INTERNAL_RESOLUTION_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
