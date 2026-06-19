const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));

    await page.addInitScript(() => {
        try {
            localStorage.clear();
        } catch {}
        window.__eveSmokeNoAutoGemini = true;
    });

    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!window.EveAudioflix?.open && !!window.EveAudioflixState, undefined, {
        timeout: 60000
    });

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 10000 });

    await page.fill('form[data-af-form="sound"] input[name="title"]', 'Smoke Chime');
    await page.fill('form[data-af-form="sound"] input[name="url"]', 'https://example.com/smoke-chime.mp3');
    await page.fill('form[data-af-form="sound"] input[name="category"]', 'Smoke');
    await page.fill('form[data-af-form="sound"] input[name="volume"]', '0.5');
    await page.click('form[data-af-form="sound"] button[type="submit"]');

    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.fill('form[data-af-form="music"] input[name="title"]', 'Smoke Track');
    await page.fill('form[data-af-form="music"] input[name="url"]', 'https://example.com/smoke-track.mp3');
    await page.fill('form[data-af-form="music"] input[name="artist"]', 'EveOS');
    await page.fill('form[data-af-form="music"] input[name="card"]', 'Audioflix');
    await page.click('form[data-af-form="music"] button[type="submit"]');

    await page.click('[data-af-action="tab"][data-af-tab="router"]');
    const result = await page.evaluate(() => {
        const snapshot = window.EveAudioflixState.getSnapshot();
        window.EveAudioflixGemini.setVoicePortEnabled(true);
        window.EveAudioflixGemini.setConversationMode('text-brain-live-voice');
        window.dispatchEvent(new CustomEvent('eve:gemini-audio-output', {
            detail: { kind: 'complete', chars: 24, at: Date.now() }
        }));
        const updated = window.EveAudioflixState.getSnapshot();
        return {
            hasOverlay: !document.getElementById('audioflix-overlay')?.hidden,
            soundCount: snapshot.soundboard.length,
            musicCount: snapshot.music.length,
            voicePortEnabled: updated.geminiVoicePortEnabled,
            mode: updated.geminiConversationMode,
            routedEvents: updated.counters.routedGeminiEvents,
            hasRouterNotes: /VB-CABLE/i.test(document.querySelector('.audioflix-content')?.textContent || ''),
            buttonExpanded: document.querySelector('.topbar-audioflix-btn')?.getAttribute('aria-expanded')
        };
    });

    const failures = [];
    if (!result.hasOverlay) failures.push('overlay not visible');
    if (result.soundCount !== 1) failures.push(`expected 1 sound, got ${result.soundCount}`);
    if (result.musicCount !== 1) failures.push(`expected 1 track, got ${result.musicCount}`);
    if (!result.voicePortEnabled) failures.push('Gemini voice port did not persist');
    if (result.mode !== 'text-brain-live-voice') failures.push(`wrong mode: ${result.mode}`);
    if (result.routedEvents < 1) failures.push('Gemini audio event not recorded');
    if (!result.hasRouterNotes) failures.push('router notes missing');
    if (result.buttonExpanded !== 'true') failures.push('topbar aria-expanded not updated');
    if (pageErrors.length) failures.push(`page errors: ${pageErrors.join('\n')}`);

    await browser.close();
    if (failures.length) throw new Error(failures.join('; '));
    console.log('AUDIOFLIX_UI_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
