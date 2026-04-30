const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

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
                {
                    id: 'main',
                    name: 'Main',
                    icon: 'home',
                    subTabs: [
                        { id: 'alpha', name: 'Alpha Chain', icon: 'folder', subTabs: [] }
                    ]
                },
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
            collapsedTabs: ['main']
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

        window.__sidebarHoverRevealRenderCount = 0;
        const originalRenderSidebar = window.renderSidebar;
        window.renderSidebar = function wrappedRenderSidebar(...args) {
            window.__sidebarHoverRevealRenderCount += 1;
            return originalRenderSidebar.apply(this, args);
        };

        window.renderSidebar();
        window.__sidebarHoverRevealRenderCount = 0;
    });
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
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

        const hoverPreviewReExpandedState = await page.evaluate(() => {
            window.toggleSidebarExpanded(true);
            if (window.config) window.config.sidebarExpanded = true;
            if (typeof config !== 'undefined' && config) config.sidebarExpanded = true;
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('is-expanded');
            return {
                expanded: !!window.config?.sidebarExpanded,
                hasExpandedClass: !!sidebar?.classList.contains('is-expanded')
            };
        });
        if (!hoverPreviewReExpandedState.hasExpandedClass) {
            throw new Error(`Expected deterministic sidebar re-expand before hover preview check: ${JSON.stringify(hoverPreviewReExpandedState)}`);
        }

        const expandedState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false
        }));

        if (!expandedState.expanded || !expandedState.hasExpandedClass) {
            throw new Error(`Expected click on sidebar shell to expand it: ${JSON.stringify(expandedState)}`);
        }

        await page.click('#sidebar .ws-item[data-ws-id="main"] .ws-toggle');
        await page.waitForFunction(() => {
            const alphaItem = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
            return !!alphaItem
                && !!alphaItem.offsetParent
                && Array.isArray(config.collapsedTabs)
                && !config.collapsedTabs.includes('main');
        }, undefined, { timeout: 10000 });

        const preHoverPreviewState = await page.evaluate(() => ({
            previewReady: !!window.EveSidebarRuntime?.previewState?.revealPreviewReady,
            previewChildCount: document.querySelector('#sidebar .ws-sidebar-content--hover-preview')?.childElementCount || 0
        }));
        if (preHoverPreviewState.previewReady || preHoverPreviewState.previewChildCount !== 0) {
            throw new Error(`Expected branch expand to avoid prebuilding hidden preview host, got ${JSON.stringify(preHoverPreviewState)}`);
        }

        await page.locator('#sidebar').dblclick({ position: { x: 6, y: 6 } });
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            return !window.config?.sidebarExpanded && !sidebar?.classList.contains('is-expanded');
        }, undefined, { timeout: 10000 });

        const collapsedState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false
        }));

        if (collapsedState.expanded || collapsedState.hasExpandedClass) {
            throw new Error(`Expected second shell double-click to collapse sidebar: ${JSON.stringify(collapsedState)}`);
        }

        await page.waitForTimeout(600);
        await page.evaluate(() => {
            window.__sidebarHoverRevealRenderCount = 0;
        });
        await page.hover('#sidebar .ws-hover-reveal');
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            const activePreview = sidebar?.classList.contains('ws-hover-reveal-active');
            const visibleHost = document.querySelector('#sidebar .ws-sidebar-content:not([hidden])');
            const hiddenGroupVisible = Array.from(visibleHost?.querySelectorAll('.ws-group-title') || []).some((el) => el.textContent.trim() === 'Hidden Group');
            return !!activePreview && hiddenGroupVisible;
        }, undefined, { timeout: 10000 });

        const hoverRevealState = await page.evaluate(() => ({
            expanded: !!window.config?.sidebarExpanded,
            hasExpandedClass: document.getElementById('sidebar')?.classList.contains('is-expanded') || false,
            hoverRevealActive: document.getElementById('sidebar')?.classList.contains('ws-hover-reveal-active') || false,
            hiddenGroupRendered: Array.from((document.querySelector('#sidebar .ws-sidebar-content:not([hidden])')?.querySelectorAll('.ws-group-title')) || []).some((el) => el.textContent.trim() === 'Hidden Group'),
            renderedHostCount: Array.from(document.querySelectorAll('#sidebar .ws-sidebar-content')).filter((el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            }).length
        }));

        if (hoverRevealState.expanded || hoverRevealState.hasExpandedClass) {
            throw new Error(`Expected eye-button hover reveal to keep sidebar collapsed: ${JSON.stringify(hoverRevealState)}`);
        }
        if (!hoverRevealState.hoverRevealActive || !hoverRevealState.hiddenGroupRendered) {
            throw new Error(`Expected eye-button hover to reveal hidden group content: ${JSON.stringify(hoverRevealState)}`);
        }
        if (hoverRevealState.renderedHostCount !== 1) {
            throw new Error(`Expected exactly one rendered sidebar content host during hover reveal: ${JSON.stringify(hoverRevealState)}`);
        }

        const hoverRevealRenderCount = await page.evaluate(() => Number(window.__sidebarHoverRevealRenderCount || 0));
        if (hoverRevealRenderCount !== 0) {
            throw new Error(`Expected eye-button hover reveal to avoid full sidebar rerender, got ${hoverRevealRenderCount}`);
        }

        await page.mouse.move(350, 120);
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('sidebar');
            const hoverActive = sidebar?.classList.contains('ws-hover-reveal-active');
            const visibleHost = document.querySelector('#sidebar .ws-sidebar-content:not([hidden])');
            const hiddenGroupVisible = Array.from(visibleHost?.querySelectorAll('.ws-group-title') || []).some((el) => el.textContent.trim() === 'Hidden Group');
            return !hoverActive && !hiddenGroupVisible;
        }, undefined, { timeout: 10000 });

        const hoverRevealExitState = await page.evaluate(() => ({
            renderCount: Number(window.__sidebarHoverRevealRenderCount || 0),
            renderedHostCount: Array.from(document.querySelectorAll('#sidebar .ws-sidebar-content')).filter((el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            }).length
        }));
        const hoverRevealExitRenderCount = hoverRevealExitState.renderCount;
        if (hoverRevealExitRenderCount !== 0) {
            throw new Error(`Expected eye-button hover exit to avoid full sidebar rerender, got ${hoverRevealExitRenderCount}`);
        }
        if (hoverRevealExitState.renderedHostCount !== 1) {
            throw new Error(`Expected exactly one rendered sidebar content host after hover reveal exit: ${JSON.stringify(hoverRevealExitState)}`);
        }

        const reExpandedState = await page.evaluate(() => {
            window.toggleSidebarExpanded(true);
            if (window.config) window.config.sidebarExpanded = true;
            if (typeof config !== 'undefined' && config) config.sidebarExpanded = true;
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('is-expanded');
            return {
                expanded: !!window.config?.sidebarExpanded,
                hasExpandedClass: !!sidebar?.classList.contains('is-expanded')
            };
        });
        if (!reExpandedState.hasExpandedClass) {
            throw new Error(`Expected deterministic sidebar re-expand before hover preview check: ${JSON.stringify(reExpandedState)}`);
        }

        await page.hover('#sidebar .ws-hover-reveal');
        await page.waitForTimeout(250);

        const expandedHoverRevealState = await page.evaluate(() => ({
            hoverRevealActive: document.getElementById('sidebar')?.classList.contains('ws-hover-reveal-active') || false,
            hiddenGroupRendered: Array.from((document.querySelector('#sidebar .ws-sidebar-content:not([hidden])')?.querySelectorAll('.ws-group-title')) || []).some((el) => el.textContent.trim() === 'Hidden Group'),
            alphaVisible: !!document.querySelector('#sidebar .ws-sidebar-content:not([hidden]) .ws-item[data-ws-id="alpha"]'),
            renderedHostCount: Array.from(document.querySelectorAll('#sidebar .ws-sidebar-content')).filter((el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            }).length,
            collapsedTabs: Array.isArray(config.collapsedTabs) ? config.collapsedTabs.slice() : []
        }));

        if (!expandedHoverRevealState.hoverRevealActive || !expandedHoverRevealState.hiddenGroupRendered || !expandedHoverRevealState.alphaVisible) {
            throw new Error(`Expected hover reveal to preserve expanded chain state without reload: ${JSON.stringify(expandedHoverRevealState)}`);
        }
        if (expandedHoverRevealState.renderedHostCount !== 1) {
            throw new Error(`Expected exactly one rendered sidebar content host during expanded hover reveal: ${JSON.stringify(expandedHoverRevealState)}`);
        }
        if (expandedHoverRevealState.collapsedTabs.includes('main')) {
            throw new Error(`Expected expanded chain state to stay expanded in config during hover reveal: ${JSON.stringify(expandedHoverRevealState)}`);
        }

        console.log('SIDEBAR_CLICK_EXPAND_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
