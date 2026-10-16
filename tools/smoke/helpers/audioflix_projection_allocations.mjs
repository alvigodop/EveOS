import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

function fixture(root) {
    const state = { music: [], soundboard: [], musicGroups: [], musicGroupMap: {}, musicFolders: [], musicViewMode: 'frontend' };
    const counts = { stateReads: 0, groupLookups: 0, groupScopes: 0 }, storage = new Map();
    let revision = 1, owner, treeEntries;
    const stop = new Error('captured-production-render-owner');
    const window = { EveAudioflixUiShared: { ready: true },
        EveAudioflixState: { ensure: () => { counts.stateReads++; return state; }, getRevision: () => revision },
        EveAudioflixQueueCompletion: { createRuntime: () => ({}) },
        EveAudioflixUiRender: { create: context => { owner = context; throw stop; } },
        EveAudioflixUiWindow: { create: () => ({ render: () => '<cards></cards>', attrs: () => '' }) } };
    for (const name of ['UiLocalize', 'NexusUi', 'ClassifiersUi', 'UiModal', 'UiOverlay', 'UiPicker'])
        window[`EveAudioflix${name}`] = { create: () => ({}) };
    window.EveAudioflixClassifiersUi.create = () => ({ renderFrontendRow: () => '' });
    const context = vm.createContext({ window, console,
        document: { getElementById: () => ({}), addEventListener() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/features/audioflix', file), 'utf8'), context, { filename: file });
    // Run the complete production UI owner up to its normal render-factory handoff. No source extraction.
    assert.throws(() => load('audioflix.ui.js'), error => error === stop);
    assert.equal(typeof owner.isItemExposed, 'function');
    for (const file of ['audioflix.library.index.js', 'audioflix.groups.tree.js', 'audioflix.ui.group-tree.js', 'audioflix.ui.render.js']) load(file);
    const groupsOf = owner.groupsOf;
    owner.groupsOf = (...args) => { counts.groupLookups++; return groupsOf(...args); };
    const index = window.EveAudioflixLibraryIndex, get = index.get, facades = new WeakMap();
    index.get = (...args) => {
        const view = get(...args);
        if (!facades.has(view)) facades.set(view, { ...view,
            scope: (...values) => { if (values[0] === 'group') counts.groupScopes++; return view.scope(...values); },
            get contentRevision() { return view.contentRevision; } });
        return facades.get(view);
    };
    const selector = window.EveAudioflixGroupTreeUi.renderSelector;
    window.EveAudioflixGroupTreeUi.renderSelector = options => { treeEntries = options.entries; return selector(options); };
    const render = window.EveAudioflixUiRender.create(owner);
    return { state, counts, owner, render, index, tree: () => treeEntries,
        reset() { for (const key of Object.keys(counts)) counts[key] = 0; },
        replace(patch) { Object.assign(state, patch); revision++; index.invalidate(state, 'music'); } };
}

const ids = items => Array.from(items, item => item.id).join(',');

export function qualifyProjectionAllocations(root, checks) {
    const f = fixture(root), evidence = {};
    const music = Array.from({ length: 25000 }, (_, index) => ({ id: `allocation-${index}`, title: `Track ${index}`,
        exposed: true, folder: 'All', artist: 'Fixture' }));
    f.replace({ music }); f.reset();
    assert.ok(music.every(item => f.owner.isItemExposed(item, 'music')));
    assert.equal(f.counts.stateReads, 0, 'Explicitly exposed music must not read state or group membership per record');
    assert.equal(f.owner.allGroups('music').length, 0, 'The synthetic empty registry has no implicit group names');
    f.reset();
    const empty = f.render.frontendGroupEntries('music', music);
    assert.equal(empty.length, 1); assert.equal(empty[0][0], 'Ungrouped');
    assert.equal(empty[0][1], music, 'Empty registered groups reuse the existing items rather than allocate a filtered copy');
    assert.equal(f.counts.groupLookups, 0, 'Empty registered groups must avoid all 25k groupsOf calls');
    evidence.emptyRegistry = { items: music.length, exposedStateReads: 0, groupLookups: f.counts.groupLookups };
    checks.push('exposed-music-short-circuits-state-reads-and-empty-registry-reuses-items');

    const tracks = [
        { id: 'a', title: 'A', exposed: true, folder: 'North' },
        { id: 'b', title: 'B', exposed: true, folder: 'South' },
        { id: 'c', title: 'C', exposed: false, folder: 'North' },
        { id: 'hidden', title: 'Hidden', exposed: false, folder: 'North' },
        { id: 'loose', title: 'Loose', exposed: true, folder: 'North' }
    ];
    f.replace({ music: tracks, musicGroups: ['Parent', 'Child', 'Other'], musicGroupParents: { Child: 'Parent' },
        musicGroupMap: { a: ['Child'], b: ['Parent'], c: ['Child'], hidden: ['Missing'] }, musicFolders: ['North', 'South'] });
    f.reset(); f.render.renderFrontendMusicActive();
    assert.equal(f.counts.groupScopes, 4, 'Parent/Child/Other resolve memberships once, including the parent descendant union');
    assert.equal(f.counts.groupLookups, 4, 'Registered groups must retain the Ungrouped membership lookup for every exposed track');
    const first = f.tree();
    assert.equal(JSON.stringify(Array.from(first, entry => ({ name: entry.name, depth: entry.depth, path: Array.from(entry.path), ids: ids(entry.members) }))),
        JSON.stringify([{ name: 'Parent', depth: 0, path: ['Parent'], ids: 'a,b,c' },
            { name: 'Child', depth: 1, path: ['Parent', 'Child'], ids: 'a,c' }, { name: 'Ungrouped', depth: 0, path: ['Ungrouped'], ids: 'loose' }]));
    const projection = f.render.frontendActiveGroup('music');
    assert.equal(ids(projection.items), 'a,b,c,loose', 'Registered membership still exposes tracks without the explicit exposed flag');
    for (const entry of first.filter(entry => entry.name !== 'Ungrouped'))
        assert.equal(entry.members, projection.entries.find(([name]) => name === entry.name)[1], 'Selector reuses the exact computed membership array');
    evidence.nestedGroups = { groupScopes: f.counts.groupScopes, groupLookups: f.counts.groupLookups };
    checks.push('nested-selector-reuses-computed-members-once-with-canonical-order-and-path');

    f.state.activeMusicFolderScope = 'North';
    assert.equal(ids(f.render.frontendActiveGroup('music').items), 'a,c,loose');
    const previous = f.render.frontendActiveGroup('music');
    tracks[0].title = 'Edited'; f.index.upsert(f.state, 'music', tracks[0]);
    const edited = f.render.frontendActiveGroup('music');
    assert.notEqual(edited, previous); assert.equal(edited.items[0].title, 'Edited');
    tracks[4].exposed = false; f.index.upsert(f.state, 'music', tracks[4]);
    assert.equal(ids(f.render.frontendActiveGroup('music').items), 'a,c');
    f.replace({ musicGroupMap: { ...f.state.musicGroupMap, a: [] } });
    f.render.renderFrontendMusicActive();
    assert.equal(ids(f.tree().find(entry => entry.name === 'Child').members), 'c');
    f.replace({ musicGroupParents: { Child: 'Other' } });
    f.render.renderFrontendMusicActive();
    assert.equal(f.tree().find(entry => entry.name === 'Child').path.join('/'), 'Other/Child');
    assert.equal(ids(f.tree().find(entry => entry.name === 'Other').members), 'c');
    f.replace({ musicGroups: [], musicGroupParents: {} });
    assert.equal(ids(f.render.frontendActiveGroup('music').items), 'a', 'Dangling membership cannot expose a track after its registry disappears');
    evidence.invalidation = { folderScope: true, itemEdit: true, exposure: true, membership: true, hierarchy: true, registry: true };
    checks.push('projection-scope-edit-exposure-membership-and-hierarchy-invalidation-preserved');
    return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const artifact = path.join(root, 'data/runtime/smoke-results/audioflix-projection-allocations.json'), checks = [];
    let result;
    try {
        result = { ok: true, checks, evidence: qualifyProjectionAllocations(root, checks) };
        console.log(`AUDIOFLIX_PROJECTION_ALLOCATIONS_OK checks=${checks.length}/${checks.length}`);
    } catch (error) {
        result = { ok: false, checks, error: String(error.stack || error) }; process.exitCode = 1;
        console.error(`AUDIOFLIX_PROJECTION_ALLOCATIONS_FAIL\n${result.error.split('\n').slice(0, 30).join('\n')}`);
    }
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(result, null, 2));
}
