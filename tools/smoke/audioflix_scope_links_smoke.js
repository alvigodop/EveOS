/**
 * Canonical Audioflix reference guard:
 * - scope bindings contain IDs, not duplicated media.
 * - effective and direct bookmark captures remain distinct.
 * - Matrix captures, pending targets, dedupe, unlink, and deletion cleanup work.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const run = (ctx, rel) => vm.runInNewContext(
    fs.readFileSync(path.join(root, rel), 'utf8'),
    ctx,
    { filename: rel }
);
const assert = (condition, message) => {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
};

function makeContext() {
    const config = {
        activeWorkspace: 'main',
        workspaces: [{ id: 'main', name: 'Main', subTabs: [] }],
        audioflix: {
            music: [
                { id: 'tab-track', title: 'Tab Track', url: 'https://audio.example/tab' },
                { id: 'card-track', title: 'Card Track', url: 'https://audio.example/card' },
                { id: 'folder-track', title: 'Folder Track', localPath: 'C:/Music/folder.mp3' },
                { id: 'bookmark-track', title: 'Bookmark Track', url: 'https://audio.example/bookmark' }
            ],
            soundboard: [{ id: 'clip-one', title: 'Clip One', url: 'media/clip.wav' }]
        }
    };
    const window = {
        eveState: { config },
        addEventListener() {},
        dispatchEvent() {},
        setTimeout() { return 1; },
        clearTimeout() {}
    };
    window.window = window;
    return {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map,
        config, window,
        localStorage: { getItem() { return null; }, setItem() {} },
        CustomEvent: function CustomEvent() {}
    };
}

(async function main() {
    const ctx = makeContext();
    run(ctx, 'js/modules/features/audioflix/audioflix.state.schema.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.state.groups.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.state.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.links.js');
    const links = ctx.window.EveAudioflixLinks;
    const store = ctx.window.EveAudioflixState;

    const tab = { scopeType: 'workspace', workspaceId: 'main' };
    const card = { scopeType: 'card', workspaceId: 'main', categoryName: 'Reading' };
    const folder = { scopeType: 'folder', workspaceId: 'main', categoryName: 'Reading', folderId: 'folder-1' };
    const bookmark = {
        scopeType: 'bookmark',
        workspaceId: 'main',
        categoryName: 'Reading',
        folderId: 'folder-1',
        bookmarkId: 'bookmark-1',
        label: 'Example Bookmark'
    };

    const originalDateNow = ctx.Date.now;
    ctx.Date.now = () => 1785000000000;
    assert(links.add('tab-track', tab, 'music').added === 1, 'tab reference was not added');
    assert(links.add('card-track', card, 'music').added === 1, 'card reference was not added');
    assert(links.add('folder-track', folder, 'music').added === 1, 'folder reference was not added');
    assert(links.add('bookmark-track', bookmark, 'music').added === 1, 'bookmark reference was not added');
    assert(links.add('clip-one', bookmark, 'sound').added === 1, 'soundboard reference was not added');
    ctx.Date.now = originalDateNow;
    assert(links.add('bookmark-track', bookmark, 'music').added === 0, 'duplicate reference was added');

    const bindings = store.ensure().scopeBindings;
    assert(bindings.length === 5, 'unexpected binding count');
    assert(new Set(bindings.map((binding) => binding.id)).size === bindings.length, 'same-timestamp bindings reused an ID');
    assert(bindings.every((binding) => !('url' in binding) && !('localPath' in binding)), 'binding duplicated media metadata');

    const direct = links.captureForScope(bookmark, { directOnly: true });
    assert(direct.count === 2, 'direct bookmark capture included inherited references');
    const effective = links.captureForScope(bookmark);
    assert(effective.count === 5, 'effective bookmark capture did not include parent-scope references');
    assert(effective.items.some((item) => item.localized), 'localized status was not derived from the canonical item');

    const matrix = links.captureForMatrixSnapshot({
        scope: { scope: 'all', workspaceIds: ['main'] },
        workspaces: [{ id: 'main' }],
        cards: [{ workspaceId: 'main', name: 'Reading' }],
        folders: [{ workspaceId: 'main', category: 'Reading', sourceId: 'folder-1' }],
        bookmarks: [{ id: 'bookmark-1', sourceId: 'bookmark-1' }]
    });
    assert(matrix.count === 5, 'Matrix snapshot did not resolve scoped Audioflix references');
    assert(matrix.items.every((item) => !('url' in item) && !('localPath' in item)), 'Matrix snapshot copied media paths');

    links.setPendingScope(bookmark);
    assert(links.inferCurrentScope().bookmarkId === 'bookmark-1', 'pending bookmark target was not preferred');
    links.clearPendingScope();
    assert(links.inferCurrentScope().scopeType === 'workspace', 'pending bookmark target was not cleared');

    assert(links.remove('bookmark-track', bookmark, 'music').removed === 1, 'bookmark unlink failed');
    store.removeItem('sound', 'clip-one');
    assert(store.ensure().scopeBindings.every((binding) => binding.audioId !== 'clip-one'), 'item deletion left a dangling binding');

    // Nexus UI actions & bulk organizer verification
    run(ctx, 'js/modules/features/audioflix/audioflix.nexus.bulk.ui.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.ui.actions.nexus.js');
    const bulkUi = ctx.window.EveAudioflixNexusBulkUi.create({
        esc: (v) => String(v ?? ''),
        getNexusState: () => ({ bulk: {}, selectedIds: ['tab-track'] })
    });
    const bulkHtml = bulkUi.render('music', 1);
    assert(bulkHtml.includes('data-af-linked-count'), 'bulk organizer missing linked count');

    const toasts = [];
    ctx.window.showToast = (msg, type) => toasts.push({ msg, type });
    let rerendered = false;
    // tab-track is already linked from earlier in the test; unlinking it first gives us a clean slate
    const actionCtx = {
        nexusState: { selectedIds: ['tab-track'] },
        playbackStatus: '',
        rerender() { rerendered = true; }
    };
    const actionHandler = ctx.window.EveAudioflixUiActionsNexus.create(actionCtx);
    const handledUnlinkFirst = await actionHandler(null, 'nexus-unlink-scope');
    assert(handledUnlinkFirst === true, 'nexus-unlink-scope was not handled');
    assert(toasts.length === 1 && toasts[0].type === 'success', 'initial unlink toast was not fired');

    actionCtx.nexusState.selectedIds = ['tab-track'];
    const handledLink = await actionHandler(null, 'nexus-link-scope');
    assert(handledLink === true, 'nexus-link-scope was not handled');
    assert(toasts.length === 2 && toasts[1].type === 'success', 'nexus-link-scope toast was not fired');
    assert(actionCtx.nexusState.selectedIds.length === 0, 'selection was not cleared on successful link');

    actionCtx.nexusState.selectedIds = ['tab-track'];
    const duplicateAttach = await actionHandler(null, 'nexus-link-scope');
    assert(toasts.length === 3 && toasts[2].type === 'info', 'duplicate link info toast was not fired');

    actionCtx.nexusState.selectedIds = [];
    const emptyAttach = await actionHandler(null, 'nexus-link-scope');
    assert(toasts.length === 4 && toasts[3].type === 'warning', 'empty selection toast was not fired');

    actionCtx.nexusState.selectedIds = ['tab-track'];
    const handledUnlink = await actionHandler(null, 'nexus-unlink-scope');
    assert(handledUnlink === true, 'nexus-unlink-scope was not handled');
    assert(toasts.length === 5 && toasts[4].type === 'success', 'nexus-unlink-scope toast was not fired');

    // Bulk organize with implicit default action (Add to)
    run(ctx, 'js/modules/features/audioflix/audioflix.bulk.js');
    actionCtx.nexusState = {
        selectedIds: ['tab-track'],
        bulk: { group: 'Temp-Roblox-Play' }
    };
    const handledBulk = await actionHandler(null, 'nexus-apply-bulk');
    assert(handledBulk === true, 'nexus-apply-bulk was not handled');
    assert(toasts.length === 6 && toasts[5].type === 'success', 'bulk apply toast was not fired');
    assert(actionCtx.nexusState.selectedIds.length === 0, 'selection was not cleared on bulk apply');
    assert(store.ensure().musicGroupMap['tab-track']?.includes('Temp-Roblox-Play'), 'group was not added to track');

    console.log('AUDIOFLIX_SCOPE_LINKS_SMOKE_OK');
})();
