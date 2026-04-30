const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveSidebarGroups
        && !!window.EveSidebarRuntime?.activateHoverRevealPreview
        && !!window.EveTabNavRuntime?.ensurePopover
        && !!document.getElementById('sidebar-toggle-btn')
        && !!document.getElementById('sidebar')
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            sidebarExpanded: true,
            ultraCollapseSidebar: false,
            sidebarHidden: false,
            workspaces: [
                { id: 'main', name: 'Main', icon: 'home', subTabs: [] },
                { id: 'inactive-tab', name: 'Inactive Tab', icon: 'moon', inactive: true, subTabs: [] },
                { id: 'hidden-group-tab', name: 'Hidden Group Tab', icon: 'folder', groupId: 'hidden-group', subTabs: [] }
            ],
            categoryOrder: ['Alpha'],
            sidebarGroups: [
                { id: 'hidden-group', name: 'Hidden Group', color: '#7c4dff', hidden: true, collapsed: false, parentWorkspaceId: '' }
            ],
            sidebarOrderMode: 'auto',
            sidebarManualOrder: { root: [], parents: {} },
            sidebarFocusedGroupId: '',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [
            { id: 'main-link', title: 'Main Link', url: 'https://example.test/main', workspace: 'main', category: 'Alpha', done: false },
            { id: 'inactive-link', title: 'Inactive Link', url: 'https://example.test/inactive', workspace: 'inactive-tab', category: 'Alpha', done: false },
            { id: 'hidden-group-link', title: 'Hidden Group Link', url: 'https://example.test/group', workspace: 'hidden-group-tab', category: 'Alpha', done: false }
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

async function showPopover(page) {
    await page.hover('#sidebar-toggle-btn');
    await page.waitForSelector('.tab-nav-popover.is-visible', { timeout: 10000 });
}

async function visibleSidebarText(page) {
    return page.evaluate(() => {
        const host = document.querySelector('#sidebar .ws-sidebar-content:not([hidden])');
        return host ? host.textContent : '';
    });
}

async function hoverPreviewAction(page, action) {
    await showPopover(page);
    await page.hover(`[data-tab-nav-action="${action}"]`);
    await page.waitForFunction((targetAction) => {
        const runtime = window.EveSidebarRuntime;
        const state = runtime?.previewState || {};
        const visibleHost = document.querySelector('#sidebar .ws-sidebar-content--hover-preview:not([hidden])');
        const button = document.querySelector(`[data-tab-nav-action="${targetAction}"]`);
        return !!state.hoverRevealActive && !!visibleHost && !!button?.classList.contains('is-hover-previewing');
    }, action, { timeout: 10000 });
}

async function moveIntoSidebarAndAssertHeld(page) {
    const box = await page.locator('#sidebar').boundingBox();
    if (!box) throw new Error('Missing sidebar bounding box');
    await page.mouse.move(box.x + Math.min(90, Math.max(24, box.width / 2)), box.y + 120);
    await page.waitForTimeout(850);
    const held = await page.evaluate(() => ({
        active: !!window.EveSidebarRuntime?.previewState?.hoverRevealActive,
        previewVisible: !!document.querySelector('#sidebar .ws-sidebar-content--hover-preview:not([hidden])')
    }));
    if (!held.active || !held.previewVisible) {
        throw new Error(`Expected hover preview to remain active while over sidebar: ${JSON.stringify(held)}`);
    }
}

async function leaveSidebarAndAssertClosed(page) {
    await page.mouse.move(900, 760);
    await page.waitForTimeout(850);
    const closed = await page.evaluate(() => ({
        active: !!window.EveSidebarRuntime?.previewState?.hoverRevealActive,
        previewVisible: !!document.querySelector('#sidebar .ws-sidebar-content--hover-preview:not([hidden])')
    }));
    if (closed.active || closed.previewVisible) {
        throw new Error(`Expected hover preview to close after leaving sidebar: ${JSON.stringify(closed)}`);
    }
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);

        const initialText = await visibleSidebarText(page);
        if (initialText.includes('Inactive Tab') || initialText.includes('Hidden Group')) {
            throw new Error(`Expected hidden content to be concealed initially: ${initialText}`);
        }

        await hoverPreviewAction(page, 'toggle-inactive');
        const inactivePreviewText = await visibleSidebarText(page);
        if (!inactivePreviewText.includes('Inactive Tab') || inactivePreviewText.includes('Hidden Group')) {
            throw new Error(`Expected inactive-tab preview only, got: ${inactivePreviewText}`);
        }
        await moveIntoSidebarAndAssertHeld(page);
        await leaveSidebarAndAssertClosed(page);

        await hoverPreviewAction(page, 'toggle-inactive');
        await page.evaluate(() => {
            document.querySelector('[data-tab-nav-action="toggle-inactive"]')?.click();
        });
        await page.waitForFunction(() => config?.showInactiveTabs === true, undefined, { timeout: 10000 });
        await hoverPreviewAction(page, 'toggle-inactive');
        await page.waitForFunction(() => (
            window.EveSidebarRuntime?.previewState?.hoverRevealPreviewOptions?.showInactiveTabs === false
        ), undefined, { timeout: 10000 });
        const inactiveHidePreviewText = await visibleSidebarText(page);
        if (inactiveHidePreviewText.includes('Inactive Tab')) {
            throw new Error(`Expected Hide Inactive hover to preview inactive tabs hidden, got: ${inactiveHidePreviewText}`);
        }
        await leaveSidebarAndAssertClosed(page);
        const inactivePersistedText = await visibleSidebarText(page);
        if (!inactivePersistedText.includes('Inactive Tab')) {
            throw new Error(`Expected inactive tabs to remain persisted after hover closes, got: ${inactivePersistedText}`);
        }

        await hoverPreviewAction(page, 'toggle-hidden-groups');
        const groupPreviewText = await visibleSidebarText(page);
        if (!groupPreviewText.includes('Hidden Group')) {
            throw new Error(`Expected hidden-group preview, got: ${groupPreviewText}`);
        }

        await page.evaluate(() => {
            document.querySelector('[data-tab-nav-action="toggle-hidden-groups"]')?.click();
        });
        await page.waitForFunction(() => config?.showHiddenSidebarGroups === true, undefined, { timeout: 10000 });
        await hoverPreviewAction(page, 'toggle-hidden-groups');
        await page.waitForFunction(() => (
            window.EveSidebarRuntime?.previewState?.hoverRevealPreviewOptions?.showHiddenGroups === false
        ), undefined, { timeout: 10000 });
        const groupHidePreviewText = await visibleSidebarText(page);
        if (groupHidePreviewText.includes('Hidden Group')) {
            throw new Error(`Expected Hide Hidden Groups hover to preview groups hidden, got: ${groupHidePreviewText}`);
        }
        await leaveSidebarAndAssertClosed(page);
        const groupPersistedText = await visibleSidebarText(page);
        if (!groupPersistedText.includes('Hidden Group')) {
            throw new Error(`Expected hidden groups to remain persisted after hover closes, got: ${groupPersistedText}`);
        }

        console.log('SIDEBAR_TAB_NAV_HOVER_PREVIEW_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
