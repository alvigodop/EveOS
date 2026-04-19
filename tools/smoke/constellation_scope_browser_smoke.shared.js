const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
    return {
        links: [
            { id: 'alpha-root-1', title: 'Alpha Root 1', url: 'https://alpha.example.com/root-1', workspace: 'main', category: 'Alpha', done: false, tags: ['alpha'], coverImage: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2248%22%3E%3Crect width=%2232%22 height=%2248%22 fill=%22%23ff5f6d%22/%3E%3C/svg%3E' },
            { id: 'alpha-root-2', title: 'Alpha Root 2', url: 'https://alpha.example.com/root-2', workspace: 'main', category: 'Alpha', done: false, tags: ['alpha'], coverImage: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2248%22%3E%3Crect width=%2232%22 height=%2248%22 fill=%22%2342c9ff%22/%3E%3C/svg%3E' },
            {
                id: 'alpha-folder-1',
                title: 'Alpha Folder 1',
                url: 'https://alpha.example.com/folder-1',
                workspace: 'main',
                category: 'Alpha',
                folderId: 'f-parent',
                done: false,
                tags: ['arc'],
                coverImages: [
                    'data:image/gif;base64,R0lGODlhAQABAPAAAMrKygAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='
                ],
                fixedCoverImage: 'data:image/gif;base64,R0lGODlhAQABAPAAAMrKygAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='
            },
            { id: 'alpha-folder-2', title: 'Alpha Folder 2', url: 'https://alpha.example.com/folder-2', workspace: 'main', category: 'Alpha', folderId: 'f-child', done: false, tags: ['arc'] },
            { id: 'gamma-root-1', title: 'Gamma Root 1', url: 'https://gamma.example.com/root-1', workspace: 'main', category: 'Gamma', done: false, tags: ['gamma'] },
            { id: 'beta-root-1', title: 'Beta Root 1', url: 'https://beta.example.com/root-1', workspace: 'alt', category: 'Beta', done: false, tags: ['beta'], coverImage: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2248%22%3E%3Crect width=%2232%22 height=%2248%22 fill=%22%23ffd166%22/%3E%3C/svg%3E' }
        ],
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder' },
                { id: 'alt', name: 'Alt', icon: 'folder' }
            ],
            categoryOrder: ['Alpha', 'Gamma', 'Beta']
        },
        bookmarkFolders: {
            'main::Alpha': {
                nodes: [
                    { id: 'f-parent', parentId: null, name: 'Parent Folder', order: 1 },
                    { id: 'f-child', parentId: 'f-parent', name: 'Child Folder', order: 1 }
                ]
            }
        },
        quickPins: []
    };
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.openUnidexView === 'function'
        && !!window.EveConstellationMap?.openCurrentViewMap
        && !!window.EveConstellationMap?.__debugGetGraphStats
        && !!document.querySelector('.topbar-map-btn')
    ), undefined, { timeout: 180000 });
}

async function seedState(page, payload) {
    await page.evaluate((seed) => {
        const clonedConfig = JSON.parse(JSON.stringify(seed.config));
        const clonedLinks = JSON.parse(JSON.stringify(seed.links));
        const clonedFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders || {}));
        const clonedPins = JSON.parse(JSON.stringify(seed.quickPins || []));

        config = clonedConfig;
        links = clonedLinks;
        bookmarkFolders = clonedFolders;
        quickPins = clonedPins;
        window.config = config;
        window.links = links;
        window.bookmarkFolders = bookmarkFolders;
        if (window.eveState) {
            window.eveState.quickPins = clonedPins;
        }

        try {
            localStorage.setItem('eveV22Data', JSON.stringify(clonedLinks));
            localStorage.setItem('eveV22Config', JSON.stringify(clonedConfig));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(clonedFolders));
            localStorage.setItem('eveV22QuickPins', JSON.stringify(clonedPins));
        } catch (error) {
            // Some embedded/sandboxed contexts in file:// mode reject localStorage access.
        }

        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }, payload);
}

async function clickAndWaitForMap(page, clickFn) {
    await clickFn();
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return overlay && overlay.style.display !== 'none' && !!window.EveConstellationMap?.__debugGetGraphStats?.().visible;
    }, undefined, { timeout: 15000 });
    await page.waitForTimeout(250);
}

async function closeMap(page) {
    await page.locator('[data-map-toolbar="close"]').click();
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return !overlay || overlay.style.display === 'none';
    }, undefined, { timeout: 10000 });
}

async function captureInspectorCover(page) {
    return page.evaluate(() => {
        const info = document.querySelector('[data-map-info]');
        const img = info?.querySelector('[data-map-info-cover] img');
        return img?.getAttribute('src') || '';
    });
}

async function getStats(page) {
    return page.evaluate(() => window.EveConstellationMap.__debugGetGraphStats());
}

async function ensureControlsExpanded(page) {
    await page.waitForSelector('[data-map-toolbar="controls"]', { timeout: 10000 });
    const expanded = await page.evaluate(() => {
        const panel = document.querySelector('[data-map-controls-panel]');
        return !!panel && window.getComputedStyle(panel).display !== 'none';
    });
    if (!expanded) {
        await page.click('[data-map-toolbar="controls"]');
        await page.waitForFunction(() => {
            const panel = document.querySelector('[data-map-controls-panel]');
            return !!panel && window.getComputedStyle(panel).display !== 'none';
        }, null, { timeout: 5000 });
    }
}

async function clickToolbarControl(page, selector) {
    await page.waitForFunction((sel) => {
        return Array.from(document.querySelectorAll(sel)).some((node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
        });
    }, selector, { timeout: 30000 });

    const clicked = await page.evaluate((sel) => {
        const target = Array.from(document.querySelectorAll(sel)).find((node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
        });
        if (!target) return false;
        target.click();
        return true;
    }, selector);

    if (!clicked) {
        throw new Error(`Failed to click toolbar control ${selector}`);
    }
}

async function prepareSeededPage(page, payload) {
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
    await waitForApp(page);
    await page.waitForTimeout(2500);
    await seedState(page, payload);
    await page.waitForTimeout(500);
}

module.exports = {
    chromium,
    buildSeedPayload,
    captureInspectorCover,
    clickAndWaitForMap,
    clickToolbarControl,
    closeMap,
    ensureControlsExpanded,
    getStats,
    prepareSeededPage
};
