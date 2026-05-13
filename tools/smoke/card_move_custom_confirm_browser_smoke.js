const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.moveCategoryCardToWorkspace === 'function'
        && typeof window.showConfirmWithTitle === 'function'
        && !!document.getElementById('custom-modal-overlay')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    let browserDialogs = 0;

    page.on('dialog', async (dialog) => {
        browserDialogs += 1;
        await dialog.dismiss();
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        await page.evaluate(() => {
            window.config = config = {
                activeWorkspace: 'source-tab',
                workspaces: [
                    { id: 'source-tab', name: 'Source Tab', icon: 'S' },
                    { id: 'target-tab', name: 'Target Tab', icon: 'T' }
                ],
                categoryOrder: ['Reading'],
                scrollableCategories: true
            };
            const seededLinks = [{
                id: 'move-confirm-link',
                title: 'Move Confirm Link',
                url: 'https://example.test/move-confirm',
                workspace: 'source-tab',
                category: 'Reading'
            }];
            if (typeof window.setLiveLinks === 'function') {
                window.setLiveLinks(seededLinks);
            } else {
                window.links = links = seededLinks;
            }
            window.bookmarkFolders = bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = seededLinks;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
        });

        const launchState = await page.evaluate(() => {
            const result = window.moveCategoryCardToWorkspace('source-tab', 'Reading', 'target-tab', {
                requireConfirm: true,
                targetWorkspaceName: 'Target Tab',
                source: 'card-move-custom-confirm-browser-smoke'
            });
            window.__cardMoveCustomConfirmPromise = result;
            return {
                isPromise: !!(result && typeof result.then === 'function')
            };
        });

        assert(launchState.isPromise, 'Card move should wait on custom modal confirmation');
        await page.waitForSelector('#custom-modal-overlay[data-modal-kind="card-move-confirm"]', { state: 'visible', timeout: 5000 });
        const modalState = await page.evaluate(() => ({
            title: document.getElementById('custom-modal-title')?.textContent?.trim() || '',
            message: document.getElementById('custom-modal-msg')?.textContent?.trim() || '',
            confirmLabel: document.getElementById('custom-modal-confirm')?.textContent?.trim() || '',
            cancelLabel: document.getElementById('custom-modal-cancel')?.textContent?.trim() || ''
        }));

        assert(modalState.title === 'Move Card', `Unexpected modal title: ${JSON.stringify(modalState)}`);
        assert(modalState.message.includes('Move card "Reading" to Target Tab?'), `Unexpected modal message: ${JSON.stringify(modalState)}`);
        assert(modalState.confirmLabel === 'Move Card', `Unexpected confirm label: ${JSON.stringify(modalState)}`);
        assert(modalState.cancelLabel === 'Keep Here', `Unexpected cancel label: ${JSON.stringify(modalState)}`);

        await page.click('#custom-modal-confirm');
        const moveState = await page.evaluate(async () => {
            const result = await window.__cardMoveCustomConfirmPromise;
            const link = (typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : window.links)
                .find((entry) => entry.id === 'move-confirm-link');
            return {
                result,
                workspace: link?.workspace || '',
                category: link?.category || ''
            };
        });

        assert(browserDialogs === 0, `Native browser dialogs should not open, saw ${browserDialogs}`);
        assert(moveState.result === true, `Confirmed move should resolve true: ${JSON.stringify(moveState)}`);
        assert(moveState.workspace === 'target-tab', `Confirmed move should update workspace: ${JSON.stringify(moveState)}`);
        assert(moveState.category === 'Reading', `Confirmed move should preserve category: ${JSON.stringify(moveState)}`);

        console.log('CARD_MOVE_CUSTOM_CONFIRM_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
