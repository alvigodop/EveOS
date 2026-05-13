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
            !!window.EveDataTransfer?.runBackupMismatchReportBrowserOnly
            && !!window.EveDataTransfer?.buildBackupMismatchReportFromFolder
            && !!window.EveOS?.NebulaJsonLink
            && !!window.EveSettingsTemplates?.backupPanel
        ), undefined, { timeout: 180000 });

        const result = await page.evaluate(async () => {
            const seededConfig = {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }],
                categoryOrderByWorkspace: { main: ['Reading', 'Other'] },
                categoryOrder: ['Reading', 'Other'],
                sidebarGroups: []
            };
            const seededLinks = [
                { id: 'b_ok', title: 'Live OK', url: 'https://example.test/ok', workspace: 'main', category: 'Reading' },
                { id: 'b_moved', title: 'Moved Live', url: 'https://example.test/moved', workspace: 'main', category: 'Other' }
            ];
            const seededFolders = {
                'main::Reading': {
                    nodes: [{ id: 'f_1', name: 'Folder One', parentId: '' }]
                }
            };

            window.config = seededConfig;
            window.links = seededLinks;
            window.bookmarkFolders = seededFolders;
            try { config = seededConfig; } catch {}
            try { links = seededLinks; } catch {}
            try { bookmarkFolders = seededFolders; } catch {}
            if (window.eveState) {
                window.eveState.config = seededConfig;
                window.eveState.links = seededLinks;
                window.eveState.bookmarkFolders = seededFolders;
            }

            class SmokeFileHandle {
                constructor(name, payload) {
                    this.kind = 'file';
                    this.name = name;
                    this.payload = payload;
                }
                async getFile() {
                    const text = JSON.stringify(this.payload, null, 2);
                    return { async text() { return text; } };
                }
            }

            class SmokeDirectoryHandle {
                constructor(name) {
                    this.kind = 'directory';
                    this.name = name;
                    this.children = new Map();
                }
                addDirectory(name) {
                    const handle = new SmokeDirectoryHandle(name);
                    this.children.set(name, handle);
                    return handle;
                }
                addJsonFile(name, payload) {
                    this.children.set(name, new SmokeFileHandle(name, payload));
                    return this;
                }
                async getDirectoryHandle(name) {
                    const handle = this.children.get(name);
                    if (!handle || handle.kind !== 'directory') throw new Error(`Missing dir ${name}`);
                    return handle;
                }
                async getFileHandle(name) {
                    const handle = this.children.get(name);
                    if (!handle || handle.kind !== 'file') throw new Error(`Missing file ${name}`);
                    return handle;
                }
                async *entries() {
                    for (const [name, handle] of this.children.entries()) yield [name, handle];
                }
            }

            const root = new SmokeDirectoryHandle('backup');
            root.addJsonFile('manifest.json', {
                schema: 'eveos.client-folder-backup.v1',
                dataPack: { tabs: 1, cards: 1, bookmarks: 50 }
            });
            const tabs = root.addDirectory('tabs');
            const tab = tabs.addDirectory('main');
            tab.addJsonFile('tab.json', {
                schema: 'eveos.tab.v1',
                entityLink: 'eve://workspace/main',
                entityId: 'main',
                id: 'main',
                name: 'Main'
            });
            const cards = tab.addDirectory('cards');
            const card = cards.addDirectory('reading');
            card.addJsonFile('card.json', {
                schema: 'eveos.card.v2',
                entityLink: 'eve://workspace/main/card/Reading',
                entityId: 'Reading',
                workspaceId: 'main',
                categoryName: 'Reading'
            });
            const entries = card.addDirectory('entries');
            entries.addJsonFile('recoverable.json', {
                schema: 'eveos.bookmark.v1',
                entityLink: 'eve://workspace/main/card/Reading/bookmark/deleted_id',
                entityId: 'b_moved',
                bookmark: { id: 'b_moved', title: 'Moved Live', workspace: 'main', category: 'Other' }
            });
            const folders = card.addDirectory('folders');
            const folder = folders.addDirectory('folder-one');
            folder.addJsonFile('folder.json', {
                schema: 'eveos.bookmark-folder.v1',
                entityLink: 'eve://workspace/main/card/Reading/folder/f_1',
                entityId: 'f_1',
                id: 'f_1',
                workspaceId: 'main',
                categoryName: 'Reading',
                parentId: 'missing_parent',
                name: 'Folder One'
            });

            let target = document.getElementById('backupMismatchReportResults');
            if (!target) {
                target = document.createElement('div');
                target.id = 'backupMismatchReportResults';
                document.body.appendChild(target);
            }
            window.showDirectoryPicker = async () => root;
            const report = await window.EveDataTransfer.runBackupMismatchReportBrowserOnly();
            return {
                hasTemplateUi: window.EveSettingsTemplates.backupPanel.includes('Backup Mismatch Report')
                    && window.EveSettingsTemplates.backupPanel.includes('runBackupMismatchReportBrowserOnly'),
                counts: report?.counts || null,
                html: target.innerHTML,
                lastReportSaved: !!window.EveDataTransfer.lastBackupMismatchReport
            };
        });

        if (pageErrors.length) {
            throw new Error(`Page errors during backup mismatch report smoke: ${pageErrors.join(' | ')}`);
        }
        if (!result.hasTemplateUi) {
            throw new Error('Settings backup template does not expose the backup mismatch report UI.');
        }
        if (!result.lastReportSaved || !result.counts || result.counts.broken < 1 || result.counts.warning < 1) {
            throw new Error(`Expected mismatch report to render broken and warning rows: ${JSON.stringify(result)}`);
        }
        if (!result.html.includes('backup_folder_parent_missing') || !result.html.includes('stale_link_recoverable_by_metadata')) {
            throw new Error(`Rendered report missing expected issue labels: ${result.html.slice(0, 500)}`);
        }

        console.log('BACKUP_MISMATCH_REPORT_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
