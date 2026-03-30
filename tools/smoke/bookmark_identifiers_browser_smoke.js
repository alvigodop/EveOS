const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openAddModal === 'function'
        && typeof window.saveLink === 'function'
        && typeof window.openSettings === 'function'
        && !!window.EveBookmarkIdentifiers?.ready
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(() => {
            const originalSaveData = window.saveData;
            const originalSaveConfig = window.saveConfig;
            let saveDataCalls = 0;
            let saveConfigCalls = 0;

            window.links = links = [];
            window.config = config = Object.assign({}, window.config || {}, {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home' }]
            });
            if (window.eveState) {
                window.eveState.links = links;
                window.eveState.config = config;
            }

            window.EveBookmarkIdentifiers.ensureConfigDefaults();

            window.saveData = function () {
                saveDataCalls += 1;
                if (typeof renderDashboard === 'function') renderDashboard();
            };
            window.saveConfig = function () {
                saveConfigCalls += 1;
            };

            try {
                const defaultIds = window.EveBookmarkIdentifiers.getDefinitions().map((entry) => entry.id);
                if (!defaultIds.includes('reading') || !defaultIds.includes('watching')) {
                    throw new Error('Missing expected default identifiers');
                }

                window.openAddModal('Alpha');
                document.getElementById('newTitle').value = 'Identifier Test';
                document.getElementById('newUrl').value = 'https://example.com/identifier-test';
                document.getElementById('newCategory').value = 'Alpha';

                const readingCheckbox = document.querySelector('#newBookmarkIdentifiers input[value="reading"]');
                const researchCheckbox = document.querySelector('#newBookmarkIdentifiers input[value="research"]');
                if (!readingCheckbox || !researchCheckbox) {
                    throw new Error('Identifier checkboxes missing in link modal');
                }
                readingCheckbox.checked = true;
                researchCheckbox.checked = true;
                window.saveLink();

                const savedLink = window.links[0];
                if (!savedLink || !Array.isArray(savedLink.identifiers)) {
                    throw new Error('Link identifiers were not saved');
                }

                window.openSettings();
                document.getElementById('bookmarkIdentifierLabel').value = 'Queue';
                document.getElementById('bookmarkIdentifierIcon').value = 'Q';
                document.getElementById('bookmarkIdentifierColor').value = '#cc7a00';
                document.getElementById('bookmarkIdentifierDescription').value = 'Queued for later but not yet active.';
                window.saveBookmarkIdentifierDefinition();

                const queueDefinition = window.EveBookmarkIdentifiers.getDefinitions().find((entry) => entry.label === 'Queue');
                if (!queueDefinition) {
                    throw new Error('Custom identifier was not saved');
                }

                window.openAddModal('Alpha');
                const queueCheckbox = document.querySelector('#newBookmarkIdentifiers input[value="' + queueDefinition.id + '"]');
                if (!queueCheckbox) {
                    throw new Error('Custom identifier did not appear in link editor');
                }

                if (typeof renderDashboard === 'function') renderDashboard();
                const badgeNode = document.querySelector('.bookmark-link-identifiers');
                const badgeText = badgeNode ? badgeNode.textContent.replace(/\s+/g, ' ').trim() : '';

                return {
                    saveDataCalls,
                    saveConfigCalls,
                    savedIdentifiers: savedLink.identifiers.slice(),
                    customIdentifierId: queueDefinition.id,
                    badgeText,
                    settingsCount: window.EveBookmarkIdentifiers.getDefinitions().length
                };
            } finally {
                window.saveData = originalSaveData;
                window.saveConfig = originalSaveConfig;
            }
        });

        if (result.saveDataCalls < 1) {
            throw new Error(`Expected at least one saveData call, saw ${result.saveDataCalls}`);
        }
        if (result.saveConfigCalls < 1) {
            throw new Error(`Expected at least one saveConfig call, saw ${result.saveConfigCalls}`);
        }
        if (!result.savedIdentifiers.includes('reading') || !result.savedIdentifiers.includes('research')) {
            throw new Error(`Expected saved identifiers to include reading and research, saw ${JSON.stringify(result.savedIdentifiers)}`);
        }
        if (!result.badgeText.includes('Reading') || !result.badgeText.includes('Research')) {
            throw new Error(`Expected rendered badges for Reading and Research, saw ${result.badgeText}`);
        }

        console.log('BOOKMARK_IDENTIFIERS_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
