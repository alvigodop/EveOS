const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} window.__eveSmokeNoAutoGemini = true; });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!window.EveAudioflixState && !!(window.EveDataStore && window.EveDataStore.Store && window.EveDataStore.Store.captureState && window.EveDataStore.Store.applyState), undefined, { timeout: 60000 });

    // 1. Seed every user-content surface that must travel with a datapack.
    await page.evaluate(() => {
        window.EveAudioflixState.addPort({ nickname: 'RTPort', path: 'C:/rt/sounds' });
        window.EveAudioflixState.addSoundboardGroup('RTGroup');
        window.EveAudioflixState.addItem('sound', { id: 'rt-sound', title: 'RT Sound', url: 'media/rt.wav', volume: 0 });
        window.EveAudioflixState.addItem('music', { id: 'rt-music', title: 'RT Music', url: 'https://example.com/watch?v=rt', volume: 0.62 });
    });

    // 2. Capture (the backup path) -> must include routing plus sound/music content.
    const captureOk = await page.evaluate(() => {
        const cap = window.EveDataStore.Store.captureState();
        const a = cap && cap.audioflix;
        return !!(a
            && (a.ports || []).some(p => p.nickname === 'RTPort')
            && (a.soundboardGroups || []).includes('RTGroup')
            && (a.soundboard || []).some(item => item.id === 'rt-sound' && item.volume === 0)
            && (a.music || []).some(item => item.id === 'rt-music' && item.volume === 0.62)
            && !cap.bookmarks.config.audioflix);
    });

    // 3. Wipe Audioflix, restore the captured datapack, then verify all content returns.
    const restoreOk = await page.evaluate(() => {
        const cap = window.EveDataStore.Store.captureState();          // snapshot WITH our data
        window.EveAudioflixState.replaceState({ soundboard: [], music: [], ports: [], soundboardGroups: [] }, 'smoke-wipe');
        window.EveDataStore.Store.applyState(cap);                     // restore
        const a = window.eveState.config.audioflix || {};
        return (a.ports || []).some(p => p.nickname === 'RTPort')
            && (a.soundboardGroups || []).includes('RTGroup')
            && (a.soundboard || []).some(item => item.id === 'rt-sound')
            && (a.music || []).some(item => item.id === 'rt-music');
    });

    // 4. An explicitly empty Audioflix datapack must stay empty; stale fallback metadata
    // must not silently repopulate sounds or music after load.
    const clearResult = await page.evaluate(() => {
        let stopCalls = 0;
        const originalStopAll = window.EveAudioflixAudio.stopAll;
        window.EveAudioflixAudio.stopAll = async () => { stopCalls += 1; };
        const cap = window.EveDataStore.Store.captureState();
        cap.audioflix = { soundboard: [], music: [], ports: [], soundboardGroups: [] };
        cap.bookmarks.config.audioflix = cap.audioflix;
        window.EveDataStore.Store.applyState(cap);
        const a = window.EveAudioflixState.ensure();
        window.EveAudioflixAudio.stopAll = originalStopAll;
        return {
            cleared: a.soundboard.length === 0 && a.music.length === 0 && a.ports.length === 0,
            stopCalls
        };
    });

    // 5. Legacy datapacks with no Audioflix key are still full-pack replacements. They must
    // clear the previous pack's clips instead of leaking them into the newly loaded pack.
    const absentClearsOk = await page.evaluate(() => {
        window.EveAudioflixState.update({
            nativeBridgeBase: 'http://127.0.0.1:9876',
            routeMode: 'manual'
        }, 'legacy-route-preserve');
        window.EveAudioflixState.addItem('sound', { id: 'leak-check', title: 'Leak Check', url: 'media/leak.wav' });
        const legacy = window.EveDataStore.Store.captureState();
        delete legacy.audioflix;
        if (legacy.bookmarks?.config) delete legacy.bookmarks.config.audioflix;
        window.EveDataStore.Store.applyState(legacy);
        const a = window.EveAudioflixState.ensure();
        return a.soundboard.length === 0
            && a.music.length === 0
            && a.ports.length === 0
            && a.nativeBridgeBase === 'http://127.0.0.1:9876'
            && a.routeMode === 'manual';
    });

    // 6. An immediate page exit must flush the pending debounce so a quick reload cannot
    // discard the last Audioflix edit.
    const pagehideFlushOk = await page.evaluate(() => {
        window.EveAudioflixState.addItem('music', { id: 'exit-save', title: 'Exit Save', url: 'media/exit-save.mp3' });
        window.dispatchEvent(new Event('pagehide'));
        const fallback = JSON.parse(localStorage.getItem('eveAudioflixFallbackState') || '{}');
        return (fallback.music || []).some((item) => item.id === 'exit-save');
    });

    await browser.close();
    const fails = [];
    if (!captureOk) fails.push('captureState() did NOT include audioflix ports/groups');
    if (!restoreOk) fails.push('applyState() did NOT restore audioflix ports/groups');
    if (!clearResult.cleared) fails.push('explicitly empty Audioflix state was repopulated by fallback data');
    if (clearResult.stopCalls !== 1) fails.push('datapack replacement did not stop previous Audioflix playback');
    if (!absentClearsOk) fails.push('legacy datapack without Audioflix leaked the previous pack audio');
    if (!pagehideFlushOk) fails.push('pending Audioflix edit was lost during pagehide');
    if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
    console.log('AUDIOFLIX_DURABILITY_RT_OK');
})().catch(e => { console.error(e); process.exit(1); });
