// Soundboard-parameter backup round-trip smoke (file:// / browser-only mode).
//
// Drift asked that a backup pick up the FULL soundboard configuration, not just the music
// library: ports, per-port volumes/hotkeys/exposure, custom groups + membership, the
// soundboard view mode, active frontend group, and the global hotkey-bypass combo. This
// seeds every one of those through the real state API, runs the real "Backup All Data JSON
// Only" export, and asserts each parameter survives BOTH the produced JSON file and a wipe +
// restore (into live state and the fallback store a reload reads).
const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
        window.__eveCapturedBackupBlobs = [];
        const originalCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { try { window.__eveCapturedBackupBlobs.push(blob); } catch {} return originalCreate(blob); };
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!window.EveAudioflixState
        && !!(window.EveDataStore && window.EveDataStore.Store && window.EveDataStore.Store.applyState)
        && typeof window.exportDataJsonOnly === 'function', undefined, { timeout: 60000 });

    // 1. Seed every soundboard parameter through the real state API.
    await page.evaluate(() => {
        const S = window.EveAudioflixState;
        S.addPort({ nickname: 'DeckPort', path: 'C:/deck/one' });
        S.addPort({ nickname: 'BackPort', path: 'C:/deck/two' });
        S.addItem('sound', { id: 'sb-air', title: 'Air Horn', url: 'media/airhorn.wav', volume: 1 });
        S.addItem('sound', { id: 'sb-clap', title: 'Clap', url: 'media/clap.wav', volume: 1 });
        // Per-sound params write BOTH the item field and the side maps.
        S.setItemVolume('sound', 'sb-air', 0.33);
        S.setItemHotkey('sound', 'sb-air', 'ctrl+shift+1');
        S.setItemExposed('sound', 'sb-air', true);
        S.setItemHotkey('sound', 'sb-clap', 'ctrl+shift+2');
        // Custom groups + many-to-many membership.
        S.addSoundboardGroup('Bits');
        S.addSoundboardGroup('Stingers');
        S.toggleSoundGroup('sb-air', 'Bits', true);
        S.toggleSoundGroup('sb-air', 'Stingers', true);
        S.toggleSoundGroup('sb-clap', 'Bits', true);
        // Scalar soundboard prefs.
        S.update({ soundboardViewMode: 'frontend', activeFrontendGroup: 'Bits', hotkeyBypassCombo: 'ctrl+alt+b' }, 'smoke-seed');
        // Browser Folder registry mirror: the granted FileSystemDirectoryHandle can't be
        // serialized, but its metadata must ride in the backup so restore can surface it for
        // re-grant. (headless has no showDirectoryPicker, so seed the mirror directly.)
        S.update({ browserFolders: [{ id: 'fsp_echo', nickname: 'Echo-Like-Connect', addedAt: 111 }] }, 'smoke-seed-folders');
    });

    // 2. Run the REAL JSON-only backup and read the produced blob text.
    const exportedText = await page.evaluate(async () => {
        window.__eveCapturedBackupBlobs = [];
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};
        try { window.exportDataJsonOnly(); } finally { HTMLAnchorElement.prototype.click = originalClick; }
        const blob = window.__eveCapturedBackupBlobs[window.__eveCapturedBackupBlobs.length - 1];
        return blob ? await blob.text() : '';
    });

    function checkParams(a) {
        if (!a) return ['audioflix section missing'];
        const fails = [];
        const ports = a.ports || [];
        if (!ports.some((p) => p.nickname === 'DeckPort' && p.path === 'C:/deck/one')) fails.push('DeckPort lost');
        if (!ports.some((p) => p.nickname === 'BackPort')) fails.push('BackPort lost');
        const air = (a.soundboard || []).find((s) => s.id === 'sb-air') || {};
        if (air.volume !== 0.33) fails.push('sb-air volume lost');
        if (air.hotkey !== 'ctrl+shift+1') fails.push('sb-air per-item hotkey lost');
        if (air.exposed !== true) fails.push('sb-air exposed flag lost');
        if ((a.portVolumes || {})['sb-air'] !== 0.33) fails.push('portVolumes[sb-air] lost');
        if ((a.portHotkeys || {})['sb-air'] !== 'ctrl+shift+1') fails.push('portHotkeys[sb-air] lost');
        if ((a.portHotkeys || {})['sb-clap'] !== 'ctrl+shift+2') fails.push('portHotkeys[sb-clap] lost');
        if ((a.exposedPortedSounds || {})['sb-air'] !== true) fails.push('exposedPortedSounds[sb-air] lost');
        const groups = a.soundboardGroups || [];
        if (!groups.includes('Bits') || !groups.includes('Stingers')) fails.push('custom groups lost');
        const airGroups = (a.soundGroupMap || {})['sb-air'] || [];
        if (!airGroups.includes('Bits') || !airGroups.includes('Stingers')) fails.push('sb-air group membership lost');
        if (!((a.soundGroupMap || {})['sb-clap'] || []).includes('Bits')) fails.push('sb-clap group membership lost');
        if (a.soundboardViewMode !== 'frontend') fails.push('soundboardViewMode lost');
        if (a.activeFrontendGroup !== 'Bits') fails.push('activeFrontendGroup lost');
        if (a.hotkeyBypassCombo !== 'ctrl+alt+b') fails.push('hotkeyBypassCombo lost');
        if (!(a.browserFolders || []).some((f) => f.id === 'fsp_echo' && f.nickname === 'Echo-Like-Connect')) fails.push('browser folder registry lost');
        return fails;
    }

    let parsed = null;
    try { parsed = JSON.parse(exportedText); } catch { parsed = null; }
    const fileFails = parsed ? checkParams(parsed.audioflix) : ['JSON did not parse'];

    // 3. Wipe every soundboard surface, restore from the exported JSON, re-check live + fallback.
    const restore = await page.evaluate((jsonText) => {
        window.EveAudioflixState.replaceState({
            soundboard: [], music: [], ports: [], browserFolders: [], portVolumes: {}, portHotkeys: {},
            exposedPortedSounds: {}, soundboardGroups: [], soundGroupMap: {},
            soundboardViewMode: 'backend', activeFrontendGroup: '', hotkeyBypassCombo: ''
        }, 'sb-smoke-wipe');
        const applied = window.EveDataStore.Store.applyState(JSON.parse(jsonText));
        return {
            applied,
            live: window.eveState.config.audioflix || {},
            fallback: JSON.parse(localStorage.getItem('eveAudioflixFallbackState') || '{}')
        };
    }, exportedText);

    const liveFails = restore.applied ? checkParams(restore.live) : ['applyState returned false'];
    const fallbackFails = checkParams(restore.fallback);

    await browser.close();
    const fails = [];
    if (fileFails.length) fails.push('FILE: ' + fileFails.join(', '));
    if (liveFails.length) fails.push('LIVE: ' + liveFails.join(', '));
    if (fallbackFails.length) fails.push('FALLBACK: ' + fallbackFails.join(', '));
    if (fails.length) { console.error('FAIL: ' + fails.join(' | ')); process.exit(1); }
    console.log('AUDIOFLIX_SOUNDBOARD_PARAMS_BACKUP_OK');
})().catch((e) => { console.error(e); process.exit(1); });
