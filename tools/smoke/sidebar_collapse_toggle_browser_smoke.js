const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveWorkspaceHelpers?.findById
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'alt',
            viewMode: 'grid',
            sidebarExpanded: true,
            workspaces: [{
                id: 'main',
                name: 'Main Dashboard',
                icon: 'home',
                subTabs: [{
                    id: 'alpha',
                    name: 'Alpha Branch',
                    icon: 'folder',
                    subTabs: [{
                        id: 'beta',
                        name: 'Beta Branch Child',
                        icon: 'folder',
                        subTabs: [{
                            id: 'gamma',
                            name: 'Gamma Branch Leaf',
                            icon: 'folder',
                            subTabs: []
                        }]
                    }]
                }]
            }, {
                id: 'alt',
                name: 'Alt',
                icon: 'folder',
                subTabs: []
            }],
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        window.__sidebarCollapseRenderCount = 0;
        const originalRenderSidebar = window.renderSidebar;
        window.renderSidebar = function wrappedRenderSidebar(...args) {
            window.__sidebarCollapseRenderCount += 1;
            return originalRenderSidebar.apply(this, args);
        };

        window.renderSidebar();
    });
}

async function resetSidebarRenderCounter(page) {
    await page.evaluate(() => {
        window.__sidebarCollapseRenderCount = 0;
    });
}

async function getSidebarRenderCounter(page) {
    return page.evaluate(() => Number(window.__sidebarCollapseRenderCount || 0));
}

async function clickWorkspaceToggleLane(page, workspaceId) {
    const item = page.locator(`#sidebar .ws-item[data-ws-id="${workspaceId}"]`).first();
    const box = await item.boundingBox();
    if (!box) throw new Error(`Missing sidebar item box for ${workspaceId}`);
    await page.mouse.click(box.x + 16, box.y + (box.height / 2));
}

async function clickWorkspaceContentLane(page, workspaceId) {
    const item = page.locator(`#sidebar .ws-item[data-ws-id="${workspaceId}"]`).first();
    const box = await item.boundingBox();
    if (!box) throw new Error(`Missing sidebar item box for ${workspaceId}`);
    await page.mouse.click(box.x + 56, box.y + (box.height / 2));
}

async function hoverWorkspaceRow(page, workspaceId) {
    const item = page.locator(`#sidebar .ws-item[data-ws-id="${workspaceId}"]`).first();
    const box = await item.boundingBox();
    if (!box) throw new Error(`Missing sidebar item box for ${workspaceId}`);
    await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
}

async function readSidebarIndentState(page) {
    return page.evaluate(() => {
        const sidebar = document.getElementById('sidebar');
        const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
        const ids = ['main', 'alpha', 'beta', 'gamma'];
        const rows = ids.map((id) => {
            const item = document.querySelector(`#sidebar .ws-item[data-ws-id="${id}"]`);
            if (!item) return null;
            const rect = item.getBoundingClientRect();
            const label = item.querySelector('.ws-label');
            return {
                id,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                title: item.getAttribute('title') || '',
                ariaLabel: item.getAttribute('aria-label') || '',
                labelText: label ? label.textContent.trim() : '',
                labelClipped: !!(label && label.scrollWidth > (label.clientWidth + 1))
            };
        }).filter(Boolean);

        return {
            sidebarRight: sidebarRect ? sidebarRect.right : 0,
            rows
        };
    });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);

        await page.waitForSelector('#sidebar .ws-item[data-ws-id="main"] .ws-toggle', { timeout: 10000 });
        await page.waitForSelector('#sidebar .ws-item[data-ws-id="alpha"]', { timeout: 10000 });
        await page.waitForSelector('#sidebar .ws-item[data-ws-id="beta"]', { timeout: 10000 });
        await page.waitForSelector('#sidebar .ws-item[data-ws-id="gamma"]', { timeout: 10000 });
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar || !sidebar.classList.contains('is-expanded')) return false;
            return sidebar.getBoundingClientRect().width >= 230;
        }, undefined, { timeout: 10000 });
        await page.evaluate(() => {
            window.__alphaSidebarNode = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
            window.__betaSidebarNode = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
            window.__gammaSidebarNode = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
        });

        const indentState = await readSidebarIndentState(page);
        const mainRow = indentState.rows.find((row) => row.id === 'main');
        const alphaRow = indentState.rows.find((row) => row.id === 'alpha');
        const betaRow = indentState.rows.find((row) => row.id === 'beta');
        const gammaRow = indentState.rows.find((row) => row.id === 'gamma');
        if (!mainRow || !alphaRow || !betaRow || !gammaRow) {
            throw new Error(`Missing nested sidebar rows: ${JSON.stringify(indentState)}`);
        }
        if (indentState.rows.some((row) => row.title)) {
            throw new Error(`Expected workspace rows to avoid native title tooltips, got ${JSON.stringify(indentState.rows)}`);
        }
        if (indentState.rows.some((row) => !row.ariaLabel)) {
            throw new Error(`Expected workspace rows to expose aria labels after removing title tooltips, got ${JSON.stringify(indentState.rows)}`);
        }
        if (indentState.rows.some((row) => row.labelClipped)) {
            throw new Error(`Expected expanded sidebar rows to show these workspace labels without clipping, got ${JSON.stringify(indentState.rows)}`);
        }
        if ((alphaRow.left - mainRow.left) > 10 || (betaRow.left - alphaRow.left) > 10 || (gammaRow.left - betaRow.left) > 10) {
            throw new Error(`Expected nested row indentation to stay compact, got ${JSON.stringify(indentState.rows)}`);
        }
        if (gammaRow.right > (indentState.sidebarRight - 2)) {
            throw new Error(`Expected deepest nested row to stay within sidebar bounds, got ${JSON.stringify(indentState)}`);
        }

        await hoverWorkspaceRow(page, 'gamma');
        await page.waitForFunction(() => {
            const popout = document.getElementById('ws-popout');
            return !!popout
                && popout.classList.contains('active')
                && popout.style.display === 'flex'
                && /Gamma Branch Leaf/.test(popout.textContent || '');
        }, undefined, { timeout: 10000 });

        await resetSidebarRenderCounter(page);
        await clickWorkspaceToggleLane(page, 'main');
        await page.waitForFunction(() => {
            const alphaItem = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
            const betaItem = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
            const gammaItem = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
            return !!alphaItem
                && !alphaItem.offsetParent
                && !!betaItem
                && !betaItem.offsetParent
                && !!gammaItem
                && !gammaItem.offsetParent
                && String(config.activeWorkspace || '') === 'alt'
                && Array.isArray(config.collapsedTabs)
                && config.collapsedTabs.includes('main');
        }, undefined, { timeout: 10000 });

        const collapseRenderCount = await getSidebarRenderCounter(page);
        if (collapseRenderCount !== 0) {
            throw new Error(`Expected collapsing a tab chain to avoid full sidebar rerender, got ${collapseRenderCount}`);
        }

        await resetSidebarRenderCounter(page);
        await clickWorkspaceToggleLane(page, 'main');
        await page.waitForFunction(() => {
            const alphaItem = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
            const betaItem = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
            const gammaItem = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
            return !!alphaItem
                && !!alphaItem.offsetParent
                && !!betaItem
                && !!betaItem.offsetParent
                && !!gammaItem
                && !!gammaItem.offsetParent
                && alphaItem === window.__alphaSidebarNode
                && betaItem === window.__betaSidebarNode
                && gammaItem === window.__gammaSidebarNode
                && String(config.activeWorkspace || '') === 'alt'
                && Array.isArray(config.collapsedTabs)
                && !config.collapsedTabs.includes('main');
        }, undefined, { timeout: 10000 });

        const expandRenderCount = await getSidebarRenderCounter(page);
        if (expandRenderCount !== 0) {
            throw new Error(`Expected expanding a tab chain to avoid full sidebar rerender, got ${expandRenderCount}`);
        }

        await page.setViewportSize({ width: 1024, height: 900 });
        await page.waitForTimeout(100);

        await resetSidebarRenderCounter(page);
        await clickWorkspaceToggleLane(page, 'main');
        await page.waitForFunction(() => {
            const alphaItem = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
            const betaItem = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
            const gammaItem = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
            return !!alphaItem
                && !alphaItem.offsetParent
                && !!betaItem
                && !betaItem.offsetParent
                && !!gammaItem
                && !gammaItem.offsetParent
                && String(config.activeWorkspace || '') === 'alt'
                && Array.isArray(config.collapsedTabs)
                && config.collapsedTabs.includes('main');
        }, undefined, { timeout: 10000 });

        const narrowCollapseRenderCount = await getSidebarRenderCounter(page);
        if (narrowCollapseRenderCount !== 0) {
            throw new Error(`Expected narrow-width toggle lane collapse to avoid full sidebar rerender, got ${narrowCollapseRenderCount}`);
        }

        await resetSidebarRenderCounter(page);
        await clickWorkspaceToggleLane(page, 'main');
        await page.waitForFunction(() => {
            const alphaItem = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
            const betaItem = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
            const gammaItem = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
            return !!alphaItem
                && !!alphaItem.offsetParent
                && !!betaItem
                && !!betaItem.offsetParent
                && !!gammaItem
                && !!gammaItem.offsetParent
                && alphaItem === window.__alphaSidebarNode
                && betaItem === window.__betaSidebarNode
                && gammaItem === window.__gammaSidebarNode
                && String(config.activeWorkspace || '') === 'alt'
                && Array.isArray(config.collapsedTabs)
                && !config.collapsedTabs.includes('main');
        }, undefined, { timeout: 10000 });

        const narrowExpandRenderCount = await getSidebarRenderCounter(page);
        if (narrowExpandRenderCount !== 0) {
            throw new Error(`Expected narrow-width toggle lane expand to avoid full sidebar rerender, got ${narrowExpandRenderCount}`);
        }

        await clickWorkspaceContentLane(page, 'main');
        await page.waitForFunction(() => {
            return String(config.activeWorkspace || '') === 'main'
                && Array.isArray(config.collapsedTabs)
                && !config.collapsedTabs.includes('main');
        }, undefined, { timeout: 10000 });

        console.log('SIDEBAR_COLLAPSE_TOGGLE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
