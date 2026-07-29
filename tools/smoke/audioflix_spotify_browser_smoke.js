const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = `file:///${path.join(ROOT, 'EveOS.html').replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
        window.__EveAudioflixSpotifyStartTimeoutMs = 1000;
    });
    await page.route('https://open.spotify.com/embed/iframe-api/v1', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `
            window.onSpotifyIframeApiReady({
                createController: function (_mount, options, ready) {
                    var listeners = {};
                    var totals = window.__spotifyUiTotals = window.__spotifyUiTotals || {
                        created: 0, play: 0, pause: 0, destroy: 0
                    };
                    totals.created += 1;
                    var controller = {
                        addListener: function (name, listener) { listeners[name] = listener; },
                        play: function () {
                            totals.play += 1;
                            if (window.__spotifyBlockNextPlay) {
                                window.__spotifyBlockNextPlay = false;
                                return;
                            }
                            setTimeout(function () {
                                controller.emit('playback_started', {});
                                controller.emit('playback_update', {
                                    position: 1000, duration: 180000, isPaused: false
                                });
                            }, 0);
                        },
                        resume: function () { controller.play(); },
                        pause: function () {
                            totals.pause += 1;
                            controller.emit('playback_update', {
                                position: 1000, duration: 180000, isPaused: true
                            });
                        },
                        seek: function () {},
                        destroy: function () { totals.destroy += 1; },
                        emit: function (name, data) {
                            if (listeners[name]) listeners[name]({ data: data });
                        }
                    };
                    ready(controller);
                    setTimeout(function () { controller.emit('ready', {}); }, 0);
                }
            });`
    }));
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(
        () => !!window.EveAudioflix?.open
            && !!window.EveAudioflixSpotifyUi
            && typeof window.EveAudioflixNative?.listSpotifyPlaylist === 'function'
            && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt,
        undefined,
        { timeout: 120000 }
    );

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel');
    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.click('[data-af-action="toggle-import-form"]');
    await page.click('[data-af-action="select-playlist-mode"][data-af-mode="spotify"]');
    await page.waitForSelector('[data-af-form="import-playlist"][data-af-mode="spotify"]');
    assert(
        await page.locator('[data-af-form="import-playlist"] textarea[name="url"]').isVisible(),
        'Spotify import accepts a URL, embed URL, or iframe'
    );
    assert(
        await page.locator('[data-af-action="spotify-session-import"]').isVisible(),
        'Spotify import exposes the saved-session action'
    );
    assert(
        (await page.locator('[data-af-form="import-playlist"]').innerText()).includes('separate saved EveOS Edge profile'),
        'Spotify import explains that private-playlist login uses a dedicated persistent profile'
    );
    await page.fill('[data-af-form="import-playlist"] textarea[name="url"]', '<iframe src="https://open.spotify.com/embed/playlist/privatePlaylist"></iframe>');
    await page.fill('[data-af-form="import-playlist"] input[name="folder"]', 'Test-Spotify');
    await page.evaluate(() => {
        window.EveAudioflixNative.listSpotifyPlaylist = async () => ({
            ok: false,
            reason: 'Spotify playlist needs the saved account session.'
        });
    });
    await page.click('[data-af-form="import-playlist"] button[type="submit"]');
    await page.waitForSelector('.audioflix-import-status');
    assert(
        (await page.locator('.audioflix-import-status').innerText()).includes('saved account session'),
        'Spotify import failure is visible inside the import form'
    );
    assert(
        (await page.inputValue('[data-af-form="import-playlist"] textarea[name="url"]')).includes('privatePlaylist')
            && await page.inputValue('[data-af-form="import-playlist"] input[name="folder"]') === 'Test-Spotify',
        'failed Spotify import retains its iframe and target folder'
    );

    const seeded = await page.evaluate(() => {
        const S = window.EveAudioflixState;
        S.addMusicGroup('Gilded age Music');
        const connectionId = 'spotify-browser-playlist';
        const ids = [];
        [
            ['Selfish', 'Madison Beer', 'Silence Between Songs', 1],
            ['Mobius', 'Sawano Hiroyuki', 'Mobile Suit Gundam Hathaway', 2]
        ].forEach(([title, artist, album, position], index) => {
            const track = S.addItem('music', {
                title,
                artist,
                album,
                url: `https://open.spotify.com/track/browserTrack${index}`,
                sourceProvider: 'spotify',
                folder: 'Spotify Playlists',
                duration: 180 + index,
                showProviderTransport: index === 1
            });
            ids.push(track.id);
            S.updateItem('music', track.id, {
                playlistId: connectionId,
                playlistPosition: position,
                sourceId: `browserTrack${index}`
            });
            S.toggleMusicGroup(track.id, 'Gilded age Music', true);
        });
        S.update({
            musicPlaylists: [{
                id: connectionId,
                url: 'https://open.spotify.com/playlist/browserPlaylist',
                playlistId: 'browserPlaylist',
                title: 'Gilded age Music',
                provider: 'spotify',
                group: 'Gilded age Music',
                folder: 'Spotify Playlists',
                owner: 'DriftAi',
                embedUrl: 'https://open.spotify.com/embed/playlist/browserPlaylist',
                trackCount: 2
            }]
        }, 'spotify-browser-smoke');
        window.EveAudioflix.render();
        return { ids };
    });

    const firstId = seeded.ids[0];
    const cardPlay = `[data-af-action="play"][data-af-type="music"][data-af-id="${firstId}"]`;
    const internalView = `[data-af-action="internal-view"][data-af-type="music"][data-af-id="${firstId}"]`;
    await page.waitForSelector(cardPlay);
    await page.click(cardPlay);
    await page.waitForFunction(() => window.__spotifyUiTotals?.play >= 1);
    assert(
        await page.locator('.audioflix-provider-stage.is-transport-only.is-transport-hidden').count() === 1,
        'regular Spotify card play hides its mounted provider transport by default'
    );
    assert(
        await page.evaluate((id) => window.EveAudioflixAudio.getPlaybackState()?.item?.id === id, firstId),
        'regular Spotify card play owns the shared Audioflix transport'
    );
    await page.click(`[data-af-action="item-info"][data-af-type="music"][data-af-id="${firstId}"]`);
    await page.waitForSelector('.audioflix-provider-transport-toggle');
    assert(
        await page.locator('.audioflix-provider-transport-toggle').isChecked() === false,
        'compact Spotify panel preference defaults off'
    );
    await page.check('.audioflix-provider-transport-toggle');
    assert(
        await page.evaluate((id) => window.EveAudioflixState.ensure().music
            .find((item) => item.id === id)?.showProviderTransport === true, firstId),
        'per-track compact Spotify panel preference persists'
    );
    assert(
        await page.locator('.audioflix-provider-stage.is-transport-only:not(.is-transport-hidden)').count() === 1,
        'enabling the preference reveals the active compact Spotify panel'
    );
    await page.click('.audioflix-info-close-btn');
    await page.click(internalView);
    await page.waitForSelector('.audioflix-provider-stage.is-internal-view');
    await page.evaluate(() => window.EveAudioflixAudio.pause());
    const controllerBeforeClose = await page.evaluate(() => ({ ...window.__spotifyUiTotals }));
    await page.click('[data-url-player-action="stop"]');
    await page.waitForSelector('.audioflix-provider-stage.is-transport-only');
    assert(
        await page.evaluate((before) => window.__spotifyUiTotals.created === before.created
            && window.__spotifyUiTotals.destroy === before.destroy, controllerBeforeClose),
        'closing the expanded player preserves the ready Spotify controller'
    );
    const cardPlayBeforeResume = await page.evaluate(() => window.__spotifyUiTotals.play);
    await page.click(cardPlay);
    await page.waitForFunction(
        (before) => window.__spotifyUiTotals?.play > before,
        cardPlayBeforeResume
    );
    assert(
        await page.locator('.audioflix-provider-stage.is-transport-only').isVisible(),
        'regular card resumes Spotify after the expanded Internal Player closes'
    );
    assert(
        await page.evaluate((before) => window.__spotifyUiTotals.created === before.created, controllerBeforeClose),
        'regular card resume does not rebuild the Spotify controller'
    );

    await page.evaluate(() => window.EveAudioflixAudio.stopAll());
    const secondId = seeded.ids[1];
    await page.evaluate(() => { window.__spotifyBlockNextPlay = true; });
    await page.click(`[data-af-action="play"][data-af-type="music"][data-af-id="${secondId}"]`);
    await page.waitForFunction(() => (
        document.querySelector('.audioflix-provider-status')?.textContent || ''
    ).includes('direct click'));
    assert(
        await page.locator('.audioflix-provider-stage.is-transport-only:not(.has-error) .audioflix-provider-frame').isVisible(),
        'blocked autoplay keeps Spotify official controls visible for a direct click'
    );
    assert(
        await page.evaluate((id) => window.EveAudioflixAudio.getPlaybackState()?.item?.id === id, secondId),
        'blocked autoplay keeps the provider session recoverable'
    );

    await page.evaluate(() => window.EveAudioflixAudio.stopAll());
    await page.click('[data-af-action="toggle-view-mode"][data-af-type="music"]');
    await page.waitForSelector('[data-af-action="play-music-group"]');
    const frontendPlayBefore = await page.evaluate(() => window.__spotifyUiTotals.play);
    await page.click('[data-af-action="play-music-group"]');
    await page.waitForFunction(
        (before) => window.__spotifyUiTotals?.play > before,
        frontendPlayBefore
    );
    assert(
        await page.evaluate(() => /spotify\.com/i.test(window.EveAudioflixAudio.getPlaybackState()?.item?.url || '')),
        'frontend group Play uses the same Spotify provider controller'
    );
    await page.evaluate(() => window.EveAudioflixAudio.stopAll());
    await page.click('[data-af-action="toggle-view-mode"][data-af-type="music"]');

    await page.click('[data-af-action="toggle-import-form"]');
    await page.click('[data-af-action="toggle-groups"][data-af-type="music"]');
    await page.click('[data-af-action="toggle-playlist-link-form"][data-af-group="Gilded age Music"]');
    await page.waitForSelector('[data-af-spotify-inspector]');
    assert(await page.locator('[data-af-spotify-row]').count() === 2, 'inspector lists imported Spotify tracks');
    assert(
        (await page.locator('[data-af-spotify-inspector]').innerText()).includes('DriftAi'),
        'inspector retains playlist owner metadata'
    );
    await page.fill('[data-af-spotify-search]', 'Mobius');
    const visibility = await page.$$eval('[data-af-spotify-row]', (rows) => rows.map((row) => !row.hidden));
    assert(visibility.join(',') === 'false,true', 'inspector search filters by title, artist, or album');
    assert(errors.length === 0, `browser page errors: ${errors.join(' | ')}`);

    console.log('AUDIOFLIX_SPOTIFY_BROWSER_SMOKE_OK');
    await browser.close();
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
