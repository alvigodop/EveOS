const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => (
            !!window.EveOS?.SearchAdvanced?.Modules?.renderVectorResults
            && !!window.EveOS?.NebulaJsonLink
            && !!window.EveOS?.SearchAdvanced?.DatapackView
        ), undefined, { timeout: 180000 });

        const result = await page.evaluate(() => {
            window.config = config = {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                categoryOrderByWorkspace: { main: ['Reading'] }
            };
            window.links = links = [{
                id: 'b1',
                title: 'Nebula Result Bookmark',
                url: 'https://example.test/b1',
                workspace: 'main',
                category: 'Reading'
            }];
            window.bookmarkFolders = bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }

            const entityLink = window.EveOS.NebulaJsonLink.createLink(links[0]);
            const container = document.createElement('div');
            container.id = 'nexus-json-action-smoke';
            document.body.appendChild(container);
            const opened = [];
            const originalOpenCardInternals = window.EveOS.SearchAdvanced.DatapackView.openCardInternals;
            window.EveOS.SearchAdvanced.DatapackView.openCardInternals = function (workspaceId, categoryName) {
                opened.push({ workspaceId, categoryName });
                return true;
            };

            window.EveOS.SearchAdvanced.Modules.renderVectorResults({
                mode: 'merged',
                query: 'nebula',
                results: [{
                    type: 'bookmark',
                    title: 'Nebula Result Bookmark',
                    url: 'https://example.test/b1',
                    entityLink,
                    path: {
                        workspaceId: 'main',
                        workspaceLabel: 'Main',
                        categoryName: 'Reading',
                        linkId: 'b1'
                    },
                    provenance: {
                        kind: 'bookmark',
                        linkId: 'b1',
                        entityLink
                    },
                    visibility: { state: 'visible', label: 'Visible' },
                    health: { state: 'healthy', label: 'Healthy' }
                }]
            }, container);

            const jsonButton = container.querySelector('[data-nx-action="json-state"]');
            const validateButton = container.querySelector('[data-nx-action="json-validate"]');
            jsonButton?.click();
            const validation = window.EveOS.NebulaJsonLink.executeAction('validate', entityLink);
            window.EveOS.SearchAdvanced.DatapackView.openCardInternals = originalOpenCardInternals;
            return {
                hasJsonButton: !!jsonButton,
                hasValidateButton: !!validateButton,
                opened,
                validationOk: validation.ok || validation.valid
            };
        });

        assert(result.hasJsonButton, 'Nexus result should expose Open JSON State when entityLink exists');
        assert(result.hasValidateButton, 'Nexus result should expose Validate Link when entityLink exists');
        assert(result.opened.some((entry) => entry.workspaceId === 'main' && entry.categoryName === 'Reading'), `Open JSON State should route to card internals: ${JSON.stringify(result)}`);
        assert(result.validationOk, `Validate Link should pass for the rendered result: ${JSON.stringify(result)}`);

        console.log('NEXUS_RESULT_JSON_ACTIONS_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
