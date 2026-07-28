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
    });
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

    await page.evaluate(() => {
        const S = window.EveAudioflixState;
        S.addMusicGroup('Gilded age Music');
        const connectionId = 'spotify-browser-playlist';
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
                duration: 180 + index
            });
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
    });

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
