const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function createContext() {
    const metrics = {
        downloads: [],
        toasts: [],
        folderFallbackCalls: 0,
        groupFolderFallbackCalls: 0,
        backupLayerCalls: 0
    };

    const elements = {
        tabBackupSelect: { value: 'main' },
        groupBackupSelect: { value: 'grp-1' },
        cardBackupWorkspaceSelect: { value: 'main' },
        cardBackupCategorySelect: { value: 'Alpha' },
        bookmarkBackupWorkspaceSelect: { value: 'main' },
        bookmarkBackupCategorySelect: { value: 'Alpha' },
        bookmarkBackupLocationSelect: { value: 'root' },
        bookmarkBackupLinkSelect: { value: 'bookmark-1' },
        folderBackupWorkspaceSelect: { value: 'main' },
        folderBackupCategorySelect: { value: 'Alpha' },
        folderBackupFolderSelect: { value: 'folder-1' },
        modularLayerPathInput: { value: '' }
    };

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
        URL: {
            createObjectURL() {
                return `blob:${metrics.downloads.length + 1}`;
            },
            revokeObjectURL() {}
        },
        showToast(message, type) {
            metrics.toasts.push([String(message || ''), String(type || '')]);
        },
        document: {
            getElementById(id) {
                return elements[id] || null;
            },
            createElement(tagName) {
                if (String(tagName || '').toLowerCase() !== 'a') return {};
                return {
                    href: '',
                    download: '',
                    click() {
                        metrics.downloads.push({
                            href: this.href,
                            download: this.download
                        });
                    }
                };
            }
        },
        window: {
            location: {
                protocol: 'file:',
                hostname: ''
            },
            eveState: {
                config: {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder', groupId: 'grp-1' }],
                    sidebarGroups: [{ id: 'grp-1', name: 'Alpha Group', color: '#00d4ff' }]
                },
                links: [
                    {
                        id: 'bookmark-1',
                        workspace: 'main',
                        category: 'Alpha',
                        title: 'Bookmark One',
                        url: 'https://example.com',
                        folderId: ''
                    }
                ],
                bookmarkFolders: {
                    'main::Alpha': [
                        { id: 'folder-1', name: 'Folder One', parentId: '' }
                    ]
                }
            },
            EveLibrary: {
                State: {
                    getBookmarkFolderNodes(categoryName, workspaceId) {
                        if (String(workspaceId) !== 'main' || String(categoryName) !== 'Alpha') return [];
                        return [{ id: 'folder-1', name: 'Folder One', parentId: '' }];
                    }
                }
            },
            EveDataStore: {
                Store: {
                    captureState() {
                        return {
                            metadata: { type: 'store' },
                            bookmarks: {
                                links: [{ id: 'bookmark-1' }],
                                config: {
                                    activeWorkspace: 'main',
                                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder', groupId: 'grp-1' }],
                                    sidebarGroups: [{ id: 'grp-1', name: 'Alpha Group', color: '#00d4ff' }]
                                }
                            },
                            library: { categories: {}, connections: [] },
                            knowledge: { scopedStorage: {} }
                        };
                    },
                    captureWorkspace(workspaceId) {
                        return { metadata: { type: 'workspace', workspaceId }, bookmarks: { links: [{ id: 'bookmark-1' }] }, library: { categories: {}, connections: [] } };
                    },
                    captureGroup(groupId) {
                        return { metadata: { type: 'group', groupId, groupName: 'Alpha Group' }, bookmarks: { links: [{ id: 'bookmark-1' }] }, library: { categories: {}, connections: [] } };
                    },
                    captureCard(workspaceId, categoryName) {
                        return { metadata: { type: 'card', workspaceId, categoryName }, bookmarks: { links: [{ id: 'bookmark-1' }] }, library: { categories: {}, connections: [] } };
                    },
                    captureFolder(workspaceId, categoryName, folderId) {
                        return { metadata: { type: 'folder', workspaceId, categoryName, folderId }, bookmarks: { links: [{ id: 'bookmark-1', folderId }] }, library: { categories: {}, connections: [] } };
                    },
                    captureBookmark(workspaceId, categoryName, linkId) {
                        return { metadata: { type: 'bookmark', workspaceId, categoryName, bookmarkId: linkId }, bookmarks: { links: [{ id: linkId, title: 'Bookmark One', url: 'https://example.com' }] }, library: { categories: {}, connections: [] } };
                    }
                },
                ModularSync: {
                    async backupLayer() {
                        metrics.backupLayerCalls += 1;
                        return { ok: true };
                    }
                }
            },
            EveDataTransfer: {
                sharedReady: true,
                exportUtilsReady: true,
                exportFolderReady: true,
                importReady: true,
                importActionsReady: true,
                buildFullBackupJsonName() { return 'full.json'; },
                buildWorkspaceBackupJsonName() { return 'workspace.json'; },
                buildGroupBackupJsonName() { return 'group.json'; },
                buildCardBackupJsonName() { return 'card.json'; },
                buildFolderBackupJsonName() { return 'folder.json'; },
                buildBookmarkBackupJsonName() { return 'bookmark.json'; },
                async exportFullBackupAsFolder() {
                    metrics.folderFallbackCalls += 1;
                    return { ok: true };
                },
                async exportWorkspaceFolderFallback() {
                    metrics.folderFallbackCalls += 1;
                    return { ok: true };
                },
                async exportCardFolderFallback() {
                    metrics.folderFallbackCalls += 1;
                    return { ok: true };
                },
                async exportFolderFolderFallback() {
                    metrics.folderFallbackCalls += 1;
                    return { ok: true };
                },
                async exportGroupFolderFallback() {
                    metrics.groupFolderFallbackCalls += 1;
                    return { ok: true, tabs: 1, cards: 1, bookmarks: 1 };
                },
                async requireLayerDestinationPath() {
                    throw new Error('JSON-only routes should not request server destination paths');
                },
                persistLayerDestinationPath() {
                    throw new Error('JSON-only routes should not persist server destination paths');
                }
            }
        }
    };

    context.window.window = context.window;
    context.window.document = context.document;
    context.globalThis = context;
    context.self = context.window;
    return { context: vm.createContext(context), metrics };
}

async function main() {
    const { context, metrics } = createContext();

    vm.runInContext(
        readModule('js/modules/features/data-transfer/data-transfer.shared.core.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.shared.core.js' }
    );
    vm.runInContext(
        readModule('js/modules/features/data-transfer/data-transfer.export.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.export.js' }
    );
    vm.runInContext(
        readModule('js/modules/features/data-transfer/data-transfer.core.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.core.js' }
    );

    const requiredFns = [
        'exportDataJsonOnly',
        'exportWorkspaceBackupJsonOnly',
        'exportGroupBackupJsonOnly',
        'exportCardBackupJsonOnly',
        'exportFolderBackupJsonOnly',
        'exportBookmarkBackupJsonOnly',
        'exportGroupBackup'
    ];
    requiredFns.forEach((fnName) => {
        if (typeof context.window[fnName] !== 'function') {
            throw new Error(`${fnName} did not initialize`);
        }
    });

    context.window.exportDataJsonOnly();
    context.window.exportWorkspaceBackupJsonOnly();
    context.window.exportGroupBackupJsonOnly();
    context.window.exportCardBackupJsonOnly();
    context.window.exportFolderBackupJsonOnly();
    context.window.exportBookmarkBackupJsonOnly();

    if (metrics.downloads.length !== 6) {
        throw new Error(`Expected 6 JSON downloads, saw ${metrics.downloads.length}`);
    }
    const downloadNames = metrics.downloads.map((entry) => entry.download).join('|');
    if (downloadNames !== 'full.json|workspace.json|group.json|card.json|folder.json|bookmark.json') {
        throw new Error(`Unexpected JSON download names: ${downloadNames}`);
    }
    if (metrics.folderFallbackCalls !== 0 || metrics.groupFolderFallbackCalls !== 0 || metrics.backupLayerCalls !== 0) {
        throw new Error(`JSON-only routes should not hit folder/server backup paths: ${JSON.stringify(metrics)}`);
    }

    await context.window.exportGroupBackup();
    if (metrics.groupFolderFallbackCalls !== 1) {
        throw new Error(`Expected one group folder fallback call, saw ${metrics.groupFolderFallbackCalls}`);
    }
    if (metrics.downloads.length !== 6) {
        throw new Error('Successful group folder backup should not fall back to JSON download');
    }

    console.log(`DATA_TRANSFER_JSON_ONLY_ROUTES_OK ${JSON.stringify({
        downloads: metrics.downloads.map((entry) => entry.download),
        groupFolderFallbackCalls: metrics.groupFolderFallbackCalls,
        toasts: metrics.toasts
    })}`);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
