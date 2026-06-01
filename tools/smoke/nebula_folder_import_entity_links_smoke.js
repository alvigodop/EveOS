const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

class ImportFileHandle {
    constructor(name, text) {
        this.kind = 'file';
        this.name = name;
        this._text = text;
    }

    async getFile() {
        const text = this._text;
        return {
            async text() {
                return String(text);
            }
        };
    }
}

class ImportDirectoryHandle {
    constructor(name) {
        this.kind = 'directory';
        this.name = name;
        this.dirs = new Map();
        this.files = new Map();
    }

    addDirectory(name) {
        const dir = new ImportDirectoryHandle(name);
        this.dirs.set(name, dir);
        return dir;
    }

    addJsonFile(name, payload) {
        this.files.set(name, new ImportFileHandle(name, JSON.stringify(payload, null, 2)));
        return this;
    }

    async getDirectoryHandle(name) {
        if (!this.dirs.has(name)) throw new Error(`Missing dir: ${name}`);
        return this.dirs.get(name);
    }

    async getFileHandle(name) {
        if (!this.files.has(name)) throw new Error(`Missing file: ${name}`);
        return this.files.get(name);
    }

    async *entries() {
        for (const [name, handle] of this.dirs.entries()) yield [name, handle];
        for (const [name, handle] of this.files.entries()) yield [name, handle];
    }
}

function buildCardHandle() {
    const card = new ImportDirectoryHandle('renamed-card-folder');
    card.addJsonFile('card.json', {
        schema: 'eveos.card.v2',
        entityLink: 'eve://workspace/main/card/Reading%20List',
        entityId: 'Reading List',
        displayName: 'Reading List',
        bookmarkFolder: 'entries'
    });
    const entries = card.addDirectory('entries');
    entries.addJsonFile('root.json', {
        schema: 'eveos.bookmark.v1',
        entityLink: 'eve://workspace/main/card/Reading%20List/bookmark/b_root',
        displayName: 'Root Bookmark',
        bookmark: {
            title: 'Root Bookmark',
            url: 'https://example.test/root'
        }
    });

    const folders = card.addDirectory('folders');
    const folder = folders.addDirectory('renamed-folder-dir');
    folder.addJsonFile('folder.json', {
        schema: 'eveos.bookmark-folder.v1',
        entityLink: 'eve://workspace/main/card/Reading%20List/folder/f_1',
        displayName: 'Folder One'
    });
    const folderEntries = folder.addDirectory('entries');
    folderEntries.addJsonFile('folder-bookmark.json', {
        schema: 'eveos.bookmark.v1',
        entityLink: 'eve://workspace/main/card/Reading%20List/folder/f_1/bookmark/b_folder',
        displayName: 'Folder Bookmark',
        bookmark: {
            title: 'Folder Bookmark',
            url: 'https://example.test/folder'
        }
    });
    return card;
}

function createContext() {
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
        decodeURIComponent,
        encodeURIComponent,
        document: {
            getElementById() {
                return null;
            }
        },
        window: {
            EveOS: {},
            eveState: {
                config: {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }]
                },
                links: []
            },
            EveDataTransfer: {}
        }
    };
    context.window.window = context.window;
    context.window.document = context.document;
    context.globalThis = context;
    context.self = context.window;
    return vm.createContext(context);
}

async function main() {
    const context = createContext();
    [
        'js/modules/features/search-advanced/sa-nebula-json-link.shared.js',
        'js/modules/features/search-advanced/sa-nebula-json-link.runtime.js',
        'js/modules/features/search-advanced/sa-nebula-json-link.js',
        'js/modules/features/data-transfer/data-transfer.shared.core.js',
        'js/modules/features/data-transfer/data-transfer.shared.restore.js',
        'js/modules/features/data-transfer/data-transfer.shared.remap.js',
        'js/modules/features/data-transfer/data-transfer.shared.js',
        'js/modules/features/data-transfer/data-transfer.export.naming.js',
        'js/modules/features/data-transfer/data-transfer.export.library.js',
        'js/modules/features/data-transfer/data-transfer.export.utils.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.infer.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.build.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.fs.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.parse.handles.js'
    ].forEach((relativePath) => {
        vm.runInContext(readModule(relativePath), context, { filename: relativePath });
    });

    const parsed = await context.window.EveDataTransfer.parseCardFolderHandle(buildCardHandle(), {});
    if (parsed.workspaceId !== 'main' || parsed.categoryName !== 'Reading List') {
        throw new Error(`Card entity metadata not applied: ${JSON.stringify(parsed)}`);
    }
    if (!parsed.folderTree.nodes.some((node) => node.id === 'f_1' && node.entityLink.includes('/folder/f_1'))) {
        throw new Error(`Folder entity metadata not applied: ${JSON.stringify(parsed.folderTree.nodes)}`);
    }
    const ids = parsed.links.map((link) => link.id).sort();
    if (!ids.includes('b_folder') || !ids.includes('b_root')) {
        throw new Error(`Bookmark entity ids not applied: ${JSON.stringify(parsed.links)}`);
    }
    if (!parsed.links.some((link) => link.id === 'b_folder' && link.folderId === 'f_1')) {
        throw new Error(`Folder bookmark did not keep folder entity id: ${JSON.stringify(parsed.links)}`);
    }

    console.log('NEBULA_FOLDER_IMPORT_ENTITY_LINKS_SMOKE_OK');
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
