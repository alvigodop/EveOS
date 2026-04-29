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
        && typeof window.EveBookmarkFolders?.moveLinksToFolderTarget === 'function'
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const originalSaveData = window.saveData;
            const originalSaveConfig = window.saveConfig;
            let saveDataCalls = 0;
            let saveConfigCalls = 0;

            window.links = links = [];
            window.bookmarkFolders = bookmarkFolders = {
                'main::Currently Reading': {
                    nodes: [
                        { id: 'quick-folder', parentId: '', name: 'Queue Folder', order: 0 }
                    ],
                    settings: { clickBehaviorMode: 'inherit' }
                }
            };
            window.config = config = Object.assign({}, window.config || {}, {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home' }],
                categoryOrderByWorkspace: {
                    main: ['Alpha', 'Currently Reading']
                }
            });
            if (window.eveState) {
                window.eveState.links = links;
                window.eveState.config = config;
                window.eveState.bookmarkFolders = bookmarkFolders;
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
                window.links.push({
                    id: 'target-existing',
                    title: 'Target Existing',
                    url: 'https://example.com/target-existing',
                    workspace: 'main',
                    category: 'Currently Reading',
                    folderId: 'quick-folder'
                });

                window.openSettings();
                window.editBookmarkIdentifierDefinition('reading');
                const quickTargetSelect = document.getElementById('bookmarkIdentifierQuickLinkTarget');
                if (!quickTargetSelect) throw new Error('Quick link target select missing');
                const quickValue = Array.from(quickTargetSelect.options)
                    .map(option => option.value)
                    .find(value => value.includes(encodeURIComponent('Currently Reading')));
                if (!quickValue) throw new Error('Currently Reading quick-link target missing');
                quickTargetSelect.value = quickValue;
                window.addBookmarkIdentifierQuickLink();
                window.saveBookmarkIdentifierDefinition();
                const readingDefinition = window.EveBookmarkIdentifiers.getDefinitions().find((entry) => entry.id === 'reading');
                if (!readingDefinition?.quickLinks || readingDefinition.quickLinks.length !== 1) {
                    throw new Error('Reading quick link was not saved');
                }

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

                if (typeof window.closeAddModal === 'function') window.closeAddModal();
                if (typeof renderDashboard === 'function') renderDashboard();
                await wait(160);
                const badgeNode = document.querySelector('.bookmark-link-identifiers');
                const badgeText = badgeNode ? badgeNode.textContent.replace(/\s+/g, ' ').trim() : '';
                const readingBadge = document.querySelector('.bookmark-identifier-badge[data-bookmark-identifier-id="reading"][data-bookmark-id="' + savedLink.id + '"]');
                if (!readingBadge) throw new Error('Reading badge with quick panel attributes missing');
                readingBadge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }));
                const quickPanel = document.getElementById('bookmarkIdentifierQuickPanel');
                if (!quickPanel || !quickPanel.classList.contains('is-open')) {
                    throw new Error('Quick panel did not open from label hover');
                }
                const quickButton = quickPanel.querySelector('[data-bi-action="quick"]');
                if (!quickButton) throw new Error('Quick Links button missing');
                quickButton.click();
                const folderButton = quickPanel.querySelector('[data-folder-id="quick-folder"]');
                if (!folderButton) throw new Error('Quick link folder browser did not render target folder');
                folderButton.click();
                const moveButton = quickPanel.querySelector('[data-bi-action="move"]');
                if (!moveButton) throw new Error('Quick link move button missing');
                moveButton.click();

                const movedLink = window.links.find((link) => String(link.id) === String(savedLink.id));
                if (!movedLink || movedLink.category !== 'Currently Reading' || movedLink.folderId !== 'quick-folder') {
                    throw new Error('Quick link move did not send bookmark into selected folder');
                }

                return {
                    saveDataCalls,
                    saveConfigCalls,
                    savedIdentifiers: savedLink.identifiers.slice(),
                    customIdentifierId: queueDefinition.id,
                    badgeText,
                    settingsCount: window.EveBookmarkIdentifiers.getDefinitions().length,
                    quickLinkTarget: readingDefinition.quickLinks[0],
                    movedCategory: movedLink.category,
                    movedFolderId: movedLink.folderId
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
