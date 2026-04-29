const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'js/modules/features/bookmark-merge-heuristics.js');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function installRuntime() {
    const entries = new Map();
    let connections = [];
    const syncCalls = [];

    global.CustomEvent = function CustomEvent(name, options) {
        this.type = name;
        this.detail = options?.detail || null;
    };
    global.window = {
        eveState: {
            links: []
        },
        dispatchEvent() {},
        EveLibrary: {
            ConnectionsAPI: {
                getAll() {
                    return connections;
                },
                getLinkedEntry(linkId) {
                    const conn = connections.find((item) => String(item.linkId) === String(linkId));
                    if (!conn) return null;
                    const entry = entries.get(conn.libraryEntryId);
                    if (!entry) return null;
                    return { connection: { ...conn }, entry: clone(entry) };
                },
                promoteLinkWithData(linkId, patch) {
                    const existing = connections.find((item) => String(item.linkId) === String(linkId));
                    if (existing) return existing;
                    const entryId = `entry-${linkId}`;
                    const entry = {
                        id: entryId,
                        title: patch.title || 'Untitled',
                        sourceUrl: patch.sourceUrl || '',
                        mediaTypes: patch.mediaTypes || ['graphicNovels'],
                        summary: patch.summary || '',
                        chapter: patch.chapter || 0,
                        season: patch.season || 0,
                        episode: patch.episode || 0,
                        status: patch.status || '',
                        rating: patch.rating || ''
                    };
                    entries.set(entryId, entry);
                    const conn = {
                        id: `conn-${linkId}`,
                        linkId: String(linkId),
                        libraryEntryId: entryId,
                        categoryName: 'Target',
                        workspace: 'main'
                    };
                    connections.push(conn);
                    return conn;
                },
                updateLinkedEntry(linkId, patch) {
                    const conn = connections.find((item) => String(item.linkId) === String(linkId));
                    if (!conn) return false;
                    const entry = entries.get(conn.libraryEntryId);
                    Object.assign(entry, clone(patch));
                    return true;
                },
                unlinkLink(linkId, removeEntry) {
                    const conn = connections.find((item) => String(item.linkId) === String(linkId));
                    connections = connections.filter((item) => String(item.linkId) !== String(linkId));
                    if (removeEntry && conn) entries.delete(conn.libraryEntryId);
                    return true;
                },
                removeByLinkId(linkId) {
                    connections = connections.filter((item) => String(item.linkId) !== String(linkId));
                },
                syncFromLink(linkId) {
                    syncCalls.push(String(linkId));
                }
            }
        }
    };
    window.getLiveLinks = () => window.eveState.links;
    window.setLiveLinks = (nextLinks) => {
        window.eveState.links = nextLinks;
        return nextLinks;
    };

    function linkEntry(linkId, entry) {
        const entryId = `entry-${linkId}`;
        entries.set(entryId, { id: entryId, ...clone(entry) });
        connections.push({
            id: `conn-${linkId}`,
            linkId: String(linkId),
            libraryEntryId: entryId,
            categoryName: 'Source',
            workspace: 'main'
        });
    }

    eval(fs.readFileSync(MODULE_PATH, 'utf8'));

    return { entries, get connections() { return connections; }, linkEntry, syncCalls };
}

function resetLinks(links) {
    window.eveState.links = links.map(clone);
}

function findLink(id) {
    return window.eveState.links.find((link) => String(link.id) === String(id));
}

function runBothLinkedCase() {
    const runtime = installRuntime();
    resetLinks([
        { id: 'target', title: 'Amazing Worlds', url: 'https://example.test/amazing', workspace: 'main', category: 'Target' },
        { id: 'source', title: 'Amazing Worlds', url: 'https://example.test/amazing/', workspace: 'main', category: 'Source' }
    ]);
    runtime.linkEntry('target', { title: 'Current Library', sourceUrl: 'https://example.test/amazing', chapter: 42, status: 'Reading', summary: 'current' });
    runtime.linkEntry('source', { title: 'Old Library', sourceUrl: 'https://old.test/amazing', chapter: 7, status: 'Old', summary: 'old summary' });

    const result = window.EveBookmarkMerge.moveOrMergeLinkToScope(findLink('source'), { workspaceId: 'main', categoryName: 'Target' });
    const target = findLink('target');
    const targetEntry = window.EveLibrary.ConnectionsAPI.getLinkedEntry('target').entry;

    assert(result.merged, 'both-linked case should merge');
    assert(!findLink('source'), 'source bookmark should be removed');
    assert(target.title === 'Amazing Worlds', 'target title should be preserved');
    assert(target.url === 'https://example.test/amazing', 'target URL should be preserved');
    assert(targetEntry.chapter === 42, 'target linked-library progress should not be overwritten');
    assert(String(target.notes || '').includes('Incoming Linked Library Snapshot'), 'source library snapshot should go to notes');
    assert(String(target.notes || '').includes('chapter: 7'), 'source chapter should be preserved in notes');
}

function runSourceLinkedInjectionCase() {
    const runtime = installRuntime();
    resetLinks([
        { id: 'target', title: 'Destination Title', url: 'https://destination.test/title', workspace: 'main', category: 'Target' },
        { id: 'source', title: 'Source Title', url: 'https://destination.test/title/', workspace: 'main', category: 'Source' }
    ]);
    runtime.linkEntry('source', { title: 'Source Library', sourceUrl: 'https://destination.test/title/', season: 2, episode: 5, mediaTypes: ['films'], summary: 'source summary' });

    const result = window.EveBookmarkMerge.moveOrMergeLinkToScope(findLink('source'), { workspaceId: 'main', categoryName: 'Target' });
    const target = findLink('target');
    const targetEntry = window.EveLibrary.ConnectionsAPI.getLinkedEntry('target').entry;

    assert(result.merged, 'source-linked case should merge');
    assert(targetEntry.title === 'Destination Title', 'injected entry should keep destination title');
    assert(targetEntry.sourceUrl === 'https://destination.test/title', 'injected entry should keep destination URL');
    assert(targetEntry.season === 2 && targetEntry.episode === 5, 'source linked-library fields should be injected');
    assert(String(target.notes || '').includes('Incoming Title: Source Title'), 'source identity should be preserved in notes');
}

function runTargetLinkedSourcePlainCase() {
    const runtime = installRuntime();
    resetLinks([
        { id: 'target', title: 'Target Same', url: 'https://same.test/item', workspace: 'main', category: 'Target' },
        { id: 'source', title: 'Target Same', url: 'https://same.test/item?old=1', workspace: 'main', category: 'Source', notes: 'plain source note' }
    ]);
    runtime.linkEntry('target', { title: 'Target Library', sourceUrl: 'https://same.test/item', chapter: 13, status: 'Reading' });

    const result = window.EveBookmarkMerge.moveOrMergeLinkToScope(findLink('source'), { workspaceId: 'main', categoryName: 'Target' });
    const target = findLink('target');
    const targetEntry = window.EveLibrary.ConnectionsAPI.getLinkedEntry('target').entry;

    assert(result.merged, 'target-linked/plain-source case should merge');
    assert(targetEntry.chapter === 13, 'target linked entry should remain unchanged');
    assert(String(target.notes || '').includes('plain source note'), 'plain source notes should be appended');
    assert(String(target.notes || '').includes('Incoming URL: https://same.test/item?old=1'), 'plain source URL should be preserved');
}

function runBothPlainPromotionCase() {
    installRuntime();
    resetLinks([
        { id: 'target', title: 'Plain Same', url: 'https://plain.test/item', workspace: 'main', category: 'Target' },
        { id: 'source', title: 'Plain Same', url: 'https://plain.test/item#old', workspace: 'main', category: 'Source', priority: 'high' }
    ]);

    const result = window.EveBookmarkMerge.moveOrMergeLinkToScope(findLink('source'), { workspaceId: 'main', categoryName: 'Target' });
    const target = findLink('target');
    const targetEntry = window.EveLibrary.ConnectionsAPI.getLinkedEntry('target').entry;

    assert(result.merged, 'plain/plain case should merge');
    assert(targetEntry, 'plain destination should be promoted into a linked-library bookmark');
    assert(targetEntry.title === 'Plain Same', 'promoted entry should keep destination title');
    assert(String(target.notes || '').includes('Neither bookmark had linked-library data'), 'promotion rule should be recorded in notes');
    assert(target.priority === 'high', 'non-conflicting bookmark fields should be merged');
}

function runDuplicateGroupCase() {
    const runtime = installRuntime();
    resetLinks([
        { id: 'target', title: 'Group Same', url: 'https://group.test/item?canonical=1', workspace: 'main', category: 'Target' },
        { id: 'source', title: 'Group Same', url: 'https://group.test/item/', workspace: 'main', category: 'Target' }
    ]);
    runtime.linkEntry('target', { title: 'Group Library', sourceUrl: 'https://group.test/item?canonical=1', chapter: 20 });
    runtime.linkEntry('source', { title: 'Old Group Library', sourceUrl: 'https://group.test/item-old', chapter: 4 });

    const result = window.EveBookmarkMerge.mergeDuplicateGroup(['target', 'source']);
    const target = findLink('target');
    const targetEntry = window.EveLibrary.ConnectionsAPI.getLinkedEntry('target').entry;

    assert(result.removedIds.includes('source'), 'duplicate group should remove source duplicate');
    assert(window.eveState.links.length === 1, 'duplicate group should leave one bookmark');
    assert(targetEntry.chapter === 20, 'duplicate group should not overwrite target linked entry');
    assert(String(target.notes || '').includes('chapter: 4'), 'duplicate group should preserve incoming linked data in notes');
}

runBothLinkedCase();
runSourceLinkedInjectionCase();
runTargetLinkedSourcePlainCase();
runBothPlainPromotionCase();
runDuplicateGroupCase();

console.log('BOOKMARK_MERGE_HEURISTICS_SMOKE_OK');
