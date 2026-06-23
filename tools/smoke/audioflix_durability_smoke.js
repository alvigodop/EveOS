const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} window.__eveSmokeNoAutoGemini = true; });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!window.EveAudioflixState && !!(window.EveDataStore && window.EveDataStore.Store && window.EveDataStore.Store.captureState && window.EveDataStore.Store.applyState), undefined, { timeout: 60000 });

    // 1. Seed Audioflix state: a port (custom folder path) + a group.
    await page.evaluate(() => {
        window.EveAudioflixState.addPort({ nickname: 'RTPort', path: 'C:/rt/sounds' });
        window.EveAudioflixState.addSoundboardGroup('RTGroup');
    });

    // 2. Capture (the backup path) -> must include audioflix with our port + group.
    const captureOk = await page.evaluate(() => {
        const cap = window.EveDataStore.Store.captureState();
        const a = cap && cap.audioflix;
        return !!(a && (a.ports || []).some(p => p.nickname === 'RTPort') && (a.soundboardGroups || []).includes('RTGroup'));
    });

    // 3. Wipe audioflix in config, then restore from a fresh capture -> must come back.
    const restoreOk = await page.evaluate(() => {
        const cap = window.EveDataStore.Store.captureState();          // snapshot WITH our data
        window.eveState.config.audioflix = { ports: [], soundboardGroups: [] }; // simulate loss
        window.EveDataStore.Store.applyState(cap);                     // restore
        const a = window.eveState.config.audioflix || {};
        return (a.ports || []).some(p => p.nickname === 'RTPort') && (a.soundboardGroups || []).includes('RTGroup');
    });

    await browser.close();
    const fails = [];
    if (!captureOk) fails.push('captureState() did NOT include audioflix ports/groups');
    if (!restoreOk) fails.push('applyState() did NOT restore audioflix ports/groups');
    if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
    console.log('AUDIOFLIX_DURABILITY_RT_OK');
})().catch(e => { console.error(e); process.exit(1); });
