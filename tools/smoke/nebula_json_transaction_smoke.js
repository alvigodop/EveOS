const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LINK_MODULE_PATH = path.join(REPO_ROOT, 'js/modules/features/search-advanced/sa-nebula-json-link.js');
const PATCH_MODULE_PATH = path.join(REPO_ROOT, 'js/modules/features/search-advanced/sa-nebula-json-patch.js');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function createHelpers() {
    function findById(workspaces, id) {
        const targetId = String(id || '');
        for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
            if (String(workspace?.id || '') === targetId) return workspace;
            const found = findById(workspace?.subTabs || [], targetId);
            if (found) return found;
        }
        return null;
    }

    function getPath(workspaces, id, currentPath = []) {
        const targetId = String(id || '');
        for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
            const nextPath = currentPath.concat([workspace]);
            if (String(workspace?.id || '') === targetId) return nextPath;
            const found = getPath(workspace?.subTabs || [], targetId, nextPath);
            if (found.length) return found;
        }
        return [];
    }

    return { findById, getPath };
}

function loadModule(context, modulePath) {
    const source = fs.readFileSync(modulePath, 'utf8');
    vm.runInNewContext(source, context, { filename: modulePath });
}

function createContext() {
    const config = {
        activeWorkspace: 'main',
        workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
        categoryOrderByWorkspace: {
            main: ['Reading', 'Archive']
        }
    };
    const links = [
        {
            id: 'b-root',
            title: 'Root Bookmark',
            url: 'https://example.test/root',
            workspace: 'main',
            category: 'Reading',
            notes: 'Old notes',
            identifiers: ['reading']
        },
        {
            id: 'b-folder',
            title: 'Folder Bookmark',
            url: 'https://example.test/folder',
            workspace: 'main',
            category: 'Reading',
            folderId: 'f_123'
        }
    ];
    const bookmarkFolders = {
        'main::Reading': {
            nodes: [{ id: 'f_123', name: 'Folder One', parentId: '' }]
        }
    };
    const windowObject = {
        EveOS: { SearchAdvanced: {} },
        eveState: { config, links, bookmarkFolders },
        config,
        links,
        bookmarkFolders,
        saveDataCalls: [],
        saveConfigCalls: [],
        getLiveLinks() {
            return links;
        },
        setLiveLinks(nextLinks) {
            links.splice(0, links.length, ...nextLinks);
            windowObject.links = links;
            windowObject.eveState.links = links;
            return links;
        },
        EveWorkspaceHelpers: createHelpers(),
        EveCategoryOrder: {
            getOrder(workspaceId) {
                return (config.categoryOrderByWorkspace[workspaceId] || []).slice();
            },
            renameCategory(workspaceId, oldName, newName) {
                config.categoryOrderByWorkspace[workspaceId] = (config.categoryOrderByWorkspace[workspaceId] || [])
                    .map((name) => name === oldName ? newName : name);
            }
        },
        EveBookmarkFolders: {
            getScopedNodes(workspaceId, categoryName) {
                return bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [];
            },
            getFolderById(workspaceId, categoryName, folderId) {
                return (bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [])
                    .find((folder) => String(folder.id) === String(folderId)) || null;
            },
            buildFolderPathLabel(workspaceId, categoryName, folderId) {
                return (bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [])
                    .find((folder) => String(folder.id) === String(folderId))?.name || '';
            }
        }
    };
    windowObject.window = windowObject;
    return {
        window: windowObject,
        console,
        Date,
        Math,
        encodeURIComponent,
        decodeURIComponent,
        saveData(options) {
            windowObject.saveDataCalls.push(options);
            return true;
        },
        saveConfig(options) {
            windowObject.saveConfigCalls.push(options);
            return true;
        },
        renderDashboard() {},
        renderSidebar() {}
    };
}

function main() {
    const context = createContext();
    loadModule(context, LINK_MODULE_PATH);
    loadModule(context, PATCH_MODULE_PATH);

    const linkApi = context.window.EveOS.NebulaJsonLink;
    const patchApi = context.window.EveOS.NebulaJsonPatch;
    const bookmarkLink = linkApi.createLink({ type: 'bookmark', workspaceId: 'main', categoryName: 'Reading', bookmarkId: 'b-root' });
    const cardLink = linkApi.createLink({ type: 'card', workspaceId: 'main', categoryName: 'Reading' });

    const tx = patchApi.buildTransaction([
        patchApi.buildPatch('reorder-card', cardLink, { order: 2 }, { source: 'smoke' }),
        patchApi.buildPatch('rename-bookmark', bookmarkLink, { title: 'Renamed Root' }, { source: 'smoke' }),
        patchApi.buildPatch('set-bookmark-url', bookmarkLink, { url: 'https://example.test/new-root' }, { source: 'smoke' }),
        patchApi.buildPatch('set-bookmark-notes', bookmarkLink, { notes: 'New notes' }, { source: 'smoke' }),
        patchApi.buildPatch('set-bookmark-identifiers', bookmarkLink, { identifiers: ['reading', 'favorite'] }, { source: 'smoke' }),
        patchApi.buildPatch('set-bookmark-folder', bookmarkLink, { folderId: 'f_123' }, { source: 'smoke' })
    ], { source: 'smoke-transaction' });

    const preview = patchApi.previewTransaction(tx);
    assert(preview.valid && preview.previews.length === 6, `Transaction preview should be valid: ${JSON.stringify(preview)}`);
    const result = patchApi.applyTransaction(tx, { persist: false, skipRender: true });
    assert(result.ok && result.applied, `Transaction should apply: ${JSON.stringify(result)}`);
    assert(context.window.config.categoryOrderByWorkspace.main.join('|') === 'Archive|Reading', 'Card order should update');
    assert(context.window.links[0].title === 'Renamed Root', 'Bookmark title should update');
    assert(context.window.links[0].url === 'https://example.test/new-root', 'Bookmark URL should update');
    assert(context.window.links[0].notes === 'New notes', 'Bookmark notes should update');
    assert(context.window.links[0].identifiers.join('|') === 'reading|favorite', 'Bookmark identifiers should update');
    assert(context.window.links[0].folderId === 'f_123', 'Bookmark folder should update');

    const movedLink = linkApi.createLink({ type: 'bookmark', workspaceId: 'main', categoryName: 'Reading', folderId: 'f_123', bookmarkId: 'b-root' });
    const rollbackTx = patchApi.buildTransaction([
        patchApi.buildPatch('set-bookmark-folder', movedLink, { folderId: '' }, { source: 'smoke' }),
        patchApi.buildPatch('set-bookmark-url', movedLink, { url: 'https://example.test/should-rollback' }, { source: 'smoke' })
    ], { source: 'smoke-rollback' });
    const rollbackResult = patchApi.applyTransaction(rollbackTx, { persist: false, skipRender: true });
    assert(!rollbackResult.ok && rollbackResult.rolledBack, `Transaction should rollback on sequential mismatch: ${JSON.stringify(rollbackResult)}`);
    assert(context.window.links[0].folderId === 'f_123', 'Rollback should restore bookmark folder');
    assert(context.window.links[0].url === 'https://example.test/new-root', 'Rollback should restore bookmark URL');

    context.window.EveOS.SearchAdvanced.Navigation = {
        goToPath(result) {
            context.window.__lastGoToPath = result.path;
            return true;
        }
    };
    const actionResult = linkApi.executeAction('go-to-path', movedLink);
    assert(actionResult.ok && context.window.__lastGoToPath.linkId === 'b-root', 'Entity link action should route through navigation');

    console.log('NEBULA_JSON_TRANSACTION_SMOKE_OK');
}

main();
