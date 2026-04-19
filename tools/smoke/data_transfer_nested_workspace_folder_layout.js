const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

class MemoryWritable {
    constructor(fileHandle) {
        this.fileHandle = fileHandle;
    }

    async write(content) {
        this.fileHandle.content = typeof content === 'string' ? content : String(content);
    }

    async close() {}
}

class MemoryFileHandle {
    constructor(name, relativePath) {
        this.kind = 'file';
        this.name = name;
        this.relativePath = relativePath;
        this.content = '';
    }

    async createWritable() {
        return new MemoryWritable(this);
    }
}

class MemoryDirectoryHandle {
    constructor(name, relativePath = '') {
        this.kind = 'directory';
        this.name = name;
        this.relativePath = relativePath;
        this.dirs = new Map();
        this.files = new Map();
    }

    _nextPath(name) {
        return this.relativePath ? `${this.relativePath}/${name}` : name;
    }

    async getDirectoryHandle(name, opts = {}) {
        if (!this.dirs.has(name)) {
            if (!opts.create) throw new Error(`Missing dir: ${name}`);
            this.dirs.set(name, new MemoryDirectoryHandle(name, this._nextPath(name)));
        }
        return this.dirs.get(name);
    }

    async getFileHandle(name, opts = {}) {
        if (!this.files.has(name)) {
            if (!opts.create) throw new Error(`Missing file: ${name}`);
            this.files.set(name, new MemoryFileHandle(name, this._nextPath(name)));
        }
        return this.files.get(name);
    }

    async *entries() {
        for (const [name, handle] of this.dirs.entries()) {
            yield [name, handle];
        }
        for (const [name, handle] of this.files.entries()) {
            yield [name, handle];
        }
    }
}

function collectFiles(dir, bucket = []) {
    for (const fileHandle of dir.files.values()) {
        bucket.push(fileHandle.relativePath);
    }
    for (const childDir of dir.dirs.values()) {
        collectFiles(childDir, bucket);
    }
    return bucket;
}

function buildState() {
    return {
        metadata: {},
        bookmarks: {
            links: [
                {
                    id: 'link-main',
                    title: 'Main Link',
                    url: 'https://example.com/main',
                    workspace: 'main',
                    category: 'Reference'
                },
                {
                    id: 'link-nested',
                    title: 'Nested Link',
                    url: 'https://example.com/nested',
                    workspace: 'nestedspace',
                    category: 'Trips'
                }
            ],
            config: {
                activeWorkspace: 'nestedspace',
                workspaces: [
                    { id: 'main', name: 'Main', icon: 'folder', subTabs: [] },
                    {
                        id: 'group-root',
                        name: 'Projects',
                        icon: 'folder',
                        subTabs: [
                            { id: 'nestedspace', name: 'Travel Local', icon: 'folder', subTabs: [] }
                        ]
                    }
                ]
            },
            folders: {},
            pins: []
        },
        library: {
            categories: {
                'main::Reference': {
                    dataType: 'graphicNovels',
                    entries: [],
                    folderView: { root: 'all', chain: [], expanded: false }
                },
                'nestedspace::Trips': {
                    dataType: 'graphicNovels',
                    entries: [],
                    folderView: { root: 'all', chain: [], expanded: false }
                }
            },
            connections: []
        },
        knowledge: {
            scopedStorage: {}
        }
    };
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
        Blob,
        setTimeout,
        clearTimeout,
        document: {
            getElementById() {
                return null;
            }
        },
        window: {
            location: {
                href: 'file:///EveOS.html',
                protocol: 'file:',
                hostname: ''
            },
            eveState: {
                config: {
                    activeWorkspace: 'nestedspace',
                    workspaces: buildState().bookmarks.config.workspaces
                },
                links: buildState().bookmarks.links
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
        'js/modules/features/data-transfer/data-transfer.shared.js',
        'js/modules/features/data-transfer/data-transfer.export.naming.js',
        'js/modules/features/data-transfer/data-transfer.export.library.js',
        'js/modules/features/data-transfer/data-transfer.export.utils.js',
        'js/modules/features/data-transfer/data-transfer.export.folder.writer.fs.js',
        'js/modules/features/data-transfer/data-transfer.export.folder.writer.tree.js',
        'js/modules/features/data-transfer/data-transfer.export.folder.writer.bookmarks.js',
        'js/modules/features/data-transfer/data-transfer.export.folder.writer.backups.js',
        'js/modules/features/data-transfer/data-transfer.export.folder.writer.cards.js',
        'js/modules/features/data-transfer/data-transfer.export.folder.writer.js'
    ].forEach((relativePath) => {
        vm.runInContext(readModule(relativePath), context, { filename: relativePath });
    });

    const api = context.window.EveDataTransfer;
    if (typeof api.writeFullStoreFolderBackup !== 'function') {
        throw new Error('writeFullStoreFolderBackup unavailable');
    }

    const rootHandle = new MemoryDirectoryHandle('picked');
    const summary = await api.writeFullStoreFolderBackup(rootHandle, buildState());
    const files = collectFiles(rootHandle).sort();

    const nestedTabPath = files.find((file) => /(?:tabs|t)\/[^/]+\/(?:tabs|t)\/[^/]+\/tab\.json$/i.test(file));
    if (!nestedTabPath) {
        throw new Error(`Expected nested tab path in backup, saw ${JSON.stringify(files)}`);
    }
    if (files.some((file) => /^(?:tabs|t)\/travel-local-[^/]+\/tab\.json$/i.test(file))) {
        throw new Error(`Nested workspace should not be written at tabs root: ${JSON.stringify(files)}`);
    }

    console.log(`DATA_TRANSFER_NESTED_WORKSPACE_FOLDER_LAYOUT_OK ${JSON.stringify({
        summary,
        nestedTabPath
    })}`);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
