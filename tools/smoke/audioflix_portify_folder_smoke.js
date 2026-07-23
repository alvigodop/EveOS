// "Save path" bridge smoke: a restored Browser Folder (whose granted handle can't be backed up)
// can be converted to a path-based Server Port whose PATH does ride in the datapack. Drives the
// real click on the "Save path" button with a stubbed showPrompt, then asserts the folder became
// a server Port under the SAME id (per-item settings keyed by ported_<id>_* stay valid), left the
// browserFolders mirror, and its path is present in a fresh backup capture.
const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');
const FOLDER_PATH = 'C:/Users/alvin/Sounds/Echo-Like-Connect';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
        if (typeof window.showDirectoryPicker !== 'function') window.showDirectoryPicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!(window.EveAudioflix && window.EveAudioflix.ready)
        && !!(window.EveAudioflixState && window.EveAudioflixState.ready)
        && !!(window.EveAudioflixFsPorts && window.EveAudioflixFsPorts.ready)
        && !!(window.EveDataStore && window.EveDataStore.Store && window.EveDataStore.Store.captureState), undefined, { timeout: 60000 });

    // Restored Browser Folder (mirror only, no handle) + a per-item setting keyed by its id.
    // Stub the in-app prompt AFTER load (dialogs.js sets the real one at load time).
    await page.evaluate(async (folderPath) => {
        window.showPrompt = async () => folderPath;
        await new Promise((r) => { const q = indexedDB.deleteDatabase('eve-audioflix-fsports'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
        window.EveAudioflixState.replaceState({
            browserFolders: [{ id: 'fsp_echo', nickname: 'Echo-Like-Connect', addedAt: 4 }],
            portVolumes: { 'ported_fsp_echo_1-screaming.mp3': 0.5 }
        }, 'portify-smoke');
        await window.EveAudioflixFsPorts.reconcile();
        window.EveAudioflix.open();
    }, FOLDER_PATH);

    await page.waitForSelector('#audioflix-overlay [data-af-action="toggle-ports"]', { timeout: 15000 });
    await page.click('#audioflix-overlay [data-af-action="toggle-ports"]');
    await page.waitForSelector('#audioflix-overlay [data-af-action="portify-fsport"]', { timeout: 15000 });
    await page.click('#audioflix-overlay [data-af-action="portify-fsport"]');

    // Let the async convert (addPort -> removeFolder -> reconcile) settle.
    await page.waitForFunction(() => (window.EveAudioflixState.ensure().ports || []).some((p) => p.id === 'fsp_echo'), undefined, { timeout: 8000 }).catch(() => {});

    const result = await page.evaluate(() => {
        const st = window.EveAudioflixState.ensure();
        const cap = window.EveDataStore.Store.captureState();
        const capPorts = cap.audioflix?.ports || [];
        return {
            becamePort: (st.ports || []).some((p) => p.id === 'fsp_echo' && p.path === 'C:/Users/alvin/Sounds/Echo-Like-Connect'),
            leftMirror: !(st.browserFolders || []).some((f) => f.id === 'fsp_echo'),
            settingKept: (st.portVolumes || {})['ported_fsp_echo_1-screaming.mp3'] === 0.5,
            pathInBackup: capPorts.some((p) => p.id === 'fsp_echo' && p.path === 'C:/Users/alvin/Sounds/Echo-Like-Connect'),
            notInBackupFolders: !(cap.audioflix?.browserFolders || []).some((f) => f.id === 'fsp_echo')
        };
    });

    await browser.close();
    const fails = [];
    if (!result.becamePort) fails.push('folder did not convert to a server Port under the same id');
    if (!result.leftMirror) fails.push('converted folder still lingers in the browserFolders mirror');
    if (!result.settingKept) fails.push('per-item setting (keyed by folder id) was lost on convert');
    if (!result.pathInBackup) fails.push('converted Port path is not present in a fresh backup capture');
    if (!result.notInBackupFolders) fails.push('backup still carries the folder as a browser-folder stub (duplicate)');
    if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
    console.log('AUDIOFLIX_PORTIFY_FOLDER_OK');
})().catch((e) => { console.error(e); process.exit(1); });
