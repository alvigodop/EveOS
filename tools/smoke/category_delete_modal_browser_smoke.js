const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openCategorySettings === 'function'
        && typeof window.showConfirm === 'function'
        && !!window.EveConstellationMap?.openWorkspaceMap
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        await page.evaluate(async () => {
            const seed = {
                links: [
                    { id: 'alpha-root', title: 'Alpha Root', url: 'https://alpha.example.com/root', workspace: 'main', category: 'Alpha', done: false }
                ],
                config: {
                    activeWorkspace: 'main',
                    viewMode: 'grid',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
                    categoryOrder: ['Alpha']
                },
                bookmarkFolders: {}
            };

            window.config = config = JSON.parse(JSON.stringify(seed.config));
            window.links = links = JSON.parse(JSON.stringify(seed.links));
            window.bookmarkFolders = bookmarkFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders));
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }

            window.EveConstellationMap.openWorkspaceMap('main');
            window.openCategorySettings('Alpha');
        });

        await page.waitForFunction(() => {
            const categoryModal = document.getElementById('categorySettingsModal');
            if (!categoryModal) return false;
            return Array.from(categoryModal.querySelectorAll('button')).some((button) => String(button.textContent || '').includes('Delete Category'));
        }, undefined, { timeout: 5000 });

        const result = await page.evaluate(() => {
            const categoryModal = document.getElementById('categorySettingsModal');
            if (!categoryModal) throw new Error('Category settings modal not found');
            const deleteButton = Array.from(categoryModal.querySelectorAll('button')).find((button) => String(button.textContent || '').includes('Delete Category'));
            if (!deleteButton) throw new Error('Delete category button not found');
            deleteButton.click();

            const confirmOverlay = document.getElementById('custom-modal-overlay');
            const cancelButton = document.getElementById('custom-modal-cancel');
            if (!confirmOverlay || !cancelButton) throw new Error('Custom confirm modal did not render');

            const categoryZ = parseInt(window.getComputedStyle(categoryModal).zIndex || '0', 10);
            const confirmZ = parseInt(window.getComputedStyle(confirmOverlay).zIndex || '0', 10);
            const confirmDisplay = window.getComputedStyle(confirmOverlay).display;
            cancelButton.click();

            return {
                categoryZ,
                confirmZ,
                confirmDisplay
            };
        });

        if (!(result.confirmDisplay === 'flex' && result.confirmZ > result.categoryZ)) {
            throw new Error('Delete confirm modal did not stack above category settings: ' + JSON.stringify(result));
        }

        console.log('CATEGORY_DELETE_MODAL_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
