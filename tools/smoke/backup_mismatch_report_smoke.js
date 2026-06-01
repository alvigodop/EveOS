const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

class FileHandle {
    constructor(name, payload) {
        this.kind = 'file';
        this.name = name;
        this.payload = payload;
    }

    async getFile() {
        const text = JSON.stringify(this.payload, null, 2);
        return {
            async text() {
                return text;
            }
        };
    }
}

class DirectoryHandle {
    constructor(name) {
        this.kind = 'directory';
        this.name = name;
        this.children = new Map();
    }

    addDirectory(name) {
        const handle = new DirectoryHandle(name);
        this.children.set(name, handle);
        return handle;
    }

    addJsonFile(name, payload) {
        this.children.set(name, new FileHandle(name, payload));
        return this;
    }

    async getDirectoryHandle(name) {
        const handle = this.children.get(name);
        if (!handle || handle.kind !== 'directory') throw new Error(`Missing directory ${name}`);
        return handle;
    }

    async getFileHandle(name) {
        const handle = this.children.get(name);
        if (!handle || handle.kind !== 'file') throw new Error(`Missing file ${name}`);
        return handle;
    }

    async *entries() {
        for (const [name, handle] of this.children.entries()) {
            yield [name, handle];
        }
    }
}

function createContext() {
    const target = { innerHTML: '' };
    const context = {
        console,
        Date,
        JSON,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        Blob: function Blob(parts) {
            this.parts = parts;
        },
        URL: {
            createObjectURL() { return 'blob:test'; },
            revokeObjectURL() {}
        },
        document: {
            createElement() {
                return { click() {} };
            },
            getElementById(id) {
                return id === 'backupMismatchReportResults' ? target : null;
            }
        },
        window: {
            EveOS: {},
            EveDataTransfer: {},
            eveState: {
                config: {
                    activeWorkspace: 'main',
                    workspaces: [
                        { id: 'main', name: 'Main', icon: 'folder', subTabs: [] }
                    ]
                },
                links: [
                    { id: 'b_ok', title: 'Live OK', url: 'https://example.test/ok', workspace: 'main', category: 'Reading' },
                    { id: 'b_moved', title: 'Moved Live', url: 'https://example.test/moved', workspace: 'main', category: 'Other' }
                ],
                bookmarkFolders: {
                    'main::Reading': {
                        nodes: [{ id: 'f_1', name: 'Folder One', parentId: '' }]
                    }
                }
            },
            links: [],
            showToast() {}
        }
    };
    context.window.window = context.window;
    context.window.document = context.document;
    context.window.URL = context.URL;
    context.window.Blob = context.Blob;
    context.globalThis = context;
    context.self = context.window;
    context.__target = target;
    return vm.createContext(context);
}

function buildBackupFolder() {
    const root = new DirectoryHandle('backup');
    root.addJsonFile('manifest.json', {
        schema: 'eveos.client-folder-backup.v1',
        dataPack: { tabs: 1, cards: 1, bookmarks: 99 }
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
    const reading = cards.addDirectory('reading');
    reading.addJsonFile('card.json', {
        schema: 'eveos.card.v2',
        entityLink: 'eve://workspace/main/card/Reading',
        entityId: 'Reading',
        workspaceId: 'main',
        categoryName: 'Reading'
    });
    const entries = reading.addDirectory('entries');
    entries.addJsonFile('ok.json', {
        schema: 'eveos.bookmark.v1',
        entityLink: 'eve://workspace/main/card/Reading/bookmark/b_ok',
        entityId: 'b_ok',
        bookmark: { id: 'b_ok', title: 'Live OK', workspace: 'main', category: 'Reading' }
    });
    entries.addJsonFile('duplicate-ok.json', {
        schema: 'eveos.bookmark.v1',
        entityLink: 'eve://workspace/main/card/Reading/bookmark/b_ok',
        entityId: 'b_ok',
        bookmark: { id: 'b_ok', title: 'Duplicate OK', workspace: 'main', category: 'Reading' }
    });
    entries.addJsonFile('recoverable.json', {
        schema: 'eveos.bookmark.v1',
        entityLink: 'eve://workspace/main/card/Reading/bookmark/missing_id',
        entityId: 'b_moved',
        bookmark: { id: 'b_moved', title: 'Moved Live', workspace: 'main', category: 'Other' }
    });
    const folders = reading.addDirectory('folders');
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
    const folderEntries = folder.addDirectory('entries');
    folderEntries.addJsonFile('orphan.json', {
        schema: 'eveos.bookmark.v1',
        entityLink: 'eve://workspace/main/card/Reading/folder/gone_folder/bookmark/b_orphan',
        entityId: 'b_orphan',
        bookmark: { id: 'b_orphan', title: 'Orphan Backup', workspace: 'main', category: 'Reading', folderId: 'gone_folder' }
    });
    return root;
}

async function main() {
    const context = createContext();
    [
        'js/modules/features/search-advanced/sa-nebula-json-link.shared.js',
        'js/modules/features/search-advanced/sa-nebula-json-link.runtime.js',
        'js/modules/features/search-advanced/sa-nebula-json-link.js',
        'js/modules/features/data-transfer/data-transfer.shared.core.js',
        'js/modules/features/data-transfer/data-transfer.shared.restore.js',
        'js/modules/features/data-transfer/data-transfer.shared.remap.helpers.js',
        'js/modules/features/data-transfer/data-transfer.shared.remap.js',
        'js/modules/features/data-transfer/data-transfer.shared.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.fs.js',
        'js/modules/features/data-transfer/data-transfer.backup-mismatch-report.js',
        'js/modules/features/data-transfer/data-transfer.backup-mismatch-report.scan.js',
        'js/modules/features/data-transfer/data-transfer.backup-mismatch-report.ui.js'
    ].forEach((relativePath) => {
        vm.runInContext(readModule(relativePath), context, { filename: relativePath });
    });

    const report = await context.window.EveDataTransfer.buildBackupMismatchReportFromFolder(buildBackupFolder());
    const issueCodes = new Set();
    report.records.forEach((record) => {
        record.issues.forEach((issue) => issueCodes.add(issue.code));
    });
    report.issues.forEach((issue) => issueCodes.add(issue.code));

    assert(report.counts.broken >= 1, `Expected broken rows, saw ${JSON.stringify(report.counts)}`);
    assert(report.counts.warning >= 1, `Expected warning rows, saw ${JSON.stringify(report.counts)}`);
    assert(issueCodes.has('backup_folder_parent_missing'), `Missing folder parent issue: ${JSON.stringify([...issueCodes])}`);
    assert(issueCodes.has('backup_bookmark_folder_missing'), `Missing orphan bookmark issue: ${JSON.stringify([...issueCodes])}`);
    assert(issueCodes.has('duplicate_entity_link_in_backup'), `Missing duplicate link issue: ${JSON.stringify([...issueCodes])}`);
    assert(issueCodes.has('stale_link_recoverable_by_metadata'), `Missing recoverable stale link issue: ${JSON.stringify([...issueCodes])}`);
    assert(issueCodes.has('manifest_bookmark_count_mismatch'), `Missing manifest mismatch issue: ${JSON.stringify([...issueCodes])}`);

    const rendered = context.window.EveDataTransfer.renderBackupMismatchReport(report);
    assert(rendered, 'Expected report render to succeed');
    assert(context.__target.innerHTML.includes('backup_folder_parent_missing'), 'Rendered report should expose folder parent issue');
    assert(context.__target.innerHTML.includes('Backup bookmark references a folder'), 'Rendered report should expose orphan bookmark label');

    console.log('BACKUP_MISMATCH_REPORT_SMOKE_OK');
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
