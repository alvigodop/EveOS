// "Save path" must be offered on a Browser Folder that is WORKING (granted), not only on a
// broken one. That is the file:// case: the folder loads fine serverless there, but its path
// still has to be recorded so a backup restored on localhost is ready to go without re-picking.
//
// Asserts: Save path shows for a granted folder (and carries the granted flag so the handle is
// preserved on convert), Re-grant is hidden when nothing needs re-granting, and a
// needs-reconnect folder still offers both.
const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
        // fsports only renders its Browser Folders section when the picker API exists.
        if (typeof window.showDirectoryPicker !== 'function') {
            window.showDirectoryPicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
        }
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!(window.EveAudioflix?.ready && window.EveAudioflixFsPorts?.ready), undefined, { timeout: 60000 });

    const out = await page.evaluate(() => {
        const render = (permission) => window.EveAudioflixFsPorts.renderPortsManager(
            { ports: [] },
            [{ id: 'fsp_ok', nickname: 'Echo-Like-Connect', permission }],
            new Set(), (value) => String(value), '<svg/>');
        const granted = render('granted');
        const needs = render('prompt');
        return {
            savePathOnGranted: granted.includes('portify-fsport'),
            grantedFlag: granted.includes('data-af-granted="1"'),
            regrantHiddenWhenGranted: !granted.includes('regrant-fsport'),
            savePathOnNeedsReconnect: needs.includes('portify-fsport'),
            regrantOnNeedsReconnect: needs.includes('regrant-fsport'),
            notGrantedFlag: needs.includes('data-af-granted="0"')
        };
    });

    await browser.close();
    const fails = [];
    if (!out.savePathOnGranted) fails.push('Save path missing on a granted folder (the file:// case)');
    if (!out.grantedFlag) fails.push('granted folder did not carry data-af-granted=1 (its handle would be discarded on convert)');
    if (!out.regrantHiddenWhenGranted) fails.push('Re-grant shown for a folder that does not need re-granting');
    if (!out.savePathOnNeedsReconnect) fails.push('Save path missing on a needs-reconnect folder');
    if (!out.regrantOnNeedsReconnect) fails.push('Re-grant missing on a needs-reconnect folder');
    if (!out.notGrantedFlag) fails.push('needs-reconnect folder did not carry data-af-granted=0');
    if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
    console.log('AUDIOFLIX_SAVEPATH_AVAILABILITY_OK');
})().catch((e) => { console.error(e); process.exit(1); });
