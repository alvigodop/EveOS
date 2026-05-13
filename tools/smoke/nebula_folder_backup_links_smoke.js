const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULES = [
    'js/modules/features/search-advanced/sa-nebula-json-link.js',
    'js/modules/features/data-transfer/data-transfer.export.folder.writer.bookmarks.js',
    'js/modules/features/data-transfer/data-transfer.export.folder.writer.backups.js'
].map((relativePath) => path.join(REPO_ROOT, relativePath));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function loadModules(context) {
    MODULES.forEach((modulePath) => {
        const source = fs.readFileSync(modulePath, 'utf8');
        vm.runInNewContext(source, context, { filename: modulePath });
    });
}

function createHelpers(writes) {
    const deps = {
        buildWorkspaceFolderName(id) {
            return String(id || 'main');
        },
        buildCardFolderName(categoryName) {
            return String(categoryName || 'Unsorted').toLowerCase();
        },
        buildWorkspaceTreeForFullBackup() {
            return [];
        },
        buildWorkspaceListForFullBackup() {
            return [];
        },
        groupLinksByWorkspaceAndCategory() {
            return new Map();
        },
        findScopedCategoryData() {
            return { dataType: 'graphicNovels', entries: [] };
        },
        buildConnectionMap() {
            return new Map();
        },
        sortLinksForExport(links) {
            return (Array.isArray(links) ? links : []).slice();
        },
        sanitizePathSegment(value) {
            return String(value || '').replace(/[^a-z0-9_-]+/gi, '-');
        },
        shortHashHex() {
            return 'abc123';
        },
        getConnectionEntryId() {
            return '';
        },
        findLibraryEntryById() {
            return null;
        },
        buildBookmarkFileName(link) {
            return String(link?.id || 'bookmark') + '.json';
        }
    };
    const fsHelpers = {
        BACKUP_DIRS: {
            entries: 'entries',
            folders: 'folders',
            cards: 'cards',
            tabs: 'tabs',
            meta: 'meta',
            state: 'state',
            knowledge: 'knowledge'
        },
        async writeJsonFileToFolder(rootHandle, relativePath, payload) {
            writes.set(relativePath, payload);
        },
        async writeStoreMetaFiles(rootHandle, config) {
            return config || {};
        }
    };
    const treeHelpers = {
        normalizeClickBehaviorMode(value) {
            return value || 'open';
        },
        normalizeTaskMode(value) {
            return value || 'none';
        },
        buildFolderDirName(node) {
            return String(node?.id || 'folder');
        },
        getScopedFolderTree(folderTrees, workspaceId, categoryName) {
            return folderTrees[`${workspaceId}::${categoryName}`] || { nodes: [], settings: {} };
        },
        buildFolderChildrenMap(nodes) {
            const map = new Map();
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                const parentKey = node.parentId || '__root__';
                if (!map.has(parentKey)) map.set(parentKey, []);
                map.get(parentKey).push(node);
            });
            return map;
        },
        buildWorkspaceCardEntries() {
            return [];
        }
    };
    return { deps, fsHelpers, treeHelpers };
}

async function main() {
    const writes = new Map();
    const context = {
        window: {
            EveOS: {},
            EveDataTransfer: {},
            eveState: {
                config: {
                    workspaces: [{ id: 'main', name: 'Main', subTabs: [] }]
                },
                links: [],
                bookmarkFolders: {}
            }
        },
        console,
        encodeURIComponent,
        decodeURIComponent
    };
    context.window.window = context.window;
    loadModules(context);

    const { deps, fsHelpers, treeHelpers } = createHelpers(writes);
    const bookmarkHelpers = context.window.EveDataTransfer.ExportModules
        .createFolderWriterBookmarkHelpers(deps, fsHelpers, treeHelpers);
    const backupHelpers = context.window.EveDataTransfer.ExportModules
        .createFolderWriterBackupHelpers(deps, fsHelpers, treeHelpers, bookmarkHelpers);

    const links = [
        {
            id: 'b-root',
            title: 'Root Bookmark',
            url: 'https://example.test/root',
            workspace: 'main',
            category: 'Reading'
        },
        {
            id: 'b-folder',
            title: 'Folder Bookmark',
            url: 'https://example.test/folder',
            workspace: 'main',
            category: 'Reading',
            folderId: 'f_1'
        }
    ];
    const folderTrees = {
        'main::Reading': {
            nodes: [{ id: 'f_1', name: 'Folder One', parentId: '' }],
            settings: {}
        }
    };

    const written = await backupHelpers.writeScopedCardFolder(
        {},
        'cards/reading',
        'main',
        'Reading',
        links,
        {},
        new Map(),
        folderTrees
    );

    assert(written === 2, `Expected two written bookmarks, saw ${written}`);
    const card = writes.get('cards/reading/card.json');
    assert(card?.entityLink === 'eve://workspace/main/card/Reading', `Card entityLink missing: ${JSON.stringify(card)}`);

    const payloads = Array.from(writes.values());
    const folder = payloads.find((payload) => payload?.schema === 'eveos.bookmark-folder.v1');
    assert(folder?.entityLink === 'eve://workspace/main/card/Reading/folder/f_1', `Folder entityLink missing: ${JSON.stringify(folder)}`);

    const bookmarkLinks = payloads
        .filter((payload) => payload?.schema === 'eveos.bookmark.v1')
        .map((payload) => payload.entityLink)
        .sort();
    assert(
        bookmarkLinks.includes('eve://workspace/main/card/Reading/bookmark/b-root')
            && bookmarkLinks.includes('eve://workspace/main/card/Reading/folder/f_1/bookmark/b-folder'),
        `Bookmark entityLinks missing: ${JSON.stringify(bookmarkLinks)}`
    );

    console.log('NEBULA_FOLDER_BACKUP_LINKS_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
