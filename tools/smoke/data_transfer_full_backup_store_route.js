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
        backupCalls: [],
        folderFallbackCalls: 0,
        toasts: [],
        persistedPath: ''
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
        setTimeout,
        clearTimeout,
        Blob,
        URL: {
            createObjectURL() {
                throw new Error('JSON fallback should not run during store-route smoke');
            }
        },
        showToast(message, type) {
            metrics.toasts.push([message, type]);
        },
        document: {
            createElement() {
                return {
                    click() {
                        throw new Error('JSON fallback should not run during store-route smoke');
                    }
                };
            }
        },
        window: {
            location: {
                protocol: 'http:',
                hostname: 'localhost'
            },
            showDirectoryPicker: async () => {
                metrics.folderFallbackCalls += 1;
                throw new Error('Browser folder fallback should not run during store-route smoke');
            },
            EveDataStore: {
                Store: {
                    captureState() {
                        return {
                            bookmarks: {
                                links: [],
                                config: {
                                    activeWorkspace: 'main',
                                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }]
                                }
                            },
                            library: { categories: {}, connections: [] },
                            knowledge: { scopedStorage: {} }
                        };
                    }
                },
                ModularSync: {
                    async syncNow() {
                        metrics.syncCalls += 1;
                        return { ok: true };
                    },
                    async backupLayer(options) {
                        metrics.backupCalls.push({ ...(options || {}) });
                        return {
                            ok: true,
                            summary: {
                                tabs: 3,
                                cards: 7,
                                bookmarks: 21
                            },
                            destinationPath: 'C:/Backups/EvePack'
                        };
                    }
                }
            },
            EveDataTransfer: {
                sharedReady: true,
                exportReady: true,
                importReady: true,
                importActionsReady: true,
                getDataStore() {
                    return context.window.EveDataStore.Store;
                },
                getAppConfig() {
                    return {
                        activeWorkspace: 'main',
                        workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }]
                    };
                },
                getAppLinks() {
                    return [];
                },
                exportFullBackupAsFolder: async () => {
                    metrics.folderFallbackCalls += 1;
                    throw new Error('Browser folder fallback should not run during store-route smoke');
                },
                async requireLayerDestinationPath() {
                    return 'C:/Backups';
                },
                persistLayerDestinationPath(nextPath) {
                    metrics.persistedPath = String(nextPath || '');
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
        readModule('js/modules/features/data-transfer/data-transfer.core.js'),
        context,
        { filename: 'js/modules/features/data-transfer/data-transfer.core.js' }
    );

    if (typeof context.window.exportData !== 'function') {
        throw new Error('exportData did not initialize');
    }

    await context.window.exportData();

    if (metrics.syncCalls !== 1) {
        throw new Error(`Expected one sync call before backup, saw ${metrics.syncCalls}`);
    }
    if (metrics.backupCalls.length !== 1) {
        throw new Error(`Expected one store backup call, saw ${metrics.backupCalls.length}`);
    }
    if (metrics.backupCalls[0].layer !== 'store') {
        throw new Error(`Expected store-layer backup, saw ${JSON.stringify(metrics.backupCalls[0])}`);
    }
    if (metrics.backupCalls[0].destinationPath !== 'C:/Backups') {
        throw new Error(`Expected destination path to flow through, saw ${JSON.stringify(metrics.backupCalls[0])}`);
    }
    if (metrics.folderFallbackCalls !== 0) {
        throw new Error(`Browser folder fallback should not run, saw ${metrics.folderFallbackCalls}`);
    }
    if (metrics.persistedPath !== 'C:/Backups') {
        throw new Error(`Expected chosen path to persist, saw "${metrics.persistedPath}"`);
    }
    if (!metrics.toasts.some(([message, type]) => type === 'success' && /data-pack folder backup created/i.test(message))) {
        throw new Error(`Expected success toast, saw ${JSON.stringify(metrics.toasts)}`);
    }

    console.log(`DATA_TRANSFER_FULL_BACKUP_STORE_ROUTE_OK ${JSON.stringify({
        syncCalls: metrics.syncCalls,
        backupCall: metrics.backupCalls[0],
        toast: metrics.toasts[0]
    })}`);
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
