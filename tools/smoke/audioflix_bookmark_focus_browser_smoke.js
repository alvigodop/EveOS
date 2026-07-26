const path = require('path');
const { pathToFileURL } = require('url');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    let browser = null;
    let context = null;
    try {
        ({ browser } = await launchChromiumOrConnect({ headless: true }));
        context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        await page.goto(pathToFileURL(path.join(REPO_ROOT, 'EveOS.html')).href, {
            waitUntil: 'load',
            timeout: 180000
        });
        await page.waitForFunction(() => (
            typeof window.openBookmarkFocusModal === 'function'
            && typeof window.bookmarkFocusOpenAudioflixLinker === 'function'
            && typeof window.EveAudioflix?.openNexus === 'function'
            && typeof window.EveAudioflixLinks?.add === 'function'
        ), null, { timeout: 180000 });

        await page.evaluate(() => {
            const bookmarkId = 'audioflix-focus-bookmark';
            const links = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
            const retained = links.filter((link) => link?.id !== bookmarkId);
            retained.push({
                id: bookmarkId,
                title: 'Audioflix Focus Bookmark',
                url: 'https://example.test/focus',
                workspace: 'main',
                category: 'Audioflix Smoke'
            });
            links.length = 0;
            retained.forEach((link) => links.push(link));
            window.links = links;

            const track = window.EveAudioflixState.addItem('music', {
                id: 'audioflix-focus-track',
                title: 'Canonical Focus Track',
                artist: 'Audioflix Smoke',
                url: 'https://example.test/focus.mp3'
            });
            window.EveAudioflixLinks.add([track.id], {
                scopeType: 'bookmark',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke',
                bookmarkId
            }, 'music');
            window.__audioflixFocusPlayed = '';
            window.EveAudioflixAudio.playItem = async (item) => {
                window.__audioflixFocusPlayed = item.id;
                return true;
            };
            window.openBookmarkFocusModal(bookmarkId);
        });

        const modal = page.locator('#bookmarkFocusModal');
        await modal.waitFor({ state: 'visible', timeout: 30000 });
        const section = page.locator('#bookmarkFocusAudioflixSection');
        await section.evaluate((node) => { node.open = true; });
        await page.getByText('Canonical Focus Track', { exact: true }).waitFor({
            state: 'visible',
            timeout: 30000
        });
        assert(
            await page.locator('#bookmarkFocusAudioflixSummary').textContent() === '1 linked',
            'Expected Bookmark Focus to show one direct Audioflix reference'
        );

        await page.locator('#bookmarkFocusAudioflixList button', { hasText: 'Play' }).click();
        await page.waitForFunction(() => window.__audioflixFocusPlayed === 'audioflix-focus-track');
        const afterPlayState = await page.evaluate(() => ({
            modalDisplay: getComputedStyle(document.getElementById('bookmarkFocusModal')).display,
            sectionOpen: document.getElementById('bookmarkFocusAudioflixSection')?.open === true,
            listHtml: document.getElementById('bookmarkFocusAudioflixList')?.innerHTML || ''
        }));
        assert(
            afterPlayState.modalDisplay !== 'none' && afterPlayState.sectionOpen,
            `Expected Bookmark Focus Audioflix controls to remain open after playback: ${JSON.stringify(afterPlayState)}`
        );

        await page.locator('#bookmarkFocusAudioflixList button', { hasText: 'Detach' }).click();
        await page.waitForFunction(() => (
            document.getElementById('bookmarkFocusAudioflixSummary')?.textContent === '0 linked'
        ));
        const detachedCount = await page.evaluate(() => (
            window.EveAudioflixLinks.captureForScope({
                scopeType: 'bookmark',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke',
                bookmarkId: 'audioflix-focus-bookmark'
            }, { directOnly: true }).count
        ));
        assert(detachedCount === 0, 'Expected detach to remove the canonical bookmark reference');

        await page.evaluate(() => {
            window.EveAudioflixLinks.add(['audioflix-focus-track'], {
                scopeType: 'bookmark',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke',
                bookmarkId: 'audioflix-focus-bookmark'
            }, 'music');
            window.bookmarkFocusOpenAudioflixLinker();
        });
        await page.waitForFunction(() => (
            document.getElementById('audioflix-overlay')?.hidden === false
            && window.EveAudioflixLinks.getPendingScope()?.bookmarkId === 'audioflix-focus-bookmark'
        ), null, { timeout: 30000 });

        const result = await page.evaluate(() => ({
            playedId: window.__audioflixFocusPlayed,
            pendingScope: window.EveAudioflixLinks.getPendingScope(),
            modalVisible: getComputedStyle(document.getElementById('bookmarkFocusModal')).display !== 'none',
            audioflixVisible: document.getElementById('audioflix-overlay')?.hidden === false
        }));
        assert(result.playedId === 'audioflix-focus-track', 'Expected Bookmark Focus Play to use the canonical item');
        assert(result.modalVisible === false, 'Expected linker handoff to close Bookmark Focus');
        assert(result.audioflixVisible === true, 'Expected linker handoff to open Audioflix Nexus');

        console.log('AUDIOFLIX_BOOKMARK_FOCUS_BROWSER_SMOKE_OK', JSON.stringify(result));
    } catch (error) {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
    } finally {
        if (context) {
            try { await context.close(); } catch (error) {}
        }
        if (browser) {
            try { await browser.close(); } catch (error) {}
        }
    }
})();
