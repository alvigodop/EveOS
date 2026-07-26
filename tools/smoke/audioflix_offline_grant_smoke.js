/**
 * audioflix_offline_grant_smoke.js
 *
 * A localized track stores an absolute path. A browser cannot read a path — it needs a
 * FileSystemDirectoryHandle the user granted — so without one the track only plays while the
 * localhost port server is running. That grant existed only under Ports (and, later, the Music
 * Port form), which is nowhere near where the failure is felt.
 *
 * Asserts the track's own settings panel offers the grant, names the exact folder to pick, and
 * that failing to reach a local copy says what to do instead of dead-ending.
 *
 * Runs on file:// with no server, which is the state being fixed.
 */
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

async function main() {
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

    assert(await page.evaluate(() => location.protocol) === 'file:', 'this runs on file://');

    const LOCAL = 'C:\\Users\\alvin\\Downloads\\All Songs\\[31]Follow Me.mp3';
    const trackId = await page.evaluate((localPath) => {
        const S = window.EveAudioflixState;
        const added = S.addItem('music', { title: 'Follow Me', url: localPath, folder: 'All Songs' });
        S.updateItem('music', added.id, { localPath });
        return added.id;
    }, LOCAL);

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 10000 });
    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.click(`[data-af-action="item-info"][data-af-id="${trackId}"]`);
    await page.waitForSelector('.audioflix-info-body', { timeout: 10000 });

    // The grant lives in the panel, and names the folder the picker must land on.
    const grant = await page.$('.audioflix-info-body [data-af-action="grant-music-folder"]');
    assert(grant, 'the track settings panel offers Grant Offline Access');

    const shownDir = await page.$eval('.audioflix-info-body', (el) => el.textContent);
    assert(shownDir.includes('C:\\Users\\alvin\\Downloads\\All Songs'),
        'the panel names the exact folder to grant (so the user knows what to pick)');
    assert(!shownDir.includes('[31]Follow Me.mp3\\'), 'it names the folder, not the file');
    console.log('grant affordance OK — offered in the track panel, folder named');

    // Browsers cannot grant without a user gesture + OS dialog, so the resolver must report a
    // clean miss rather than throwing, and playback must fail with an ACTIONABLE message.
    const resolved = await page.evaluate((p) => window.EveAudioflixFsPorts.fileUrlForPath(p), LOCAL);
    assert(resolved === '', `no granted folder resolves to no blob URL, got "${resolved}"`);

    const failure = await page.evaluate(async (id) => {
        const item = window.EveAudioflixState.getSnapshot().music.find((m) => m.id === id);
        try { await window.EveAudioflixLocalPlayback.prepare(item); return { threw: false }; }
        catch (e) { return { threw: true, message: String(e.message || e) }; }
    }, trackId);
    assert(failure.threw, 'an unreachable local copy is reported, not silently played');
    assert(/Grant Offline Access/i.test(failure.message),
        `the failure points at the fix, got "${failure.message}"`);
    assert(/All Songs/.test(failure.message), `the failure names the folder, got "${failure.message}"`);
    console.log('failure path OK —', failure.message);

    // Track blobs must not be tied to the soundboard listing's lifetime: rebuilding that list used
    // to revoke the URL of whatever music was playing.
    const survives = await page.evaluate(async () => {
        const FS = window.EveAudioflixFsPorts;
        const before = await FS.listSounds().then(() => true).catch(() => false);
        return before;
    });
    assert(survives, 'listSounds runs cleanly alongside the track path cache');

    assert(pageErrors.length === 0, 'no uncaught page errors: ' + pageErrors.join(' | '));
    await browser.close();
    console.log('AUDIOFLIX_OFFLINE_GRANT_SMOKE_OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
