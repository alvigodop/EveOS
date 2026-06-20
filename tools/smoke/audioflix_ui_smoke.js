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
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
                enumerateDevices: async () => [
                    { kind: 'audiooutput', deviceId: 'cable-output', label: 'CABLE Input (VB-Audio Virtual Cable)' },
                    { kind: 'audiooutput', deviceId: 'speakers-output', label: 'Smoke Speakers' }
                ],
                selectAudioOutput: async () => ({ deviceId: 'speakers-output', label: 'Smoke Speakers' })
            }
        });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async (text) => { window.__audioflixCopiedText = text; } }
        });
        Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
            configurable: true,
            value: async function (deviceId) {
                Object.defineProperty(this, 'sinkId', { configurable: true, value: deviceId });
            }
        });
    });

    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!window.EveAudioflix?.open && !!window.EveAudioflixState, undefined, {
        timeout: 60000
    });

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 10000 });
    const drawerInitiallyCollapsed = await page.evaluate(() => {
        const drawer = document.querySelector('.audioflix-routing-drawer');
        return !!drawer && !drawer.classList.contains('is-open') && !document.querySelector('.audioflix-route-board');
    });

    await page.fill('form[data-af-form="sound"] input[name="title"]', 'Smoke Chime');
    await page.fill('form[data-af-form="sound"] input[name="url"]', 'https://example.com/smoke-chime.mp3');
    await page.fill('form[data-af-form="sound"] input[name="category"]', 'Smoke');
    await page.fill('form[data-af-form="sound"] input[name="volume"]', '0.5');
    await page.click('form[data-af-form="sound"] button[type="submit"]');

    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.fill('form[data-af-form="music"] input[name="title"]', 'Smoke Track');
    await page.fill('form[data-af-form="music"] input[name="url"]', 'https://example.com/smoke-track.mp3');
    await page.fill('form[data-af-form="music"] input[name="artist"]', 'EveOS');
    await page.fill('form[data-af-form="music"] input[name="folder"]', 'Audioflix');
    await page.click('form[data-af-form="music"] button[type="submit"]');

    await page.click('[data-af-action="tab"][data-af-tab="router"]');
    await page.click('[data-af-action="toggle-routing-drawer"]');
    await page.waitForSelector('.audioflix-routing-drawer.is-open .audioflix-route-board', { timeout: 10000 });
    await page.click('[data-af-action="arm-cable"]');
    await page.waitForFunction(() => {
        const status = document.querySelector('.audioflix-player span')?.textContent || '';
        return /CABLE Input not visible|Gemini voice port armed/.test(status);
    }, undefined, { timeout: 10000 });
    const selectiveRouteApplied = await page.evaluate(() => {
        const snapshot = window.EveAudioflixState.getSnapshot();
        return snapshot.routeMode === 'browser-selective'
            && snapshot.geminiVoicePortEnabled === true
            && /CABLE Input/.test(snapshot.preferredSinkLabel || '');
    });
    await page.waitForFunction(() => {
        const options = [...(document.querySelector('[data-af-control="monitor-output-select"]')?.options || [])];
        return options.some((option) => option.value === 'cable-output' && option.disabled);
    }, undefined, { timeout: 10000 });
    await page.click('[data-af-action="copy-route-status"]');
    await page.waitForFunction(() => /Audioflix Routing Status/.test(window.__audioflixCopiedText || ''), undefined, {
        timeout: 10000
    });
    await page.click('[data-af-action="mark-windows-route"]');
    await page.waitForFunction(() => window.EveAudioflixState.getSnapshot().routeMode === 'manual', undefined, {
        timeout: 10000
    });
    await page.click('[data-af-action="copy-route-status"]');
    await page.waitForFunction(() => /Windows mixer route/.test(window.__audioflixCopiedText || ''), undefined, {
        timeout: 10000
    });
    await page.evaluate(() => {
        window.EveAudioflixGemini.setMonitorEnabled(true);
        window.EveAudioflixGemini.setMonitorSink('monitor-smoke-device', 'Smoke Monitor Speakers');
    });
    await page.click('[data-af-action="toggle-gemini-monitor"]');
    await page.waitForFunction(() => window.EveAudioflixState.getSnapshot().geminiVoiceMonitorEnabled === false, undefined, {
        timeout: 10000
    });
    await page.click('[data-af-action="toggle-gemini-monitor"]');
    await page.waitForFunction(() => window.EveAudioflixState.getSnapshot().geminiVoiceMonitorEnabled === true, undefined, {
        timeout: 10000
    });
    const result = await page.evaluate(() => {
        const snapshot = window.EveAudioflixState.getSnapshot();
        const monitorBlocksCable = [...(document.querySelector('[data-af-control="monitor-output-select"]')?.options || [])]
            .some((option) => option.value === 'cable-output' && option.disabled);
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
            voiceMonitorEnabled: updated.geminiVoiceMonitorEnabled,
            voiceMonitorLabel: updated.geminiVoiceMonitorSinkLabel,
            routeMode: updated.routeMode,
            mode: updated.geminiConversationMode,
            routedEvents: updated.counters.routedGeminiEvents,
            hasRouterNotes: /CABLE/i.test(document.querySelector('.audioflix-content')?.textContent || ''),
            hasRouteBoard: /Gemini Voice/.test(document.querySelector('.audioflix-route-board')?.textContent || ''),
            drawerExpanded: document.querySelector('.audioflix-routing-drawer')?.classList.contains('is-open'),
            hasRouteHealth: /Output routing/.test(document.querySelector('.audioflix-route-health')?.textContent || ''),
            hasRouteGuide: /Windows mixer route is marked|Next useful action/.test(document.querySelector('.audioflix-route-guide')?.textContent || ''),
            routeActions: [...document.querySelectorAll('.audioflix-route-actions [data-af-action]')]
                .map((button) => button.dataset.afAction).join(','),
            hasBrowserCore: /Browser Output Core/.test(document.querySelector('.audioflix-status-grid')?.textContent || ''),
            hasSelectiveCopy: /Selective browser route/.test(window.__audioflixCopiedText || ''),
            hasVoiceRouteTest: typeof window.EveAudioflixGemini.playVoiceRouteTest === 'function',
            hasTestSignal: typeof window.EveAudioflixAudio.playTestSignal === 'function',
            hasMonitorCard: /Local Monitor/i.test(document.querySelector('.audioflix-status-grid')?.textContent || ''),
            monitorBlocksCable,
            hasBananaPreset: !!document.querySelector('.audioflix-vbcable-preset [data-af-action="arm-cable"]'),
            presetApplied: /CABLE Input/.test(updated.preferredSinkLabel || ''),
            copiedRouteStatus: /Browser Core/.test(window.__audioflixCopiedText || '') && /Windows mixer route/.test(window.__audioflixCopiedText || ''),
            buttonExpanded: document.querySelector('.topbar-audioflix-btn')?.getAttribute('aria-expanded')
        };
    });
    await page.click('[data-af-action="clear-gemini-events"]');
    await page.waitForFunction(() => window.EveAudioflixState.getSnapshot().counters.routedGeminiEvents === 0, undefined, {
        timeout: 10000
    });
    const clearResult = await page.evaluate(() => ({
        routedEvents: window.EveAudioflixState.getSnapshot().counters.routedGeminiEvents,
        headerText: document.querySelector('.audioflix-header-actions')?.textContent || ''
    }));

    const failures = [];
    if (!drawerInitiallyCollapsed) failures.push('routing drawer was not collapsed by default');
    if (!result.hasOverlay) failures.push('overlay not visible');
    if (!selectiveRouteApplied) failures.push('Auto CABLE did not create selective browser route');
    if (result.soundCount !== 1) failures.push(`expected 1 sound, got ${result.soundCount}`);
    if (result.musicCount !== 1) failures.push(`expected 1 track, got ${result.musicCount}`);
    if (!result.voicePortEnabled) failures.push('Gemini voice port did not persist');
    if (!result.voiceMonitorEnabled) failures.push('Gemini voice monitor did not persist');
    if (result.voiceMonitorLabel !== 'Smoke Monitor Speakers') failures.push(`wrong monitor label: ${result.voiceMonitorLabel}`);
    if (result.routeMode !== 'manual') failures.push(`manual Windows mixer route did not persist: ${result.routeMode}`);
    if (result.mode !== 'text-brain-live-voice') failures.push(`wrong mode: ${result.mode}`);
    if (result.routedEvents < 1) failures.push('Gemini audio event not recorded');
    if (!result.hasRouterNotes) failures.push('router notes missing');
    if (!result.drawerExpanded) failures.push('routing drawer did not expand');
    if (!result.hasRouteBoard) failures.push('route board missing');
    if (!result.hasRouteGuide) failures.push('route guide missing');
    if (!result.hasRouteHealth) failures.push('route health row missing');
    if (!/local-only/.test(result.routeActions) || !/mark-windows-route/.test(result.routeActions) || !/test-signal/.test(result.routeActions) || !/copy-route-status/.test(result.routeActions)) failures.push(`route actions incomplete: ${result.routeActions}`);
    if (!result.hasBrowserCore) failures.push('Browser Output Core card missing');
    if (!result.hasSelectiveCopy) failures.push('selective browser route note missing from copied status');
    if (!result.hasVoiceRouteTest) failures.push('Gemini WebAudio route test helper missing');
    if (!result.hasTestSignal) failures.push('test signal helper missing');
    if (!result.copiedRouteStatus) failures.push('copy route status did not write useful text');
    if (!result.hasMonitorCard) failures.push('Local Monitor card missing');
    if (!result.monitorBlocksCable) failures.push('Local Monitor did not block the Voice Port CABLE sink');
    if (clearResult.routedEvents !== 0 || !/0 Gemini events/.test(clearResult.headerText)) failures.push('Gemini event counter did not clear through UI');
    if (!result.hasBananaPreset) failures.push('Banana preset button missing');
    if (!result.presetApplied) failures.push('Banana preset did not select CABLE Input');
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
