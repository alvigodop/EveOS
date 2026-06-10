const path = require('path');
const { pathToFileURL } = require('url');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    let browser = null;
    let context = null;
    try {
        ({ browser } = await launchChromiumOrConnect({ headless: true }));
        context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
        const page = await context.newPage();
        await page.goto(pathToFileURL(path.join(REPO_ROOT, 'EveOS.html')).href, {
            waitUntil: 'load',
            timeout: 180000
        });
        await page.locator('.topbar-matrix-btn').waitFor({
            state: 'visible',
            timeout: 180000
        });
        await page.waitForFunction(() => (
            window.__eveCoreDataLoaded === true
            && typeof window.setLiveLinks === 'function'
        ), null, { timeout: 180000 });
        await page.evaluate(() => {
            const nextConfig = {
                ...window.eveState.config,
                activeWorkspace: 'local-alpha',
                workspaces: [{
                    id: 'local-alpha',
                    name: 'Local Alpha',
                    icon: 'A',
                    subTabs: [{
                        id: 'local-shortcut',
                        name: 'Local Shortcut',
                        icon: 'S',
                        linkedTo: 'local-source',
                        subTabs: []
                    }]
                }, {
                    id: 'local-source',
                    name: 'Local Source',
                    icon: 'B',
                    subTabs: []
                }]
            };
            window.eveState.config = nextConfig;
            window.config = nextConfig;
            window.setLiveLinks([{
                id: 'local-direct-link',
                title: 'Direct Local Bookmark',
                url: 'https://example.test/direct',
                workspace: 'local-alpha',
                category: 'Direct Card'
            }, {
                id: 'local-shortcut-link',
                title: 'Shortcut Source Bookmark',
                url: 'https://example.test/shortcut',
                workspace: 'local-source',
                category: 'Source Card'
            }]);
            window.eveState.bookmarkFolders = {};
            window.bookmarkFolders = {};
            window.dispatchEvent(new CustomEvent('eve:state-mutated', {
                detail: { source: 'matrix-file-smoke' }
            }));
        });

        await page.locator('.topbar-matrix-btn').click();
        const frame = page.frameLocator('#matrix-workshop-frame');
        await frame.locator('#datapackPhoneCheckbox').waitFor({
            state: 'attached',
            timeout: 30000
        });
        await frame.locator('#toggleToolbar').click();
        await frame.locator('#widgets-section .section-header').click();
        await frame.locator('#datapackPhoneCheckbox').check();
        await frame.locator('[data-phone-connection]').filter({
            hasText: 'EVE LINK'
        }).waitFor({ state: 'visible', timeout: 30000 });
        await frame.getByText('2 bookmarks', {
            exact: true
        }).waitFor({ state: 'visible', timeout: 30000 });

        await frame.getByText('Datapack Matrix', { exact: true }).click();
        const tabNames = await frame.locator('.eve-matrix-phone-app strong').allTextContents();
        if (
            !tabNames.includes('Local Alpha')
            || !tabNames.includes('Local Shortcut')
            || tabNames.includes('Local Source')
        ) {
            throw new Error(`Local Matrix scope mismatch: ${JSON.stringify(tabNames)}`);
        }
        await frame.getByText('Local Shortcut', { exact: true }).click();
        await frame.getByText('Source Card', { exact: true }).click();
        await frame.getByText('Shortcut Source Bookmark', {
            exact: true
        }).waitFor({ state: 'visible', timeout: 30000 });

        const result = await page.evaluate(() => ({
            protocol: location.protocol,
            scope: window.EveMatrixWorkshop.getScope(),
            overlayOpen: window.EveMatrixWorkshop.isOpen()
        }));
        if (
            result.protocol !== 'file:'
            || result.scope.scope !== 'workspace'
            || result.scope.workspaceId !== 'local-alpha'
            || !result.overlayOpen
        ) {
            throw new Error(`Local Matrix host mismatch: ${JSON.stringify(result)}`);
        }

        console.log('MATRIX_DATAPACK_PHONE_FILE_BROWSER_SMOKE_OK', JSON.stringify({
            result,
            tabNames
        }));
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
