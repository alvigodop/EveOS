<<<<<<< Updated upstream
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openEdit === 'function'
        && typeof window.saveLink === 'function'
        && typeof window.toggleCategoryLibrary === 'function'
        && !!window.EveBookmarkIdentifiers?.ready
        && !!window.EveLibrary?.ConnectionsAPI?.loadConnections
        && !!window.EveLibrary?.Storage?.loadLibrary
    ), undefined, { timeout: 180000 });
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
=======
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-lib-custom-id-'));
    const serverProcess = spawn('python', ['python-server.py', '3105', '--modular-root', modularRoot], {
        stdio: 'pipe', shell: true
    });

    await new Promise(r => setTimeout(r, 2000));

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
>>>>>>> Stashed changes

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

<<<<<<< Updated upstream
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const seed = {
                links: [
                    { id: '101', title: 'Library Book', url: 'https://example.com/book', workspace: 'main', category: 'Reading' }
                ],
                config: {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
                    bookmarkIdentifiers: []
                },
                connections: [
                    { id: 'c1', linkId: '101', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e1' }
                ],
                libraries: {
                    'main::Reading': {
                        dataType: 'graphicNovels',
                        entries: [
                            { id: 'e1', title: 'Library Book', sourceUrl: 'https://example.com/book' }
                        ]
                    }
                }
            };

            localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
            localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
            localStorage.setItem('eveLibraryConnections', JSON.stringify(seed.connections));
            localStorage.setItem('eveLibraryData', JSON.stringify(seed.libraries));

            window.links = links = JSON.parse(JSON.stringify(seed.links));
            window.config = config = JSON.parse(JSON.stringify(seed.config));
            if (window.eveState) {
                window.eveState.links = window.links;
                window.eveState.config = window.config;
            }

            window.EveBookmarkIdentifiers.ensureConfigDefaults();
            window.EveLibrary.Storage.loadLibrary();
            window.EveLibrary.ConnectionsAPI.loadConnections();
            if (typeof renderDashboard === 'function') renderDashboard();

            window.openEdit('101');
            const modal = document.getElementById('addModal');
            if (!modal || modal.style.display !== 'flex') {
                throw new Error('Edit modal did not open');
            }

            const libraryToggle = document.getElementById('linkLibraryToggle');
            const isLibraryEnabled = !!libraryToggle?.checked;

            const addButton = document.querySelector('.bookmark-identifier-add-btn');
            if (!addButton) {
                throw new Error('Custom identifier button missing');
            }
            addButton.click();

            const promptOverlay = document.getElementById('custom-modal-overlay');
            if (!promptOverlay || promptOverlay.style.display !== 'flex') {
                throw new Error('Custom prompt did not open');
            }

            const promptInput = document.getElementById('custom-modal-input');
            promptInput.value = 'SuperTag';
            document.getElementById('custom-modal-confirm').click();
            await new Promise(resolve => setTimeout(resolve, 0));

            const labels = Array.from(document.querySelectorAll('.bookmark-identifier-editor-option'));
            const superTag = labels.find(label => label.textContent.includes('SuperTag'));
            const isTagChecked = !!superTag?.querySelector('input:checked');
            if (!isTagChecked) {
                throw new Error('Custom identifier was not auto-selected');
            }

            window.saveLink();
            await new Promise(resolve => setTimeout(resolve, 0));

            const isModalOpenAfterSave = modal.style.display === 'flex';
            const savedLinks = JSON.parse(localStorage.getItem('eveV22Data') || '[]');
            const targetLink = savedLinks.find(link => String(link.id) === '101');
            if (!targetLink) {
                throw new Error('Saved link missing from localStorage');
            }

            if (typeof renderDashboard === 'function') renderDashboard();
            window.toggleCategoryLibrary('Reading');
            await new Promise(resolve => setTimeout(resolve, 0));

            const badgeNode = document.querySelector('.lib-entry-identifiers');
            const badgeText = badgeNode ? badgeNode.textContent.replace(/\s+/g, ' ').trim() : '';

            return {
                isLibraryEnabled,
                isTagChecked,
                isModalOpenAfterSave,
                savedIdentifiers: Array.isArray(targetLink.identifiers) ? targetLink.identifiers.slice() : [],
                badgeText
            };
        });

        if (!result.isLibraryEnabled) {
            throw new Error('Expected linked library toggle to be enabled');
        }
        if (!result.isTagChecked) {
            throw new Error('Expected custom identifier checkbox to stay selected');
        }
        if (result.isModalOpenAfterSave) {
            throw new Error('Edit modal stayed open after save');
        }
        if (!result.savedIdentifiers.includes('supertag')) {
            throw new Error(`Expected saved identifiers to include supertag, saw ${JSON.stringify(result.savedIdentifiers)}`);
        }
        if (!result.badgeText.includes('SuperTag')) {
            throw new Error(`Expected library entry to render SuperTag badge, saw ${result.badgeText}`);
        }

        console.log('LIBRARY_CUSTOM_ID_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

run().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
=======
    const seed = {
        links: [
            { id: '101', title: 'Library Book', url: 'https://example.com/book', workspace: 'main', category: 'Reading' }
        ],
        config: {
            activeWorkspace: 'main',
            workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
            bookmarkIdentifiers: []
        },
        connections: [
            { id: 'c1', linkId: '101', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e1' }
        ],
        libraries: {
            'main::Reading': {
                dataType: 'graphicNovels',
                entries: [
                    { id: 'e1', title: 'Library Book', sourceUrl: 'https://example.com/book' }
                ]
            }
        }
    };

    await page.goto('file://' + path.resolve(__dirname, '../../EveOS.html'));
    await page.evaluate((s) => {
        localStorage.setItem('eveV22Data', JSON.stringify(s.links));
        localStorage.setItem('eveV22Config', JSON.stringify(s.config));
        localStorage.setItem('eveLibraryConnections', JSON.stringify(s.connections));
        localStorage.setItem('eveLibraryData', JSON.stringify(s.libraries));
        location.reload();
    }, seed);
    
    await page.waitForFunction(() => (
        !!window.links &&
        !!window.EveLinkForm &&
        !!window.openEdit
    ), undefined, { timeout: 10000 });
    
    await page.waitForTimeout(2000);
    
    // Open edit modal
    await page.evaluate(() => {
        window.openEdit('101');
    });
    
    await page.waitForSelector('#addModal', { state: 'visible' });
    
    // Check if library toggle is checked
    const isLibraryEnabled = await page.isChecked('#linkLibraryToggle');
    console.log('IS_LIBRARY_ENABLED:', isLibraryEnabled);

    // Click Custom button
    await page.click('.bookmark-identifier-add-btn');
    await page.waitForSelector('#custom-modal-overlay', { state: 'visible' });
    
    // Type name
    await page.fill('#custom-modal-input', 'SuperTag');
    await page.click('#custom-modal-confirm');
    
    await page.waitForTimeout(500);
    
    // Check if SuperTag is present and checked
    const isTagChecked = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('.bookmark-identifier-editor-option'));
        const superTag = labels.find(l => l.textContent.includes('SuperTag'));
        if (!superTag) return false;
        return superTag.querySelector('input').checked;
    });
    console.log('IS_TAG_CHECKED:', isTagChecked);
    
    // Click Save
    await page.click('button[onclick="saveLink()"]');
    
    await page.waitForTimeout(1000);
    
    // Check if modal closed
    const isModalOpen = await page.isVisible('#addModal');
    console.log('IS_MODAL_OPEN_AFTER_SAVE:', isModalOpen);
    
    // Check bookmark identifiers in local storage
    const savedLinks = await page.evaluate(() => JSON.parse(localStorage.getItem('eveV22Data')));
    const targetLink = savedLinks.find(l => l.id == 101);
    console.log('SAVED_IDENTIFIERS:', targetLink.identifiers);
    
    await browser.close();
    serverProcess.kill();
    fs.rmSync(modularRoot, { recursive: true, force: true });
    
    if (!isTagChecked || isModalOpen || !targetLink.identifiers || !targetLink.identifiers.includes('supertag')) {
        console.log('TEST_FAILED');
        process.exit(1);
    } else {
        console.log('LIBRARY_CUSTOM_ID_SMOKE_OK');
        process.exit(0);
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
>>>>>>> Stashed changes
