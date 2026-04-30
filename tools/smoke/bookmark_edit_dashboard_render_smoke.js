const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.openEdit === 'function'
        && typeof window.saveLink === 'function'
        && typeof window.saveData === 'function'
        && !!window.EveLinkForm?.ready
        && !!window.eveState
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.waitForTimeout(500);

        const result = await page.evaluate(async () => {
            const testConfig = Object.assign({}, window.eveState.config || {}, {
                activeWorkspace: 'main',
                viewMode: 'grid',
                showInactiveTabs: true,
                workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                categoryOrder: ['Alpha', 'Beta'],
                categoryOrderByWorkspace: { main: ['Alpha', 'Beta'] },
                hideStats: [],
                collapsedTabs: [],
                sidebarGroups: [],
                sidebarManualOrder: { root: [], parents: {} }
            });
            const testLinks = [
                {
                    id: 'edit-me',
                    title: 'Old Title',
                    url: 'https://old.example/one',
                    category: 'Alpha',
                    workspace: 'main',
                    done: false,
                    priority: '',
                    sources: []
                },
                {
                    id: 'stay',
                    title: 'Stay Here',
                    url: 'https://example.com/stay',
                    category: 'Beta',
                    workspace: 'main',
                    done: false,
                    priority: '',
                    sources: []
                }
            ];

            window.config = config = testConfig;
            window.links = links = testLinks;
            window.bookmarkFolders = bookmarkFolders = {};
            window.eveState.config = testConfig;
            window.eveState.links = testLinks;
            window.eveState.bookmarkFolders = {};
            window.currentCategoryCtx = 'Alpha';
            window.focusCategory = 'Alpha';

            window.renderDashboard();
            await new Promise(resolve => setTimeout(resolve, 250));

            window.openEdit('edit-me');
            await new Promise(resolve => setTimeout(resolve, 0));
            const editId = document.getElementById('editId')?.value || '';
            if (editId !== 'edit-me') {
                throw new Error(`Expected edit modal for edit-me, saw ${editId || '(empty)'}`);
            }

            document.getElementById('newTitle').value = 'New Title';
            document.getElementById('newUrl').value = 'https://new.example/two';
            window.saveLink();
            await new Promise(resolve => setTimeout(resolve, 1200));

            const grid = document.getElementById('dashboard-grid');
            const editedLink = window.links.find(item => String(item.id) === 'edit-me') || null;
            return {
                gridChildren: grid ? grid.children.length : -1,
                gridText: grid ? grid.textContent : '',
                modalDisplay: document.getElementById('addModal')?.style.display || '',
                renderPending: !!window.__eveDashboardRenderPending,
                editedLink: editedLink ? JSON.parse(JSON.stringify(editedLink)) : null
            };
        });

        if (pageErrors.length) {
            throw new Error(`Page errors after bookmark edit: ${pageErrors.join(' | ')}`);
        }
        if (result.gridChildren < 2) {
            throw new Error(`Expected dashboard cards to render after edit, saw ${result.gridChildren}`);
        }
        if (!result.gridText.includes('New Title') || !result.gridText.includes('Stay Here')) {
            throw new Error(`Expected edited and sibling cards to render, saw ${JSON.stringify(result)}`);
        }
        if (!result.editedLink || result.editedLink.title !== 'New Title') {
            throw new Error(`Expected edited link title to persist, saw ${JSON.stringify(result.editedLink)}`);
        }
        if (result.editedLink.url !== 'https://new.example/two') {
            throw new Error(`Expected edited link URL to persist, saw ${JSON.stringify(result.editedLink)}`);
        }
        if (result.modalDisplay !== 'none') {
            throw new Error(`Expected bookmark edit modal to close after save, saw ${result.modalDisplay}`);
        }
        if (result.renderPending) {
            throw new Error('Expected dashboard render queue to settle after bookmark edit');
        }

        console.log('BOOKMARK_EDIT_DASHBOARD_RENDER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
