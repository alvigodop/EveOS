// Re-grant click-wiring smoke: a restored Browser Folder's "Re-grant" button must actually
// route through the click dispatcher to the folder picker. The button emits
// data-af-action="regrant-fsport"; if that action isn't in audioflix.ui.js's dispatch list the
// click is a silent no-op (the "stuck Re-grant" Drift hit). This drives a REAL click on the
// rendered Re-grant button with a spy picker and asserts the picker was invoked.
const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
        // Spy picker: records the call and cancels (AbortError) so nothing hangs. Being a
        // function makes fsports.supported() true so the Browser Folders UI renders.
        window.__pickerCalls = 0;
        window.showDirectoryPicker = async () => {
            window.__pickerCalls += 1;
            const err = new Error('cancelled by smoke'); err.name = 'AbortError'; throw err;
        };
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!(window.EveAudioflix && window.EveAudioflix.ready)
        && !!(window.EveAudioflixState && window.EveAudioflixState.ready)
        && !!(window.EveAudioflixFsPorts && window.EveAudioflixFsPorts.ready), undefined, { timeout: 60000 });

    // Seed a restored-backup Browser Folder (mirror only; no handle) and open the panel on Ports.
    await page.evaluate(async () => {
        await new Promise((r) => { const q = indexedDB.deleteDatabase('eve-audioflix-fsports'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
        window.EveAudioflixState.replaceState({ browserFolders: [{ id: 'fsp_click', nickname: 'Click-Folder', addedAt: 3 }] }, 'regrant-click-smoke');
        await window.EveAudioflixFsPorts.reconcile();
        window.EveAudioflix.open();
    });

    // Open the Ports manager (its button carries data-af-action="toggle-ports").
    await page.waitForSelector('#audioflix-overlay [data-af-action="toggle-ports"]', { timeout: 15000 });
    await page.click('#audioflix-overlay [data-af-action="toggle-ports"]');

    // The restored folder should render a Re-grant button once loadPortedSounds resolves.
    await page.waitForSelector('#audioflix-overlay [data-af-action="regrant-fsport"]', { timeout: 15000 });
    const callsBefore = await page.evaluate(() => window.__pickerCalls);
    await page.click('#audioflix-overlay [data-af-action="regrant-fsport"]');
    // Give the async dispatch a beat to reach showDirectoryPicker.
    await page.waitForFunction((n) => window.__pickerCalls > n, callsBefore, { timeout: 8000 })
        .catch(() => {});
    const callsAfter = await page.evaluate(() => window.__pickerCalls);

    await browser.close();
    if (!(callsAfter > callsBefore)) {
        console.error(`FAIL: Re-grant click did not reach the folder picker (calls ${callsBefore} -> ${callsAfter})`);
        process.exit(1);
    }
    console.log('AUDIOFLIX_REGRANT_CLICK_OK');
})().catch((e) => { console.error(e); process.exit(1); });
