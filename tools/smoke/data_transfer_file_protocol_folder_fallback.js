const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function createContext() {
    const metrics = {
        syncCalls: 0,
        backupCalls: 0,
        pickFolderCalls: 0,
        requirePathCalls: 0,
        persistedPaths: [],
        fullFallbackCalls: 0,
        workspaceFallbackCalls: 0,
        cardFallbackCalls: 0,
        folderFallbackCalls: 0,
        toasts: []
    };

    const elements = {
        tabBackupSelect: { value: 'main' },
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
                throw new Error('JSON fallback should not run in file protocol folder fallback smoke');
            }
        },
        showToast(message, type) {
            metrics.toasts.push([String(message || ''), String(type || '')]);
        },
        saveConfig() {
            throw new Error('saveConfig should not run in file protocol folder fallback smoke');
        },
        document: {
            getElementById(id) {
                return elements[id] || null;
            },
            createElement() {
                return {
                    click() {
                        throw new Error('JSON fallback should not run in file protocol folder fallback smoke');
                    }
                };
            }
        },
        window: {
            location: {
                protocol: 'file:',
                hostname: ''
            },
            showDirectoryPicker: async () => ({ name: 'backup-root' }),
            eveState: {
                config: {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }]
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
                            bookmarks: {
                                links: [
                                    {
                                        id: 'bookmark-1',
                                        workspace: 'main',
                                        category: 'Alpha',
                                        title: 'Bookmark One',
                                        url: 'https://example.com'
                                    }
                                ],
                                config: {
                                    activeWorkspace: 'main',
                                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }]
                                }
                            },
                            library: { categories: {}, connections: [] },
                            knowledge: { scopedStorage: {} }
                        };
                    },
                    captureWorkspace(workspaceId) {
                        return {
                            metadata: { type: 'workspace', workspaceId },
                            bookmarks: { links: [{ id: 'bookmark-1' }] }
                        };
                    },
                    captureCard(workspaceId, categoryName) {
                        return {
                            metadata: { type: 'card', workspaceId, categoryName },
                            bookmarks: { links: [{ id: 'bookmark-1' }] }
                        };
                    },
                    captureFolder(workspaceId, categoryName, folderId) {
                        return {
                            metadata: { type: 'folder', workspaceId, categoryName, folderId },
                            bookmarks: { links: [{ id: 'bookmark-1', folderId }] }
                        };
                    }
                },
                ModularSync: {
                    async syncNow() {
                        metrics.syncCalls += 1;
                        return { ok: true };
                    },
                    async backupLayer() {
                        metrics.backupCalls += 1;
                        return { ok: true };
                    },
                    async pickFolderPath() {
                        metrics.pickFolderCalls += 1;
                        return { ok: true, path: 'C:/Backups' };
                    }
                }
            },
            EveDataTransfer: {
                exportUtilsReady: true,
                exportFolderReady: true,
                importReady: true,
                importActionsReady: true,
                async exportFullBackupAsFolder() {
                    metrics.fullFallbackCalls += 1;
                    return { ok: true, tabsCount: 1, cardsCount: 1, bookmarksCount: 1 };
                },
                async exportWorkspaceFolderFallback() {
                    metrics.workspaceFallbackCalls += 1;
                    return { ok: true, cards: 1, bookmarks: 1 };
                },
                async exportCardFolderFallback() {
                    metrics.cardFallbackCalls += 1;
                    return { ok: true, bookmarks: 1 };
                },
                async exportFolderFolderFallback() {
                    metrics.folderFallbackCalls += 1;
                    return { ok: true, bookmarks: 1 };
                },
                buildWorkspacePayload() {
                    throw new Error('Workspace payload fallback should not run in file protocol folder fallback smoke');
                },
                buildCardPayload() {
                    throw new Error('Card payload fallback should not run in file protocol folder fallback smoke');
                },
                buildWorkspaceBackupJsonName() {
                    return 'workspace.json';
                },
                buildCardBackupJsonName() {
                    return 'card.json';
                },
                buildFolderBackupJsonName() {
                    return 'folder.json';
                },
                buildBookmarkBackupJsonName() {
                    return 'bookmark.json';
                },
                async requireLayerDestinationPath() {
                    metrics.requirePathCalls += 1;
                    throw new Error('Server destination path should not be requested in file protocol folder fallback smoke');
                },
                persistLayerDestinationPath(nextPath) {
                    metrics.persistedPaths.push(String(nextPath || ''));
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
        readModule('js/modules/features/data-transfer/data-transfer.shared.restore.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.shared.restore.js' }
    );
    vm.runInContext(
        readModule('js/modules/features/data-transfer/data-transfer.shared.remap.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.shared.remap.js' }
    );
    vm.runInContext(
        readModule('js/modules/features/data-transfer/data-transfer.shared.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.shared.js' }
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

    if (typeof context.window.exportData !== 'function') {
        throw new Error('exportData did not initialize');
    }
    if (typeof context.window.exportWorkspaceBackup !== 'function') {
        throw new Error('exportWorkspaceBackup did not initialize');
    }
    if (typeof context.window.exportCardBackup !== 'function') {
        throw new Error('exportCardBackup did not initialize');
    }
    if (typeof context.window.exportFolderBackup !== 'function') {
        throw new Error('exportFolderBackup did not initialize');
    }

    await context.window.exportData();
    await context.window.exportWorkspaceBackup();
    await context.window.exportCardBackup();
    await context.window.exportFolderBackup();

    if (metrics.syncCalls !== 0) {
        throw new Error(`syncNow should not run in file protocol mode, saw ${metrics.syncCalls}`);
    }
    if (metrics.backupCalls !== 0) {
        throw new Error(`backupLayer should not run in file protocol mode, saw ${metrics.backupCalls}`);
    }
    if (metrics.pickFolderCalls !== 0) {
        throw new Error(`pickFolderPath should not run in file protocol mode, saw ${metrics.pickFolderCalls}`);
    }
    if (metrics.requirePathCalls !== 0) {
        throw new Error(`requireLayerDestinationPath should not run in file protocol mode, saw ${metrics.requirePathCalls}`);
    }
    if (metrics.persistedPaths.length !== 0) {
        throw new Error(`persistLayerDestinationPath should not run in file protocol mode, saw ${JSON.stringify(metrics.persistedPaths)}`);
    }
    if (metrics.fullFallbackCalls !== 1 || metrics.workspaceFallbackCalls !== 1 || metrics.cardFallbackCalls !== 1 || metrics.folderFallbackCalls !== 1) {
        throw new Error(`Expected exactly one browser folder fallback per export route, saw ${JSON.stringify(metrics)}`);
    }
    if (metrics.toasts.some(([message]) => /set folder path in copy between packs/i.test(message))) {
        throw new Error(`Server path warning should not appear in file protocol mode, saw ${JSON.stringify(metrics.toasts)}`);
    }

    console.log(`DATA_TRANSFER_FILE_PROTOCOL_FOLDER_FALLBACK_OK ${JSON.stringify({
        fullFallbackCalls: metrics.fullFallbackCalls,
        workspaceFallbackCalls: metrics.workspaceFallbackCalls,
        cardFallbackCalls: metrics.cardFallbackCalls,
        folderFallbackCalls: metrics.folderFallbackCalls,
        toasts: metrics.toasts
    })}`);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
