const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveSidebarGroups
        && !!document.getElementById('sidebar')
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            sidebarExpanded: false,
            ultraCollapseSidebar: false,
            sidebarHidden: false,
            workspaces: [
                { id: 'main', name: 'Main', icon: 'home', subTabs: [] },
                { id: 'hiddenws', name: 'Hidden WS', icon: 'moon', subTabs: [], groupId: 'hidden-group' }
            ],
            categoryOrder: ['Alpha'],
            sidebarGroups: [
                { id: 'hidden-group', name: 'Hidden Group', color: '#7c4dff', hidden: true, collapsed: true, parentWorkspaceId: '' }
            ],
            sidebarOrderMode: 'auto',
            sidebarManualOrder: { root: [], parents: {} },
            sidebarFocusedGroupId: '',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [
            { id: 'main-link', title: 'Main Link', url: 'https://example.com/main', workspace: 'main', category: 'Alpha', done: false },
            { id: 'hidden-link', title: 'Hidden Link', url: 'https://example.com/hidden', workspace: 'hiddenws', category: 'Alpha', done: false }
        ];
        bookmarkFolders = window.bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        window.renderSidebar();
    });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);

        const initialState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false,
            hiddenGroupRendered: Array.from(document.querySelectorAll('#sidebar .ws-group-title')).some((el) => el.textContent.trim() === 'Hidden Group')
        }));

        if (initialState.expanded || initialState.hasExpandedClass || initialState.hiddenGroupRendered) {
            throw new Error(`Expected collapsed sidebar with hidden group concealed initially: ${JSON.stringify(initialState)}`);
        }

        await page.locator('#sidebar').click({ position: { x: 6, y: 6 } });
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            return !!window.config?.sidebarExpanded && !!sidebar?.classList.contains('is-expanded');
        }, undefined, { timeout: 10000 });

        const expandedState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false
        }));

        if (!expandedState.expanded || !expandedState.hasExpandedClass) {
            throw new Error(`Expected click on sidebar shell to expand it: ${JSON.stringify(expandedState)}`);
        }

        await page.locator('#sidebar').click({ position: { x: 6, y: 6 } });
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            return !window.config?.sidebarExpanded && !sidebar?.classList.contains('is-expanded');
        }, undefined, { timeout: 10000 });

        const collapsedState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false
        }));

        if (collapsedState.expanded || collapsedState.hasExpandedClass) {
            throw new Error(`Expected second shell click to collapse sidebar: ${JSON.stringify(collapsedState)}`);
        }

        await page.hover('#sidebar .ws-hover-reveal');
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            const activePreview = sidebar?.classList.contains('ws-hover-reveal-active');
            const hiddenGroupVisible = Array.from(document.querySelectorAll('#sidebar .ws-group-title')).some((el) => el.textContent.trim() === 'Hidden Group');
            return !!activePreview && hiddenGroupVisible;
        }, undefined, { timeout: 10000 });

        const hoverRevealState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false,
            hoverRevealActive: document.getElementById('sidebar')?.classList.contains('ws-hover-reveal-active') || false,
            hiddenGroupRendered: Array.from(document.querySelectorAll('#sidebar .ws-group-title')).some((el) => el.textContent.trim() === 'Hidden Group')
        }));

        if (hoverRevealState.expanded || hoverRevealState.hasExpandedClass) {
            throw new Error(`Expected eye-button hover reveal to keep sidebar collapsed: ${JSON.stringify(hoverRevealState)}`);
        }
        if (!hoverRevealState.hoverRevealActive || !hoverRevealState.hiddenGroupRendered) {
            throw new Error(`Expected eye-button hover to reveal hidden group content: ${JSON.stringify(hoverRevealState)}`);
        }

        await page.mouse.move(350, 120);
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            const hoverActive = sidebar?.classList.contains('ws-hover-reveal-active');
            const hiddenGroupVisible = Array.from(document.querySelectorAll('#sidebar .ws-group-title')).some((el) => el.textContent.trim() === 'Hidden Group');
            return !hoverActive && !hiddenGroupVisible;
        }, undefined, { timeout: 10000 });

        console.log('SIDEBAR_CLICK_EXPAND_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
