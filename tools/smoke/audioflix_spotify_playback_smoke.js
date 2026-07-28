const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const moduleUrl = (name) => `file:///${path.join(
    ROOT,
    'js',
    'modules',
    'features',
    'audioflix',
    name
).replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-spotify-playback-${process.pid}.html`);
    const scripts = [
        'audioflix.audio.source.js',
        'audioflix.audio.internal.js',
        'audioflix.audio.url.loaders.js',
        'audioflix.audio.url.widgets.js',
        'audioflix.audio.url.providers.js',
        'audioflix.audio.url.spotify.js',
        'audioflix.audio.url.js'
    ].map((name) => `<script src="${moduleUrl(name)}"></script>`).join('');
    fs.writeFileSync(fixture, `<!doctype html><html><body><script>window.__EveAudioflixSpotifyStartTimeoutMs = 60;</script>${scripts}</body></html>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('https://open.spotify.com/embed/iframe-api/v1', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `
            window.onSpotifyIframeApiReady({
                createController: function (_mount, options, ready) {
                    var listeners = {};
                    var calls = window.__spotifyCalls = {
                        uri: options.uri, resume: 0, pause: 0, seek: [], destroy: 0
                    };
                    var controller = window.__spotifyController = {
                        addListener: function (name, listener) { listeners[name] = listener; },
                        resume: function () { calls.resume += 1; },
                        pause: function () { calls.pause += 1; },
                        seek: function (seconds) { calls.seek.push(seconds); },
                        destroy: function () { calls.destroy += 1; },
                        emit: function (name, data) { if (listeners[name]) listeners[name]({ data: data }); }
                    };
                    ready(controller);
                    setTimeout(function () { controller.emit('ready', {}); }, 0);
                }
            });`
    }));

    try {
        await page.goto(`file:///${fixture.replace(/\\/g, '/')}`, { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const events = [];
            const progress = [];
            const player = window.EveAudioflixUrlPlayback.createController({
                onPlayback: (detail) => events.push(detail.status),
                onProgress: (detail) => progress.push(detail)
            });
            const item = {
                id: 'spotify-track',
                title: 'Mobius',
                url: 'https://open.spotify.com/track/1234567890ABCDEF',
                volume: 0.7
            };
            await player.openInternalView(item);
            window.__spotifyController.emit('playback_update', {
                position: 42000,
                duration: 180000,
                isPaused: false
            });
            window.__spotifyController.emit('playback_error', {});
            const runtimeError = events.at(-1);
            const runtimeErrorVisible = document.querySelector('.audioflix-provider-stage')?.classList.contains('has-error');
            await player.seek(61);
            await player.pause();
            await player.play(item);
            window.__spotifyController.emit('playback_update', {
                position: 180000,
                duration: 180000,
                isPaused: true
            });
            window.__spotifyController.emit('playback_update', {
                position: 180000,
                duration: 180000,
                isPaused: true
            });
            player.hideInternalView();
            const hidden = document.querySelector('.audioflix-provider-stage')?.hidden === true;
            const activeAfterHide = player.isActive();
            await player.stop();
            const firstCalls = {
                ...window.__spotifyCalls,
                seek: [...window.__spotifyCalls.seek]
            };
            const stalledErrorsBefore = events.filter((status) => status.includes('Spotify playback did not start')).length;
            await player.openInternalView({
                id: 'spotify-blocked',
                title: 'Blocked track',
                url: 'https://open.spotify.com/track/FEDCBA0987654321'
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            const stalledStatus = document.querySelector('.audioflix-provider-status')?.textContent || '';
            const stalledState = player.getPlaybackState();
            const stalledErrorCount = events.filter((status) => status.includes('Spotify playback did not start')).length
                - stalledErrorsBefore;
            await player.stop();
            return {
                calls: firstCalls,
                stateAt42: progress.find((entry) => entry.currentTime === 42),
                endedCount: events.filter((status) => status === 'Ended').length,
                hidden,
                activeAfterHide,
                runtimeError,
                runtimeErrorVisible,
                stalledStatus,
                stalledState,
                stalledErrorCount,
                spotifyNeedsResolution: window.EveAudioflixAudioSource.needsResolution(item.url)
            };
        });

        assert(result.calls.uri === 'spotify:track:1234567890ABCDEF', 'Spotify URI is normalized');
        assert(result.stateAt42?.duration === 180, 'Spotify progress milliseconds become seconds');
        assert(result.calls.seek.includes(61), 'Spotify seek receives seconds, not milliseconds');
        assert(result.endedCount === 1, 'repeated terminal updates emit Ended once');
        assert(result.hidden && result.activeAfterHide, 'hiding the internal view preserves playback ownership');
        assert(result.calls.destroy === 1, 'stopping destroys the provider controller exactly once');
        assert(result.runtimeError.includes('Spotify playback did not start'), 'runtime provider failure is reported after ready');
        assert(result.runtimeErrorVisible, 'runtime provider failure is visible in the internal player');
        assert(result.stalledStatus.includes('Spotify playback did not start'), 'ready-but-stalled playback times out visibly');
        assert(result.stalledState.paused === true, 'ready-but-stalled playback returns to paused state');
        assert(result.stalledErrorCount === 1, 'startup watchdog emits one error without retrying or advancing');
        assert(result.spotifyNeedsResolution === false, 'Spotify track URLs bypass raw-audio resolution');
        console.log('AUDIOFLIX_SPOTIFY_PLAYBACK_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
