const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));

    await page.addInitScript(() => {
        try {
            localStorage.clear();
        } catch {}
        window.__eveSmokeNoAutoGemini = true;
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => (
        !!window.EveAudioflix?.openNexus
        && !!window.EveAudioflixBulk?.applyMusicChanges
        && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
    ), undefined, { timeout: 60000 });

    await page.evaluate(() => {
        const music = Array.from({ length: 120 }, (_, index) => {
            const night = index < 60;
            return {
                id: `bulk-track-${index}`,
                title: `${night ? 'Night' : 'Day'} Track ${String(index).padStart(3, '0')}`,
                artist: night ? 'Sleep Artist' : 'Day Artist',
                url: `media/bulk-${index}.mp3`,
                folder: night ? 'Incoming' : 'Day Folder',
                card: night ? 'Incoming' : 'Day Folder',
                classifiers: []
            };
        });
        window.EveAudioflixState.replaceState({
            music,
            soundboard: [],
            musicGroups: [],
            musicGroupMap: {},
            musicClassifiers: []
        }, 'bulk-browser-seed');
        window.EveAudioflix.openNexus('music');
    });

    await page.waitForSelector('#audioflix-overlay:not([hidden]) [data-af-nexus-search]', { timeout: 10000 });
    await page.fill('[data-af-nexus-search]', 'Night Track');
    await page.waitForFunction(() => (
        document.querySelector('[data-af-bulk-match-count]')?.textContent === '60'
    ), undefined, { timeout: 10000 });

    await page.click('[data-af-action="nexus-select-all"]');
    await page.waitForFunction(() => (
        document.querySelector('[data-af-bulk-selected-count]')?.textContent === '60'
    ), undefined, { timeout: 10000 });

    await page.selectOption('[data-af-bulk-field="groupAction"]', 'add');
    await page.fill('[data-af-bulk-field="group"]', 'Sleep Set');
    await page.selectOption('[data-af-bulk-field="classifierAction"]', 'add');
    await page.fill('[data-af-bulk-field="classifier"]', 'Ambient');
    await page.selectOption('[data-af-bulk-field="folderAction"]', 'set');
    await page.fill('[data-af-bulk-field="folder"]', 'Night Folder');
    const addRevision = await page.evaluate(() => window.EveAudioflixState.getRevision());
    await page.click('[data-af-action="nexus-apply-bulk"]');
    await page.waitForFunction((before) => (
        window.EveAudioflixState.getRevision() === before + 1
    ), addRevision, { timeout: 10000 });

    const addResult = await page.evaluate((before) => {
        const state = window.EveAudioflixState.ensure();
        const night = state.music.filter((track) => track.title.startsWith('Night Track'));
        const day = state.music.filter((track) => track.title.startsWith('Day Track'));
        return {
            revisionDelta: window.EveAudioflixState.getRevision() - before,
            nightOk: night.length === 60 && night.every((track) => (
                track.folder === 'Night Folder'
                && track.card === 'Night Folder'
                && track.classifiers.includes('Ambient')
                && (state.musicGroupMap[track.id] || []).includes('Sleep Set')
            )),
            dayUntouched: day.length === 60 && day.every((track) => (
                track.folder === 'Day Folder'
                && !track.classifiers.length
                && !(state.musicGroupMap[track.id] || []).length
            ))
        };
    }, addRevision);

    await page.click('[data-af-action="nexus-select-all"]');
    await page.selectOption('[data-af-bulk-field="groupAction"]', 'remove');
    await page.fill('[data-af-bulk-field="group"]', 'Sleep Set');
    await page.selectOption('[data-af-bulk-field="classifierAction"]', 'remove');
    await page.fill('[data-af-bulk-field="classifier"]', 'Ambient');
    await page.selectOption('[data-af-bulk-field="folderAction"]', 'clear');
    const removeRevision = await page.evaluate(() => window.EveAudioflixState.getRevision());
    await page.click('[data-af-action="nexus-apply-bulk"]');
    await page.waitForFunction((before) => (
        window.EveAudioflixState.getRevision() === before + 1
    ), removeRevision, { timeout: 10000 });

    const removeResult = await page.evaluate((before) => {
        const state = window.EveAudioflixState.ensure();
        const night = state.music.filter((track) => track.title.startsWith('Night Track'));
        return {
            revisionDelta: window.EveAudioflixState.getRevision() - before,
            cleared: night.length === 60 && night.every((track) => (
                !track.folder
                && !track.card
                && !track.classifiers.length
                && !(state.musicGroupMap[track.id] || []).length
            )),
            selectedCount: document.querySelector('[data-af-bulk-selected-count]')?.textContent,
            matchCount: document.querySelector('[data-af-bulk-match-count]')?.textContent
        };
    }, removeRevision);

    await browser.close();
    const failures = [];
    if (addResult.revisionDelta !== 1) failures.push(`bulk add used ${addResult.revisionDelta} state revisions`);
    if (!addResult.nightOk) failures.push('bulk add did not update every filtered track');
    if (!addResult.dayUntouched) failures.push('bulk add modified tracks outside the filtered selection');
    if (removeResult.revisionDelta !== 1) failures.push(`bulk remove used ${removeResult.revisionDelta} state revisions`);
    if (!removeResult.cleared) failures.push('bulk remove/clear did not update every filtered track');
    if (removeResult.selectedCount !== '0') failures.push(`selection did not clear: ${removeResult.selectedCount}`);
    if (removeResult.matchCount !== '60') failures.push(`match count drifted: ${removeResult.matchCount}`);
    if (pageErrors.length) failures.push(`page errors: ${pageErrors.join('\n')}`);
    if (failures.length) throw new Error(failures.join('; '));
    console.log('AUDIOFLIX_NEXUS_BULK_BROWSER_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
