const path = require('path');
const { launchChromiumOrConnect } = require('../smoke/playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');
const OUTPUT_PATH = path.join(REPO_ROOT, 'docs', 'screenshots', 'eveos-dashboard.png');

function buildSeed() {
    const links = [
        ['today-1', 'Daily Launchpad', 'Today', false],
        ['today-2', 'Project Compass', 'Today', false],
        ['today-3', 'Weekly Review', 'Today', false],
        ['today-4', 'Useful References', 'Today', true],
        ['garden-1', 'Local-First Software', 'Knowledge Garden', false],
        ['garden-2', 'Interface Research', 'Knowledge Garden', false],
        ['garden-3', 'Reading Notes', 'Knowledge Garden', false],
        ['garden-4', 'Design Systems', 'Knowledge Garden', true]
    ].map(([id, title, category, done]) => ({
        id,
        title,
        category,
        done,
        workspace: 'home',
        url: `https://example.invalid/${id}`
    }));

    return {
        links,
        config: {
            activeWorkspace: 'home',
            accent: '#00d4ff',
            background: '',
            viewMode: 'grid',
            headerMode: 'greeting',
            headerControls: {
                showDate: true,
                use24HourClock: false,
                includeName: false,
                morningMessage: 'Good Morning',
                afternoonMessage: 'Good Afternoon',
                eveningMessage: 'Good Evening',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontSize: 56,
                letterSpacing: 2,
                textColor: '',
                effect: 'none',
                effectColor: '#00d4ff'
            },
            sidebarExpanded: true,
            sidebarHidden: false,
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            sidebarManualOrder: { root: [], parents: {} },
            showInactiveTabs: false,
            workspaces: [
                { id: 'home', name: 'Home Base', icon: '\u{1F3E0}', subTabs: [] },
                { id: 'reading', name: 'Reading Room', icon: '\u{1F4DA}', subTabs: [] },
                { id: 'projects', name: 'Projects', icon: '\u{1F9ED}', subTabs: [] }
            ],
            categoryOrder: ['Today', 'Knowledge Garden'],
            categoryOrderByWorkspace: { home: ['Today', 'Knowledge Garden'] },
            collapsed: [],
            collapsedTabs: [],
            foldersCollapsed: [],
            linksCollapsed: [],
            hideStats: [],
            scrollableCategories: false,
            modularStateSyncEnabled: false,
            geminiLiveLinkEnabled: false
        },
        bookmarkFolders: {},
        quickPins: []
    };
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1800, height: 1050 },
        deviceScaleFactor: 1,
        colorScheme: 'dark'
    });
    const seed = buildSeed();

    await context.addInitScript((payload) => {
        localStorage.clear();
        localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
        localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
        localStorage.setItem('eveV22QuickPins', JSON.stringify(payload.quickPins));
        localStorage.setItem('eveTheme', 'dark');
    }, seed);

    const page = await context.newPage();
    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => (
            window.__eveCoreDataLoaded === true
            && document.querySelectorAll('.category-card').length === 2
            && document.querySelectorAll('.category-card [data-link-id]').length === 8
            && document.querySelector('.topbar-notes-world-book-btn')?.textContent.includes('Notes & World Books')
        ), undefined, { timeout: 120000 });

        await page.evaluate(() => {
            const display = document.getElementById('main-display');
            const date = document.getElementById('date-area');
            if (display) display.textContent = 'Good Evening';
            if (date) date.textContent = 'A local-first workspace you control';
            document.querySelectorAll('a[href*="example.invalid"]').forEach((anchor) => {
                anchor.removeAttribute('target');
            });
        });

        await page.screenshot({ path: OUTPUT_PATH, fullPage: false });
        console.log(`Captured ${OUTPUT_PATH}`);
    } finally {
        await context.close();
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
