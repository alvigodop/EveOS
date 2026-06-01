const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LINK_MODULE_PATHS = [
    'js/modules/features/search-advanced/sa-nebula-json-link.shared.js',
    'js/modules/features/search-advanced/sa-nebula-json-link.runtime.js',
    'js/modules/features/search-advanced/sa-nebula-json-link.js'
].map((relativePath) => path.join(REPO_ROOT, relativePath));
const PATCH_MODULE_PATHS = [
    'js/modules/features/search-advanced/sa-nebula-json-patch.shared.js',
    'js/modules/features/search-advanced/sa-nebula-json-patch.validate.js',
    'js/modules/features/search-advanced/sa-nebula-json-patch.apply.js',
    'js/modules/features/search-advanced/sa-nebula-json-patch.transaction.js',
    'js/modules/features/search-advanced/sa-nebula-json-patch.js'
].map((relativePath) => path.join(REPO_ROOT, relativePath));

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
        workspaces: [{
            id: 'main',
            name: 'Main',
            icon: 'home',
            subTabs: []
        }],
        categoryOrderByWorkspace: {
            main: ['Reading List', 'Archive']
        },
        cardDescriptions: {
            'main::Reading List': 'Old card description.'
        }
    };
    const links = [
        {
            id: 'b-root',
            title: 'Root Bookmark',
            url: 'https://example.test/root',
            workspace: 'main',
            category: 'Reading List'
        },
        {
            id: 'b-folder',
            title: 'Folder Bookmark',
            url: 'https://example.test/folder',
            workspace: 'main',
            category: 'Reading List',
            folderId: 'f_123'
        }
    ];
    const bookmarkFolders = {
        'main::Reading List': {
            nodes: [
                { id: 'f_123', name: 'Old Folder', parentId: '' }
            ]
        }
    };
    const windowObject = {
        EveOS: {},
        eveState: { config, links, bookmarkFolders },
        config,
        links,
        bookmarkFolders,
        saveDataCalls: [],
        saveConfigCalls: [],
        EveWorkspaceHelpers: createHelpers(),
        EveCategoryOrder: {
            getOrder(workspaceId) {
                return config.categoryOrderByWorkspace[workspaceId] || [];
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
        }
    };
}

function main() {
    const context = createContext();
    LINK_MODULE_PATHS.concat(PATCH_MODULE_PATHS).forEach((modulePath) => loadModule(context, modulePath));

    const linkApi = context.window.EveOS.NebulaJsonLink;
    const patchApi = context.window.EveOS.NebulaJsonPatch;
    assert(linkApi && patchApi, 'Nebula link and patch APIs should load');

    const cardLink = linkApi.createLink({ type: 'card', workspaceId: 'main', categoryName: 'Reading List' });
    const renameCard = patchApi.buildPatch('rename-card', cardLink, { name: 'Currently Reading' }, { source: 'smoke' });
    assert(patchApi.validatePatch(renameCard).valid, 'Card rename patch should validate');
    const renamePreview = patchApi.previewPatch(renameCard);
    assert(renamePreview.summary.includes('Reading List -> Currently Reading'), `Unexpected preview: ${renamePreview.summary}`);

    const renameResult = patchApi.applyPatch(renameCard, { persist: false, skipRender: true });
    assert(renameResult.ok && renameResult.applied, `Card rename should apply: ${JSON.stringify(renameResult)}`);
    assert(renameResult.preview.summary.includes('Reading List -> Currently Reading'), 'Apply result should keep pre-mutation preview');
    assert(context.window.links.every((link) => link.category === 'Currently Reading'), 'Links should move to renamed card');
    assert(context.window.bookmarkFolders['main::Currently Reading'], 'Folder scope should move to renamed card');
    assert(!context.window.bookmarkFolders['main::Reading List'], 'Old folder scope should be removed');
    assert(context.window.config.cardDescriptions['main::Currently Reading'] === 'Old card description.', 'Card description should move');
    assert(context.window.config.categoryOrderByWorkspace.main.includes('Currently Reading'), 'Category order should move');

    const duplicateLink = linkApi.createLink({ type: 'card', workspaceId: 'main', categoryName: 'Currently Reading' });
    const duplicatePatch = patchApi.buildPatch('rename-card', duplicateLink, { name: 'Archive' }, { source: 'smoke' });
    assert(!patchApi.validatePatch(duplicatePatch).valid, 'Duplicate card rename should be blocked');

    const folderLink = linkApi.createLink({ type: 'folder', workspaceId: 'main', categoryName: 'Currently Reading', folderId: 'f_123' });
    const folderPatch = patchApi.buildPatch('rename-folder', folderLink, { name: 'Renamed Folder' }, { source: 'smoke' });
    assert(patchApi.applyPatch(folderPatch, { persist: false, skipRender: true }).ok, 'Folder rename should apply');
    assert(context.window.bookmarkFolders['main::Currently Reading'].nodes[0].name === 'Renamed Folder', 'Folder name should update');

    const bookmarkLink = linkApi.createLink({ type: 'bookmark', workspaceId: 'main', categoryName: 'Currently Reading', bookmarkId: 'b-root' });
    const bookmarkPatch = patchApi.buildPatch('rename-bookmark', bookmarkLink, { title: 'Renamed Bookmark' }, { source: 'smoke' });
    assert(patchApi.applyPatch(bookmarkPatch, { persist: false, skipRender: true }).ok, 'Bookmark rename should apply');
    assert(context.window.links[0].title === 'Renamed Bookmark', 'Bookmark title should update');

    const mismatchedBookmarkLink = linkApi.createLink({ type: 'bookmark', workspaceId: 'main', categoryName: 'Archive', bookmarkId: 'b-root' });
    const mismatchedBookmarkPatch = patchApi.buildPatch('rename-bookmark', mismatchedBookmarkLink, { title: 'Should Not Apply' }, { source: 'smoke' });
    assert(!patchApi.validatePatch(mismatchedBookmarkPatch).valid, 'Bookmark patch should reject path mismatches');

    const descriptionPatch = patchApi.buildPatch('set-card-description', duplicateLink, { description: 'New description' }, { source: 'smoke' });
    assert(patchApi.applyPatch(descriptionPatch, { persist: false, skipRender: true }).ok, 'Description patch should apply');
    assert(context.window.config.cardDescriptions['main::Currently Reading'] === 'New description', 'Description should update');

    console.log('NEBULA_JSON_PATCH_SMOKE_OK');
}

main();
