const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'js', 'modules', 'features', 'audioflix', 'audioflix.audio.url.js');
const STYLE_PATH = path.join(REPO_ROOT, 'js', 'modules', 'features', 'audioflix', 'audioflix.provider.css');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const fixture = path.join(os.tmpdir(), `eveos-audioflix-url-${process.pid}.html`);
    const moduleUrl = 'file:///' + MODULE_PATH.replace(/\\/g, '/');
    const styleUrl = 'file:///' + STYLE_PATH.replace(/\\/g, '/');
    fs.writeFileSync(fixture, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${styleUrl}"></head><body><script src="${moduleUrl}"></script></body></html>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        window.__fakeAudioInstances = [];
        class FakeAudio extends EventTarget {
            constructor() {
                super();
                this.currentTime = 0;
                this.duration = 180;
                this.paused = true;
                this.volume = 1;
                this.src = '';
                window.__fakeAudioInstances.push(this);
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
        }
        window.Audio = FakeAudio;
        window.EveAudioflixNative = { getStatus: () => ({ ok: false }) };
    });

    try {
        await page.goto('file:///' + fixture.replace(/\\/g, '/'), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            const playbackEvents = [];
            const progressEvents = [];
            const makeController = () => window.EveAudioflixUrlPlayback.createController({
                onPlayback: (detail) => playbackEvents.push(detail),
                onProgress: (detail) => progressEvents.push(detail)
            });

            const direct = makeController();
            const directItem = { id: 'direct-1', title: 'Direct MP3', url: 'https://media.example.test/song.mp3', volume: 0.5 };
            const preferred = direct.shouldPreferBrowser(directItem);
            await direct.play(directItem);
            await direct.seek(42);
            direct.setVolume(0.3);
            const directState = direct.getPlaybackState();
            await direct.pause();
            const directAudio = window.__fakeAudioInstances[0];
            await direct.stop();

            let youtubePlayerAttempts = 0;
            window.YT = {
                PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
                Player: function (host, options) {
                    youtubePlayerAttempts += 1;
                }
            };
            const youtube = makeController();
            const ytItem = { id: 'yt-1', title: 'YouTube Track', url: 'https://youtu.be/M7lc1UVf-VE', volume: 0.4 };
            let blockedMessage = '';
            try { await youtube.play(ytItem); } catch (error) { blockedMessage = error.message; }
            const stage = document.querySelector('.audioflix-provider-stage:not([hidden])');
            const stageText = stage?.textContent || '';
            const blockedActive = youtube.isActive();
            const blockedStageElement = document.querySelector('.audioflix-provider-stage.has-error');
            const blockedStage = blockedStageElement?.textContent || '';
            const blockedFrameDisplay = getComputedStyle(blockedStageElement.querySelector('.audioflix-provider-frame')).display;
            const blockedStageHeight = blockedStageElement.getBoundingClientRect().height;
            await youtube.stop();

            const soundCloudPlayers = [];
            const SoundCloudWidget = function () {
                const handlers = {};
                const player = {
                    volume: 100,
                    bind(name, callback) {
                        handlers[name] = callback;
                        if (name === 'ready') setTimeout(callback, 0);
                    },
                    setVolume(value) { this.volume = value; },
                    getDuration(callback) { callback(90000); },
                    play() { handlers.play?.(); },
                    pause() { handlers.pause?.(); },
                    seekTo(value) { handlers.progress?.({ currentPosition: value }); }
                };
                soundCloudPlayers.push(player);
                return player;
            };
            SoundCloudWidget.Events = { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', PLAY_PROGRESS: 'progress' };
            window.SC = { Widget: SoundCloudWidget };
            const soundCloud = makeController();
            const scItem = { id: 'sc-1', title: 'SoundCloud Track', url: 'https://soundcloud.com/example/track', volume: 0.6 };
            await soundCloud.play(scItem);
            await soundCloud.seek(31);
            soundCloud.setVolume(0.2);
            const scState = soundCloud.getPlaybackState();
            const scVolume = soundCloudPlayers[0].volume;
            await soundCloud.stop();

            class VimeoPlayer {
                constructor() { this.handlers = {}; this.volume = 1; this.time = 0; }
                on(name, callback) { this.handlers[name] = callback; }
                async ready() { }
                async play() { this.handlers.play?.(); }
                async pause() { this.handlers.pause?.(); }
                async setVolume(value) { this.volume = value; }
                async setCurrentTime(value) { this.time = value; this.handlers.timeupdate?.({ seconds: value, duration: 150 }); }
                async destroy() { this.destroyed = true; }
            }
            window.Vimeo = { Player: VimeoPlayer };
            const vimeo = makeController();
            const vimeoItem = { id: 'vimeo-1', title: 'Vimeo Track', url: 'https://vimeo.com/76979871', volume: 0.7 };
            await vimeo.play(vimeoItem);
            await vimeo.seek(19);
            vimeo.setVolume(0.35);
            const vimeoState = vimeo.getPlaybackState();
            const vimeoVolume = vimeoState.item.volume;
            await vimeo.stop();

            return {
                preferred,
                providerDirect: window.EveAudioflixUrlPlayback.providerFor(directItem.url),
                providerYouTube: window.EveAudioflixUrlPlayback.providerFor(ytItem.url),
                youtubeId: window.EveAudioflixUrlPlayback.youtubeId(ytItem.url),
                directState,
                directPaused: directAudio.paused,
                directVolume: directAudio.volume,
                directCrossOrigin: directAudio.crossOrigin,
                playbackEvents: playbackEvents.map((event) => event.status),
                progressCount: progressEvents.length,
                youtubePlayerAttempts,
                stageText,
                scState,
                scVolume,
                vimeoState,
                vimeoVolume,
                blockedMessage,
                blockedActive,
                blockedStage,
                blockedFrameDisplay,
                blockedStageHeight
            };
        });

        assert(result.preferred, 'file:// remote tracks should prefer browser-only playback while the bridge is offline');
        assert(result.providerDirect === 'direct', `wrong direct provider: ${result.providerDirect}`);
        assert(result.providerYouTube === 'youtube', `wrong YouTube provider: ${result.providerYouTube}`);
        assert(result.youtubeId === 'M7lc1UVf-VE', `wrong YouTube id: ${result.youtubeId}`);
        assert(result.directState.currentTime === 42 && result.directState.duration === 180, 'direct media seek/duration state failed');
        assert(result.directPaused && result.directVolume === 0.3, 'direct media pause/volume controls failed');
        assert(result.directCrossOrigin == null, 'browser-only direct media must not force CORS mode');
        assert(result.playbackEvents.some((status) => /directly from the browser/.test(status)), 'direct playback status missing');
        assert(result.progressCount > 0, 'direct playback progress events missing');
        assert(/YouTube Track/.test(result.stageText), 'provider stage did not show the active track');
        assert(result.scState.provider === 'soundcloud' && result.scState.currentTime === 31, 'SoundCloud transport state failed');
        assert(result.scVolume === 20, `SoundCloud volume was not forwarded: ${result.scVolume}`);
        assert(result.vimeoState.provider === 'vimeo' && result.vimeoState.currentTime === 19, 'Vimeo transport state failed');
        assert(result.vimeoVolume === 0.35, `Vimeo volume was not forwarded: ${result.vimeoVolume}`);
        assert(/HTTPS\/app identity/.test(result.blockedMessage), 'YouTube file:// error 153 did not explain the provider restriction');
        assert(result.blockedActive === false, 'failed provider remained active');
        assert(result.youtubePlayerAttempts === 0, 'file:// playback should not create a YouTube iframe that is guaranteed to fail');
        assert(/direct media URL/.test(result.blockedStage), 'provider error UI did not offer a usable fallback');
        assert(result.blockedFrameDisplay === 'none', 'blocked provider frame should collapse instead of leaving a black box');
        assert(result.blockedStageHeight < 180, `blocked provider fallback is too tall: ${result.blockedStageHeight}px`);
        console.log('AUDIOFLIX_FILE_URL_PLAYBACK_SMOKE_OK');
    } finally {
        await browser.close();
        try { fs.unlinkSync(fixture); } catch { }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
