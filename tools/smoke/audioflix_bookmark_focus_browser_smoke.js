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
            && typeof window.openCategorySettings === 'function'
            && typeof window.categorySettingsOpenAudioflixLinker === 'function'
            && typeof window.EveAudioflix?.openNexus === 'function'
            && typeof window.EveAudioflixLinks?.add === 'function'
            && window.__eveCoreDataLoaded === true
            && !!document.getElementById('addModal')
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
            window.EveAudioflixLinks.add([track.id], {
                scopeType: 'card',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke'
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
        await page.evaluate(() => window.initModals());
        assert(
            await modal.isVisible(),
            'Expected a repeated modal availability check to preserve Bookmark Focus'
        );
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
            window.closeBookmarkFocusModal();
            window.openCategorySettings('Audioflix Smoke', 'general', 'main');
        });
        const categoryModal = page.locator('#categorySettingsModal');
        await categoryModal.waitFor({ state: 'visible', timeout: 30000 });
        await page.evaluate(() => window.initModals());
        assert(
            await categoryModal.isVisible(),
            'Expected a repeated modal availability check to preserve Card Settings'
        );
        const categorySection = page.locator('#categoryAudioflixSection');
        await categorySection.evaluate((node) => { node.open = true; });
        await page.locator('#categoryAudioflixList').getByText('Canonical Focus Track', { exact: true }).waitFor({
            state: 'visible',
            timeout: 30000
        });
        assert(
            await page.locator('#categoryAudioflixSummary').textContent() === '1 linked',
            'Expected Card Settings to show one direct Audioflix reference'
        );
        await page.locator('#categoryAudioflixList button', { hasText: 'Play' }).click();
        await page.waitForFunction(() => window.__audioflixFocusPlayed === 'audioflix-focus-track');
        assert(
            await categoryModal.isVisible(),
            'Expected Card Settings Audioflix controls to remain open after playback'
        );
        await page.locator('#categoryAudioflixList button', { hasText: 'Detach' }).click();
        await page.waitForFunction(() => (
            document.getElementById('categoryAudioflixSummary')?.textContent === '0 linked'
        ));
        const detachedCardCount = await page.evaluate(() => (
            window.EveAudioflixLinks.captureForScope({
                scopeType: 'card',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke'
            }, { directOnly: true }).count
        ));
        assert(detachedCardCount === 0, 'Expected detach to remove the canonical card reference');

        await page.evaluate(() => {
            window.EveAudioflixLinks.add(['audioflix-focus-track'], {
                scopeType: 'card',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke'
            }, 'music');
            window.categorySettingsOpenAudioflixLinker();
        });
        await page.waitForFunction(() => (
            document.getElementById('audioflix-overlay')?.hidden === false
            && window.EveAudioflixLinks.getPendingScope()?.scopeType === 'card'
            && window.EveAudioflixLinks.getPendingScope()?.categoryName === 'Audioflix Smoke'
        ), null, { timeout: 30000 });
        await page.evaluate(() => window.EveAudioflix.close());

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
            detachedCardCount: window.EveAudioflixLinks.captureForScope({
                scopeType: 'card',
                workspaceId: 'main',
                categoryName: 'Audioflix Smoke'
            }, { directOnly: true }).count,
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
