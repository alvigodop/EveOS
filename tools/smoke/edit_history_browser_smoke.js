const path = require('path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..');
const fileUrl = 'file:///' + path.join(repoRoot, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error?.message || String(error));
    });

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => (
            !!window.EveEditHistory?.recordDataMutation
            && !!window.EveEditHistory?.restoreEntry
            && !!window.EveEditHistory?.renderPanel
            && typeof window.buildCoreDataDelta === 'function'
            && !!window.EveSettingsTemplates?.backupPanel
        ), undefined, { timeout: 180000 });

        const result = await page.evaluate(async () => {
            const before = {
                links: [
                    {
                        id: 'b_smoke',
                        title: 'Smoke Bookmark',
                        url: 'https://example.test/old',
                        workspace: 'main',
                        category: 'Reading',
                        folderId: 'f_queue'
                    }
                ],
                bookmarkFolders: {
                    'main::Reading': {
                        nodes: [{ id: 'f_queue', name: 'Queue', parentId: '' }]
                    }
                },
                quickPins: [{ targetType: 'bookmark', targetId: 'b_smoke', scope: 'main' }],
                constellationDetachedChains: {}
            };
            const after = JSON.parse(JSON.stringify(before));
            after.links[0].url = 'https://example.test/new';

            window.config = {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }]
            };
            window.links = JSON.parse(JSON.stringify(after.links));
            window.bookmarkFolders = JSON.parse(JSON.stringify(after.bookmarkFolders));
            window.quickPins = JSON.parse(JSON.stringify(after.quickPins));
            try { links = window.links; } catch {}
            try { bookmarkFolders = window.bookmarkFolders; } catch {}
            try { quickPins = window.quickPins; } catch {}
            if (window.eveState) {
                window.eveState.config = window.config;
                window.eveState.links = window.links;
                window.eveState.bookmarkFolders = window.bookmarkFolders;
                window.eveState.quickPins = window.quickPins;
            }
            window.saveData = async (options) => {
                window.__editHistoryLastSaveDataOptions = options;
                return true;
            };
            window.renderSidebar = () => {};
            window.renderDashboard = () => {};
            window.showToast = () => {};

            let target = document.getElementById('editHistoryResults');
            if (!target) {
                target = document.createElement('div');
                target.id = 'editHistoryResults';
                document.body.appendChild(target);
            }
            let filter = document.getElementById('editHistoryLayerFilter');
            if (!filter) {
                filter = document.createElement('select');
                filter.id = 'editHistoryLayerFilter';
                document.body.appendChild(filter);
            }
            filter.value = 'bookmark';

            const api = window.EveEditHistory;
            api.clearHistory();
            api.recordDataMutation({
                before,
                after,
                delta: window.buildCoreDataDelta(before, after),
                source: 'browser-smoke'
            });
            api.renderPanel();
            const html = target.innerHTML;
            const entry = api.getEntries({ layer: 'bookmark' }).find((item) => item.scope.key === 'b_smoke');
            const restoreResult = await api.restoreEntry(entry);
            return {
                hasTemplateUi: window.EveSettingsTemplates.backupPanel.includes('Local Edit History')
                    && window.EveSettingsTemplates.backupPanel.includes('editHistoryLayerFilter'),
                hasRestoreButton: html.includes('Restore This Layer'),
                entryCount: api.getEntries({ layer: 'bookmark' }).length,
                restoreOk: !!restoreResult?.ok,
                restoredUrl: window.eveState?.links?.find((link) => link.id === 'b_smoke')?.url || window.links.find((link) => link.id === 'b_smoke')?.url,
                skippedRecursiveHistory: !!window.__editHistoryLastSaveDataOptions?.meta?.skipEditHistory
            };
        });

        if (pageErrors.length) {
            throw new Error(`Page errors during edit history smoke: ${pageErrors.join(' | ')}`);
        }
        if (!result.hasTemplateUi || !result.hasRestoreButton || result.entryCount < 1) {
            throw new Error(`Edit history UI did not render correctly: ${JSON.stringify(result)}`);
        }
        if (!result.restoreOk || result.restoredUrl !== 'https://example.test/old' || !result.skippedRecursiveHistory) {
            throw new Error(`Edit history restore failed: ${JSON.stringify(result)}`);
        }

        console.log('EDIT_HISTORY_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
