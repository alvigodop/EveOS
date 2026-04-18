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
        for (const [name, handle] of this.dirs.entries()) {
            yield [name, handle];
        }
        for (const [name, handle] of this.files.entries()) {
            yield [name, handle];
        }
    }
}

function buildRootHandle() {
    const root = new ImportDirectoryHandle('backup-root');
    const meta = root.addDirectory('_meta');
    meta.addJsonFile('config.json', {
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
    });
    meta.addJsonFile('pins.json', { pins: [] });

    const tabsRoot = root.addDirectory('tabs');
    const mainTab = tabsRoot.addDirectory('main-001');
    mainTab.addJsonFile('tab.json', {
        id: 'main',
        name: 'Main',
        icon: 'folder'
    });
    const mainCards = mainTab.addDirectory('cards');
    const mainCard = mainCards.addDirectory('reference-001');
    mainCard.addJsonFile('card.json', {
        workspaceId: 'main',
        categoryName: 'Reference',
        bookmarkFolder: 'entries'
    });
    const mainEntries = mainCard.addDirectory('entries');
    mainEntries.addJsonFile('bookmark-main.json', {
        bookmark: {
            id: 'bookmark-main',
            title: 'Main Bookmark',
            url: 'https://example.com/main',
            workspace: 'main',
            category: 'Reference'
        }
    });

    const groupTab = tabsRoot.addDirectory('projects-abc');
    groupTab.addJsonFile('tab.json', {
        id: 'group-root',
        name: 'Projects',
        icon: 'folder'
    });
    groupTab.addDirectory('cards');
    const nestedTabs = groupTab.addDirectory('tabs');
    const nestedTab = nestedTabs.addDirectory('travel-local-def');
    nestedTab.addJsonFile('tab.json', {
        id: 'nestedspace',
        name: 'Travel Local',
        icon: 'folder'
    });
    const nestedCards = nestedTab.addDirectory('cards');
    const nestedCard = nestedCards.addDirectory('trips-001');
    nestedCard.addJsonFile('card.json', {
        workspaceId: 'nestedspace',
        categoryName: 'Trips',
        bookmarkFolder: 'entries'
    });
    const nestedEntries = nestedCard.addDirectory('entries');
    nestedEntries.addJsonFile('bookmark-nested.json', {
        bookmark: {
            id: 'bookmark-nested',
            title: 'Nested Bookmark',
            url: 'https://example.com/nested',
            workspace: 'nestedspace',
            category: 'Trips'
        }
    });

    return root;
}

function findWorkspaceNode(workspaces, workspaceId) {
    for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
        if (!workspace || typeof workspace !== 'object') continue;
        if (String(workspace.id || '') === String(workspaceId || '')) return workspace;
        const child = findWorkspaceNode(workspace.subTabs, workspaceId);
        if (child) return child;
    }
    return null;
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
        document: {
            getElementById() {
                return null;
            }
        },
        window: {
            eveState: {
                config: {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }]
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
        'js/modules/features/data-transfer/data-transfer.shared.js',
        'js/modules/features/data-transfer/data-transfer.export.naming.js',
        'js/modules/features/data-transfer/data-transfer.export.library.js',
        'js/modules/features/data-transfer/data-transfer.export.utils.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.infer.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.build.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.fs.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.parse.handles.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.parse.root.js'
    ].forEach((relativePath) => {
        vm.runInContext(readModule(relativePath), context, { filename: relativePath });
    });

    const api = context.window.EveDataTransfer;
    if (typeof api.parseFullStateFromFolder !== 'function') {
        throw new Error('parseFullStateFromFolder unavailable');
    }

    const state = await api.parseFullStateFromFolder(buildRootHandle());
    const workspaces = state?.bookmarks?.config?.workspaces || [];
    const nestedWorkspace = findWorkspaceNode(workspaces, 'nestedspace');
    if (!nestedWorkspace) {
        throw new Error(`Nested workspace missing after import: ${JSON.stringify(workspaces)}`);
    }
    const groupWorkspace = findWorkspaceNode(workspaces, 'group-root');
    if (!groupWorkspace || !Array.isArray(groupWorkspace.subTabs) || !groupWorkspace.subTabs.some((child) => child.id === 'nestedspace')) {
        throw new Error(`Nested workspace was not preserved under group parent: ${JSON.stringify(workspaces)}`);
    }

    const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
    if (!links.some((link) => String(link?.workspace || '') === 'nestedspace' && String(link?.category || '') === 'Trips')) {
        throw new Error(`Nested workspace bookmarks missing after import: ${JSON.stringify(links)}`);
    }

    console.log(`DATA_TRANSFER_NESTED_TAB_FOLDER_IMPORT_OK ${JSON.stringify({
        activeWorkspace: state?.bookmarks?.config?.activeWorkspace,
        workspaceCount: links.length,
        nestedWorkspace: nestedWorkspace.name
    })}`);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
