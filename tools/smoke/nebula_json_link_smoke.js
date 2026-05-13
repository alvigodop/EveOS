const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'js/modules/features/search-advanced/sa-nebula-json-link.js');

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

function loadModule(context) {
    const source = fs.readFileSync(MODULE_PATH, 'utf8');
    vm.runInNewContext(source, context, { filename: MODULE_PATH });
    return context.window.EveOS.NebulaJsonLink;
}

function createContext() {
    const config = {
        activeWorkspace: 'main',
        workspaces: [{
            id: 'main',
            name: 'Main',
            icon: 'home',
            subTabs: [{
                id: 'child',
                name: 'Child Tab',
                icon: 'folder',
                subTabs: []
            }]
        }],
        cardDescriptions: {
            'main::Reading List': 'Main card for reading.'
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
                { id: 'f_parent', name: 'Renamed Parent Folder', parentId: '' },
                { id: 'f_123', name: 'Renamed Child Folder', parentId: 'f_parent' }
            ]
        }
    };
    const windowObject = {
        EveOS: {},
        eveState: { config, links, bookmarkFolders },
        config,
        links,
        bookmarkFolders,
        EveWorkspaceHelpers: createHelpers(),
        EveBookmarkFolders: {
            getScopedNodes(workspaceId, categoryName) {
                return bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [];
            },
            getFolderById(workspaceId, categoryName, folderId) {
                return (bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [])
                    .find((folder) => String(folder.id) === String(folderId)) || null;
            },
            buildFolderPathLabel(workspaceId, categoryName, folderId) {
                const nodes = bookmarkFolders[`${workspaceId}::${categoryName}`]?.nodes || [];
                const byId = new Map(nodes.map((folder) => [folder.id, folder]));
                const labels = [];
                let cursor = byId.get(folderId);
                while (cursor) {
                    labels.unshift(cursor.name);
                    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
                }
                return labels.join(' / ');
            }
        }
    };
    windowObject.window = windowObject;
    return {
        window: windowObject,
        console,
        encodeURIComponent,
        decodeURIComponent
    };
}

function main() {
    const context = createContext();
    const api = loadModule(context);

    assert(api, 'NebulaJsonLink API should load');

    const workspaceLink = api.createLink({ type: 'workspace', workspaceId: 'main' });
    assert(workspaceLink === 'eve://workspace/main', `Unexpected workspace link: ${workspaceLink}`);

    const cardLink = api.createLink({ type: 'card', workspaceId: 'main', categoryName: 'Reading List' });
    assert(cardLink === 'eve://workspace/main/card/Reading%20List', `Unexpected card link: ${cardLink}`);

    const folderLink = api.createLink({ type: 'folder', workspaceId: 'main', categoryName: 'Reading List', folderId: 'f_123' });
    assert(folderLink === 'eve://workspace/main/card/Reading%20List/folder/f_123', `Unexpected folder link: ${folderLink}`);

    const bookmarkLink = api.createLink(context.window.links[1]);
    assert(
        bookmarkLink === 'eve://workspace/main/card/Reading%20List/folder/f_123/bookmark/b-folder',
        `Unexpected bookmark link: ${bookmarkLink}`
    );

    const parsed = api.parseLink(bookmarkLink);
    assert(parsed.ok && parsed.type === 'bookmark', `Bookmark link should parse: ${JSON.stringify(parsed)}`);
    assert(parsed.categoryName === 'Reading List' && parsed.folderId === 'f_123', `Parsed path mismatch: ${JSON.stringify(parsed)}`);

    const folderResolution = api.resolveLink(folderLink);
    assert(folderResolution.ok && folderResolution.exists, `Folder link should resolve: ${JSON.stringify(folderResolution)}`);
    assert(
        folderResolution.path.folderPath === 'Renamed Parent Folder / Renamed Child Folder',
        `Folder ID should resolve renamed folder path: ${JSON.stringify(folderResolution.path)}`
    );

    const bookmarkResolution = api.resolveLink(bookmarkLink);
    assert(bookmarkResolution.ok && bookmarkResolution.exists, `Bookmark link should resolve: ${JSON.stringify(bookmarkResolution)}`);
    assert(bookmarkResolution.path.breadcrumbLabel.includes('Folder Bookmark'), `Breadcrumb should include bookmark title: ${bookmarkResolution.path.breadcrumbLabel}`);
    assert(bookmarkResolution.health.state === 'healthy', `Expected healthy bookmark: ${JSON.stringify(bookmarkResolution.health)}`);

    const mismatchedBookmark = api.validateLink('eve://workspace/main/card/Reading%20List/folder/f_missing/bookmark/b-folder');
    assert(!mismatchedBookmark.valid, `Missing folder should invalidate link: ${JSON.stringify(mismatchedBookmark)}`);
    assert(
        mismatchedBookmark.errors.includes('folder_missing') || mismatchedBookmark.errors.includes('bookmark_folder_mismatch'),
        `Expected folder mismatch/missing error: ${JSON.stringify(mismatchedBookmark)}`
    );

    const malformed = api.validateLink('https://workspace/main');
    assert(!malformed.valid && malformed.errors.includes('invalid_scheme'), `Malformed scheme should fail: ${JSON.stringify(malformed)}`);

    console.log('NEBULA_JSON_LINK_SMOKE_OK');
}

main();
