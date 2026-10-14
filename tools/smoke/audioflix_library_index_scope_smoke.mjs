import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let titleReads = 0, revision = 1;
const music = Array.from({ length: 25000 }, (_, i) => ({ id: `index-${i}`,
    get title() { titleReads += 1; return `Track ${i}`; }, artist: `Artist ${i % 100}`,
    album: 'Indexed Album', folder: i % 2 ? 'Upper' : 'upper', playlistId: `playlist-${i % 20}`,
    sourceProvider: 'fixture', sourceMediaType: 'track', sourceMediaId: String(i), volume: .2 }));
const state = { music, soundboard: [], dupDismissedPairs: [], musicGroups: ['Root', 'Child'], musicGroupParents: { Child: 'Root' },
    musicGroupMap: { 'index-0': ['rOoT'], 'index-1': ['child'], 'index-2': ['Root'] } };
const window = { EveAudioflixState: { ensure: () => state, getRevision: () => revision } };
const context = vm.createContext({ window, console });
for (const file of ['audioflix.state.schema.js', 'audioflix.library.index.js', 'audioflix.state.duplicates.js', 'audioflix.groups.tree.js', 'audioflix.nexus.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/features/audioflix', file), 'utf8'), context);
}
const library = window.EveAudioflixLibraryIndex, X = window.EveAudioflixNexus, D = window.EveAudioflixDuplicates;
const view = library.get(state, 'music');
const upperScope = view.scope('folder', 'Upper');
assert.equal(upperScope.length, 12500);
assert.equal(view.scope('folder', 'Upper'), upperScope, 'Repeated indexed scope reads keep stable array identity');
assert.ok(Object.isFrozen(upperScope), 'Cached scope arrays are immutable derived projections');
assert.equal(view.scope('folder', 'upper').length, 12500);
assert.equal(view.scope('playlist', 'playlist-3').length, 1250);
assert.equal(view.scope('artist', 'Artist 7').length, 250);
assert.equal(view.getById('index-24999'), music.at(-1));
assert.equal(view.scope('group', 'ROOT')[0], music[0]);
assert.deepEqual(Array.from(window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', music), item => item.id), ['index-0', 'index-1', 'index-2']);
const extra = { id: 'foreign', title: 'Foreign', album: 'Only Foreign Album', sourceProvider: 'foreign-provider' };
state.musicGroupMap.foreign = ['CHILD'];
assert.deepEqual(Array.from(window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', [extra, music[2], music[0]]), item => item.id), ['foreign', 'index-2', 'index-0']);
const docs = view.docs();
assert.ok(Object.isFrozen(docs) && Object.isFrozen(docs[0]));
const indexedBounded = view.search('indexed album', 80);
assert.equal(indexedBounded.total, 25000);
assert.equal(indexedBounded.items.length, 80);
assert.deepEqual(Array.from(indexedBounded.items.slice(0, 3), item => item.id), ['index-0', 'index-1', 'index-2']);
// Bulk sync/restore often replaces the array object while retaining almost every canonical item.
// That source swap must reconcile existing rows rather than normalizing all 25k tracks again.
const bulkTransient = { id: 'bulk-transient', title: 'Transient', artist: 'Transient', album: 'Indexed Album',
    folder: 'Upper', playlistId: 'playlist-transient', sourceProvider: 'fixture', sourceMediaType: 'track', sourceMediaId: 'bulk-transient' };
state.music = music.concat(bulkTransient); titleReads = 0; library.invalidate(state);
assert.equal(library.get(state, 'music'), view, 'Bulk source growth preserves the existing index API');
assert.equal(view.getById('bulk-transient'), bulkTransient);
assert.equal(titleReads, 0, 'Bulk source growth describes only true additions, not all retained rows');
state.music = music; library.invalidate(state);
assert.equal(library.get(state, 'music'), view, 'Bulk source restore preserves the existing index API');
assert.equal(view.search('indexed album', 80).total, 25000);
assert.equal(titleReads, 0, 'Bulk source restore reuses retained normalized rows without a 25k rebuild');
const bounded = X.filterWindow({ type: 'music', query: 'indexed album' }, 80);
assert.equal(bounded.total, 25000);
assert.equal(bounded.items.length, 80);
assert.deepEqual(Array.from(bounded.items.slice(0, 3), item => item.id), ['index-0', 'index-1', 'index-2']);
assert.equal(X.filter({ type: 'music', query: 'indexed album' }).length, 25000, 'Full filter contract remains unchanged');
window.EveAudioflixNexusUi.create = () => ({ renderResults: () => {
    const list = X.filter({ type: 'music', query: 'indexed album' });
    return { total: list.length, shown: list.slice(0, 80).filter(Boolean).length };
} });
const boundedUi = window.EveAudioflixNexusUi.create({}).renderResults('music');
assert.deepEqual(Array.from(Object.entries(boundedUi)), [['total', 25000], ['shown', 80]]);
assert.equal(X.filter({ type: 'music', query: 'indexed album' }).length, 25000, 'Live render restores full filter immediately');
// Card-window paging is a presentation bound only; queues/search retain the full canonical scope.
context.document = { addEventListener() {} };
vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/features/audioflix/audioflix.ui.window.js'), 'utf8'), context);
const cardWindow = window.EveAudioflixUiWindow.create({
    esc: value => String(value), renderCard: item => `<i data-window-card="${item.id}"></i>`,
    itemsForKey: () => null, afterMount: () => {}
});
const windowItems = Array.from({ length: 100 }, (_, index) => ({ id: `window-${index}` }));
const windowMarkup = cardWindow.render(windowItems, 'window-test', 'music');
assert.equal(cardWindow.diagnostics().pageSize, 40, 'Live music card window remains capped at forty cards');
assert.equal((windowMarkup.match(/data-window-card=/g) || []).length, 40, 'Paged render mounts only forty canonical items at once');
titleReads = 0;
for (let i = 0; i < 20; i += 1) { music[0].volume = i / 20; revision += 1; X.search('indexed album', 'music'); }
assert.equal(titleReads, 0, 'Volume/global revisions must not rebuild normalized search text');
assert.equal(X.search('only foreign album', 'music', [extra]).length, 1);
assert.equal(X.search('foreign-provider', 'music', [extra]).length, 1);
const searchRepairPosition = 100;
const searchReplacement = { ...music[searchRepairPosition], title: 'Silent Search Repair' };
music[searchRepairPosition] = searchReplacement;
const repairedSearch = view.search('silent search repair', 80);
assert.equal(repairedSearch.total, 1, 'Indexed search repairs a silent same-length replacement on its first query');
assert.equal(repairedSearch.items[0], searchReplacement);
const before = view.contentRevision;
const changed = { ...music[0], title: 'Edited', folder: 'Moved' };
music[0] = changed; library.upsert(state, 'music', changed, docs[0].item);
assert.ok(view.contentRevision > before);
assert.notEqual(view.scope('folder', 'Upper'), upperScope, 'Content revision invalidates cached scope identity');
assert.equal(view.scope('folder', 'Moved')[0], changed);
assert.equal(view.scope('folder', 'upper').length, 12499);
assert.equal(X.search('edited', 'music', [changed])[0], changed);
// Same-length replacement without a notification is repaired on the FIRST indexed scope query.
const cachedUpper = view.scope('folder', 'Upper');
const upperPosition = music.findIndex(item => item.folder === 'Upper');
const silentReplacement = { ...music[upperPosition], title: 'Silent Replacement' };
music[upperPosition] = silentReplacement;
assert.equal(view.scope('folder', 'Upper')[0], silentReplacement);
assert.notEqual(view.scope('folder', 'Upper'), cachedUpper, 'Repair replaces stale cached scope identity');
// Group membership retains the same first-query repair guarantee.
window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', music);
const replaced = { ...music[1], title: 'Replacement' }; music[1] = replaced;
assert.equal(window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', music)[1], replaced);
const id = '4cOdK2wGLETKBW3PvgPWqT';
for (const type of ['track', 'episode']) {
    const item = { id: `typed-${type}`, title: type, sourceProvider: 'spotify',
        sourceMediaType: type, sourceMediaId: id, sourceUri: `spotify:${type}:${id}` };
    music.push(item); library.upsert(state, 'music', item);
}
assert.equal(view.scope('identity', `spotify:track:${id}`)[0].id, 'typed-track');
assert.equal(view.scope('identity', `spotify:episode:${id}`)[0].id, 'typed-episode');
assert.equal(view.scope('identity', `spotify:track:${id.toLowerCase()}`).length, 0);
// Card badges get a compact content-revision cache: unrelated durable/global revisions may read the
// target card itself, but they must never rescan all 25k titles. Real content edits still invalidate.
titleReads = 0;
const badgeTarget = 'index-24999';
assert.equal(D.duplicateLevelFor('music', badgeTarget), '');
const badgeWarmReads = titleReads;
assert.ok(badgeWarmReads > 20000, 'First badge lookup scans the current library exactly as a cold content revision');
for (let i = 0; i < 20; i += 1) { revision += 1; D.duplicateLevelFor('music', badgeTarget); }
assert.equal(titleReads - badgeWarmReads, 20, 'Global revisions only reread the requested badge item; they never rebuild the 25k badge scan');
const duplicatePosition = 1000, duplicatePrevious = music[duplicatePosition];
const duplicateItem = { ...duplicatePrevious, title: 'Track 24999' };
music[duplicatePosition] = duplicateItem; library.upsert(state, 'music', duplicateItem, duplicatePrevious);
const beforeBadgeRebuild = titleReads;
assert.equal(D.duplicateLevelFor('music', badgeTarget), 'soft');
assert.ok(titleReads - beforeBadgeRebuild > 20000, 'Content revision invalidates and rebuilds the compact badge index');
const summaryReads = titleReads, duplicateSummary = D.duplicateBadgeSummary('music');
assert.equal(duplicateSummary.any, true);
assert.equal(duplicateSummary.soft, true);
assert.equal(duplicateSummary.hard, false);
assert.equal(titleReads, summaryReads, 'Default Nexus duplicate summary reuses compact collision buckets without a 25k rescan');
state.dupDismissedPairs = ['index-1000|index-24999'];
assert.equal(D.duplicateLevelFor('music', badgeTarget), '', 'Keep-both dismissal updates without rebuilding library content');
assert.equal(D.duplicateBadgeSummary('music').any, false, 'Keep-both dismissal immediately clears the compact Nexus duplicate summary');
console.log('AUDIOFLIX_LIBRARY_INDEX_SCOPE_SMOKE_OK size=25000 scopes=true scopeIdentity=true incremental=true searchCached=true indexedSearch=true boundedNexus=80/25000 cardWindow=40 typed=true firstQueryRepair=true duplicateBadges=true duplicateSummary=true bulkReconcile=true');
