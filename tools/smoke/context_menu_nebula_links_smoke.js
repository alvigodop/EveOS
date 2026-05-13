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

function createHelpers() {
    return {
        findById(workspaces, id) {
            return (Array.isArray(workspaces) ? workspaces : []).find((workspace) => String(workspace.id) === String(id)) || null;
        },
        getPath(workspaces, id) {
            const found = this.findById(workspaces, id);
            return found ? [found] : [];
        }
    };
}

function createContext() {
    const config = {
        activeWorkspace: 'main',
        workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }]
    };
    const links = [{
        id: 'b_ctx',
        title: 'Context Bookmark',
        url: 'https://example.test/context',
        workspace: 'main',
        category: 'Reading',
        folderId: 'f_1'
    }];
    const bookmarkFolders = {
        'main::Reading': {
            nodes: [{ id: 'f_1', name: 'Folder One', parentId: '' }]
        }
    };
    const toasts = [];
    const windowObject = {
        EveOS: {
            SearchAdvanced: {
                DatapackView: {
                    openGateway(payload) {
                        windowObject.__openedGateway = payload;
                    },
                    openCardInternals(workspaceId, categoryName) {
                        windowObject.__openedCardInternals = { workspaceId, categoryName };
                    }
                }
            }
        },
        EveContextMenuActions: {
            getCtxLink() {
                return links[0];
            }
        },
        EveWorkspaceHelpers: createHelpers(),
        EveBookmarkFolders: {
            getFolderById(workspaceId, categoryName, folderId) {
                return (bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [])
                    .find((folder) => String(folder.id) === String(folderId)) || null;
            },
            buildFolderPathLabel() {
                return 'Folder One';
            },
            getScopedNodes(workspaceId, categoryName) {
                return bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [];
            }
        },
        config,
        links,
        bookmarkFolders,
        eveState: { config, links, bookmarkFolders },
        ctxWsId: 'main',
        ctxCatName: 'Reading',
        ctxFolderId: 'f_1',
        ctxLinkId: 'b_ctx',
        closeAllMenus() {
            windowObject.__closedMenus = true;
        },
        showToast(message, type) {
            toasts.push({ message, type });
        },
        __toasts: toasts
    };
    windowObject.window = windowObject;
    return vm.createContext({
        window: windowObject,
        console,
        encodeURIComponent,
        decodeURIComponent,
        config,
        links,
        bookmarkFolders,
        closeAllMenus: windowObject.closeAllMenus,
        showToast: windowObject.showToast,
        globalThis: windowObject,
        self: windowObject
    });
}

function main() {
    const context = createContext();
    [
        'js/modules/features/search-advanced/sa-nebula-json-link.js',
        'js/modules/ui/context-menus/actions.json-link.js'
    ].forEach((relativePath) => {
        vm.runInContext(readModule(relativePath), context, { filename: relativePath });
    });

    const actions = context.window.EveContextMenuActions;
    assert(actions.createContextEntityLink('workspace') === 'eve://workspace/main', 'Workspace context link mismatch.');
    assert(actions.createContextEntityLink('card') === 'eve://workspace/main/card/Reading', 'Card context link mismatch.');
    assert(actions.createContextEntityLink('folder') === 'eve://workspace/main/card/Reading/folder/f_1', 'Folder context link mismatch.');
    assert(
        actions.createContextEntityLink('bookmark') === 'eve://workspace/main/card/Reading/folder/f_1/bookmark/b_ctx',
        'Bookmark context link mismatch.'
    );

    context.window.ctxCatOpenJsonState();
    assert(
        context.window.__openedCardInternals?.workspaceId === 'main'
            && context.window.__openedCardInternals?.categoryName === 'Reading',
        'Card context JSON state action should open card internals.'
    );

    context.window.ctxLinkValidateJsonLink();
    assert(context.window.__toasts.some((toast) => toast.type === 'success'), 'Bookmark validate action should toast success.');

    console.log('CONTEXT_MENU_NEBULA_LINKS_SMOKE_OK');
}

main();
