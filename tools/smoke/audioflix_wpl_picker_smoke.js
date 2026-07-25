/**
 * audioflix_wpl_picker_smoke.js
 *
 * Guards the two WPL import regressions that only show up in a real DOM:
 *
 *  1. "Browse File needs two clicks." The picker used to be rendered inside the import form, so a
 *     rerender landing while the OS dialog was open (server wpl-read resolving, FileReader
 *     finishing, hotkey poll) replaced the form and orphaned the very input the dialog belonged
 *     to — the pick then fired `change` on a detached node and was silently lost. This test forces
 *     a rerender BETWEEN opening the picker and choosing the file, which is exactly the losing
 *     race, and asserts the path still lands on the first attempt.
 *
 *  2. Renaming a .wpl must change the imported title. WMP leaves the original name in the file's
 *     <title>, so preferring it over the filename made renames look "hard locked".
 *
 * Also covers the editable playlist link in the Groups panel: a stale link must be correctable by
 * hand, since a browser file pick can only ever yield a bare filename.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

const WPL_XML = `<?wpl version="1.0"?>
<smil><head><title>OLD EMBEDDED NAME</title></head>
<body><seq>
<media src="C:\\Music\\alpha.mp3"/>
<media src="C:\\Music\\beta.mp3"/>
</seq></body></smil>`;

async function main() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wpl-'));
    const wplPath = path.join(tmpDir, 'Renamed Playlist.wpl');
    fs.writeFileSync(wplPath, WPL_XML, 'utf8');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => { console.error('[BROWSER ERROR]', e); pageErrors.push(String(e)); });

    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
    });

    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(
        () => !!window.EveAudioflix?.open && !!window.EveAudioflixState && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt,
        undefined, { timeout: 120000 });

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 10000 });
    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.click('[data-af-action="toggle-import-form"]');
    await page.click('[data-af-action="select-playlist-mode"][data-af-mode="wpl"]');
    await page.waitForSelector('form[data-af-form="import-playlist"][data-af-mode="wpl"]', { timeout: 5000 });

    // The picker must NOT be part of the re-rendered form.
    const inFormCount = await page.$$eval('form[data-af-form="import-playlist"] .audioflix-wpl-file-picker', (els) => els.length);
    assert(inFormCount === 0, 'the WPL file input must live outside the import form (a rerender must not be able to destroy it)');

    // 1) Open the picker, then force the rerender that used to orphan it, THEN pick the file.
    await page.click('[data-af-action="trigger-wpl-file-picker"]');
    await page.waitForSelector('.audioflix-wpl-file-picker', { state: 'attached', timeout: 5000 });
    const pickerHandle = await page.$('.audioflix-wpl-file-picker');
    assert(pickerHandle, 'picker input exists after Browse File');

    await page.evaluate(() => window.EveAudioflixState.update({ hotkeyBypassCombo: 'ctrl+alt+9' }, 'smoke-forced-rerender'));
    await page.evaluate(() => window.EveAudioflix.open());
    await page.waitForTimeout(150);
    assert(await pickerHandle.evaluate((el) => document.contains(el)),
        'the picker survived a rerender while its dialog was open (this is the two-clicks bug)');

    await pickerHandle.setInputFiles(wplPath);
    await page.waitForFunction(
        () => (document.querySelector('form[data-af-form="import-playlist"] input[name="url"]')?.value || '').length > 0,
        undefined, { timeout: 5000 });
    const firstPickValue = await page.$eval('form[data-af-form="import-playlist"] input[name="url"]', (el) => el.value);
    assert(/Renamed Playlist\.wpl$/i.test(firstPickValue), `first pick populated the path field, got "${firstPickValue}"`);
    console.log('picker OK — first pick lands even with a rerender mid-dialog:', firstPickValue);

    // 2) Import it and confirm the RENAMED filename beats the stale embedded <title>.
    await page.fill('form[data-af-form="import-playlist"] input[name="folder"]', 'WPL Playlists');
    await page.click('form[data-af-form="import-playlist"] button[type="submit"]');
    // Deliberately tight: with no server running the import must still complete off the local
    // read, not sit behind the wpl-read probe timeout.
    await page.waitForFunction(() => (window.EveAudioflixState.getSnapshot().musicPlaylists || []).length === 1, undefined, { timeout: 4000 });

    const conn = await page.evaluate(() => window.EveAudioflixState.getSnapshot().musicPlaylists[0]);
    assert(conn.title === 'Renamed Playlist', `group title comes from the FILENAME, not the stale embedded title (got "${conn.title}")`);
    assert(conn.provider === 'wpl', 'connection is marked as a wpl provider');
    const trackCount = await page.evaluate(() => window.EveAudioflixState.getSnapshot().music.length);
    assert(trackCount === 2, `both media entries imported (got ${trackCount})`);
    console.log('wpl title OK — filename wins over the embedded <title>:', conn.title);

    // 3) The saved link must be editable from the Groups panel.
    await page.click('[data-af-action="toggle-groups"][data-af-type="music"]');
    await page.waitForSelector('[data-af-action="toggle-playlist-link-form"]', { timeout: 5000 });
    await page.click('[data-af-action="toggle-playlist-link-form"]');
    await page.waitForSelector('form[data-af-form="playlist-link-form"]', { timeout: 5000 });

    const prefilled = await page.$eval('form[data-af-form="playlist-link-form"] input[name="link"]', (el) => el.value);
    assert(prefilled === conn.url, `link form prefills the saved link (got "${prefilled}")`);

    const corrected = 'D:\\Corrected\\Renamed Playlist.wpl';
    await page.fill('form[data-af-form="playlist-link-form"] input[name="link"]', corrected);
    await page.click('form[data-af-form="playlist-link-form"] button[type="submit"]');
    await page.waitForFunction(
        (want) => window.EveAudioflixState.getSnapshot().musicPlaylists[0]?.url === want,
        corrected, { timeout: 5000 });
    assert(!(await page.$('form[data-af-form="playlist-link-form"]')), 'link form closes after a successful save');
    console.log('editable link OK — corrected to:', corrected);

    // An empty link is refused rather than silently wiping the connection's only source.
    const rejected = await page.evaluate(() => window.EveAudioflixPlaylists.setPlaylistLink('Renamed Playlist', '   '));
    assert(rejected.ok === false, 'a blank link is rejected');
    const stillThere = await page.evaluate(() => window.EveAudioflixState.getSnapshot().musicPlaylists[0].url);
    assert(stillThere === corrected, 'the rejected save left the existing link intact');

    // 4) A wpl sync must NOT be handed to the YouTube lister.
    const syncRes = await page.evaluate(() => window.EveAudioflixPlaylists.syncPlaylistByGroup('Renamed Playlist', true, ''));
    assert(syncRes.ok === false, 'syncing a wpl whose file is absent fails cleanly');
    assert(!/youtube|file:\/\/ page cannot read/i.test(syncRes.reason || ''),
        `wpl sync must go through the WPL reader, not the URL lister (got "${syncRes.reason}")`);
    console.log('wpl sync routing OK —', syncRes.reason);

    assert(pageErrors.length === 0, 'no uncaught page errors: ' + pageErrors.join(' | '));

    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('AUDIOFLIX_WPL_PICKER_SMOKE_OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
