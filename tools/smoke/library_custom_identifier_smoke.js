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

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

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