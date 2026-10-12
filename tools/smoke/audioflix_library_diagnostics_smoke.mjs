#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = name => fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', name), 'utf8');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-library-diagnostics/result.json');
const passed = [];
let active = '';
function fixture(withDiagnostics = true) {
    let clock = 0, sequence = 0, failApply = false, failCard = false;
    const fault = new Error('synthetic-operation-failure');
    const store = { music: [], soundboard: [], musicPlaylists: [], musicGroups: [], musicGroupMap: {}, musicViewMode: 'backend' };
    const window = {
        performance: { now: () => clock, getEntriesByType: () => [] }, addEventListener() {},
        EveAudioflixState: {
            ensure: () => store, update: patch => Object.assign(store, patch),
            addItem(_type, item) { if (failApply) throw fault; const next = { ...item, id: `fixture-${++sequence}` }; store.music.push(next); clock += 7; return next; },
            updateItem(_type, id, patch) { if (failApply) throw fault; Object.assign(store.music.find(item => item.id === id), patch); clock += 3; },
            addMusicGroup(name) { if (!store.musicGroups.includes(name)) store.musicGroups.push(name); },
            toggleMusicGroup() {}, renameGroup() {}
        },
        EveAudioflixPlaylistsWpl: { create: () => ({ importWplPlaylist() {}, syncWplPlaylist() {} }) },
        EveAudioflixPlaylistProviders: {
            detect: () => 'spotify', normalize: (_type, url) => ({ ok: true, url }), entryPatch: () => ({}),
            fetchPlaylist: async () => ({ ok: true, title: 'Synthetic', entries: window.entries })
        },
        EveAudioflixTransport: { render() { if (failCard) throw fault; clock += 10; return ''; } },
        entries: [{ sourceId: 'synthetic-a', title: 'Synthetic A', url: 'https://media.invalid/a' }]
    };
    const document = { addEventListener() {}, getElementById: () => ({}), head: { appendChild() {} } };
    const context = vm.createContext({ window, document, localStorage: { getItem: () => null, setItem() {} }, console });
    const load = name => vm.runInContext(source(name), context, { filename: name });
    if (withDiagnostics) load('audioflix.playback.diagnostics.js');
    load('audioflix.ui.window.js'); load('audioflix.ui.render.js'); load('audioflix.playlists.js');
    const collapsed = {};
    const renderer = window.EveAudioflixUiRender.create({
        esc: value => String(value ?? ''), state: () => store, groupKey: item => item.folder || 'Ungrouped',
        getCollapsedGroups: () => collapsed, getPorted: () => [], isItemExposed: () => true,
        getActiveRepeaters: () => ({}), getActiveMusicQueue: () => ({ items: [], currentIndex: -1, isPlaying: false }),
        allGroups: () => [], groupsOf: () => [], classifierEntries: () => [],
        itemMeta: () => '', groupTags: () => '', internalViewButton: () => '',
        playSvg: '', stopSvg: '', closeSvg: '', cogSvg: '', layerPlaySvg: ''
    });
    return { window, store, renderer, collapsed, fault, load, advance: ms => { clock += ms; },
        setApplyFailure: value => { failApply = value; }, setCardFailure: value => { failCard = value; } };
}
async function check(name, test) { active = name; await test(); passed.push(name); }
try {
    await check('numeric-api-bounds-and-privacy', () => {
        const f = fixture(), diag = f.window.EveAudioflixDiagnostics;
        assert.equal(typeof diag.gauge, 'function', 'production diagnostics must expose numeric gauges');
        assert.equal(typeof diag.increment, 'function'); assert.equal(typeof diag.reset, 'function');
        diag.reset();
        assert.equal(diag.gauge('ui:render-cards', 200), true);
        assert.equal(diag.increment('ui:render-generations'), true);
        assert.equal(diag.increment('ui:render-generations', 2), true);
        for (const name of ['private-user-id', 'C:/private/library.json', 'https://provider.invalid/token', '__proto__']) {
            assert.equal(diag.gauge(name, 2), false); assert.equal(diag.increment(name), false);
        }
        for (const value of [Infinity, NaN, -1, 'private-secret', { title: 'private-library' }]) {
            assert.equal(diag.gauge('ui:render-cards', value), false);
            assert.equal(diag.increment('ui:render-generations', value), false);
        }
        const one = diag.snapshot();
        assert.equal(one.gauges['ui:render-cards'], 200); assert.equal(one.counters['ui:render-generations'], 3);
        one.gauges['ui:render-cards'] = 9;
        assert.equal(diag.snapshot().gauges['ui:render-cards'], 200, 'snapshot must not mutate diagnostics');
        for (let i = 0; i < 200; i++) diag.record(`test:bounded-${i}`, i);
        for (let i = 0; i < 200; i++) diag.record('test:samples', i);
        const bounded = diag.snapshot();
        assert.ok(Object.keys(bounded.summary).length <= bounded.capacity.timingKeys);
        assert.ok(bounded.recent.length <= bounded.capacity.samples);
        assert.ok(Object.keys(bounded.gauges).length + Object.keys(bounded.counters).length <= bounded.capacity.metricKeys);
        assert.ok(!JSON.stringify(bounded).includes('private-'));
        diag.reset();
        assert.equal(Object.keys(diag.snapshot().summary).length, 0);
        assert.equal(Object.keys(diag.snapshot().gauges).length, 0);
        assert.equal(Object.keys(diag.snapshot().counters).length, 0);
    });
    await check('actual-render-duration-and-card-counts', () => {
        const f = fixture(), diag = f.window.EveAudioflixDiagnostics;
        f.store.music = Array.from({ length: 501 }, (_, index) => ({ id: `synthetic-${index}`, title: 'Synthetic', folder: 'Closed', type: 'music' }));
        f.collapsed.Closed = true; diag.reset();
        let html = f.renderer.renderItems(f.store.music, 'music');
        assert.equal((html.match(/<article/g) || []).length, 0);
        assert.equal(diag.snapshot().gauges['ui:render-cards'], 0);
        assert.equal(diag.snapshot().counters['ui:render-generations'], 1);
        f.collapsed.Closed = false;
        html = f.renderer.renderItems(f.store.music, 'music');
        const observed = (html.match(/<article/g) || []).length, snap = diag.snapshot();
        assert.equal(observed, 200); assert.equal(snap.gauges['ui:render-cards'], observed);
        assert.equal(snap.counters['ui:card-generations'], 200);
        assert.equal(snap.summary['ui:render:items'].maxMs, 2000, 'duration measures clock, not a card count disguised as milliseconds');
        assert.equal(snap.summary['ui:render:card'].count, 200);
        assert.ok(!JSON.stringify(snap).includes('synthetic-'), 'render diagnostics must not retain item/folder names');
        f.setCardFailure(true);
        assert.throws(() => f.renderer.renderItems(f.store.music, 'music'), error => error === f.fault);
        const failed = diag.snapshot();
        assert.equal(failed.summary['ui:render:items'].errors, 1);
        assert.equal(failed.summary['ui:render:card'].errors, 1);
    });
    await check('playlist-fallback-and-bulk-success-failure', async () => {
        const f = fixture(), diag = f.window.EveAudioflixDiagnostics; diag.reset();
        const imported = await f.window.EveAudioflixPlaylists.importPlaylist('https://playlist.invalid/one');
        assert.equal(imported.added, 1); assert.equal(f.store.music.length, 1);
        let snap = diag.snapshot();
        assert.equal(snap.counters['playlist:reconcile-attempts'], 1);
        assert.equal(snap.counters['playlist:apply-attempts'], 1);
        assert.equal(snap.summary['playlist:reconcile'].p50Ms, 10);
        assert.equal(snap.summary['playlist:apply'].p50Ms, 10);
        assert.equal(snap.gauges['playlist:upstream-items'], 1);
        assert.equal(snap.gauges['playlist:added-items'], 1);
        f.window.entries = [{ sourceId: 'synthetic-b', title: 'Synthetic B' }];
        f.window.EveAudioflixBulk = { replaceMusic(music, extras) { f.advance(15); Object.assign(f.store, { music }, extras); return { ok: true }; } };
        await f.window.EveAudioflixPlaylists.syncPlaylist(imported.connection.id);
        snap = diag.snapshot();
        assert.equal(snap.counters['playlist:reconcile-attempts'], 2);
        assert.equal(snap.counters['playlist:apply-attempts'], 2);
        assert.equal(snap.summary['playlist:apply'].maxMs, 15);
        assert.equal(snap.gauges['playlist:missing-items'], 1);
        assert.equal(f.store.music[0].upstreamMissing, true, 'telemetry must preserve grey-not-delete reconciliation');
        f.window.EveAudioflixBulk.replaceMusic = () => { throw f.fault; };
        await assert.rejects(f.window.EveAudioflixPlaylists.syncPlaylist(imported.connection.id), error => error === f.fault);
        snap = diag.snapshot();
        assert.equal(snap.summary['playlist:reconcile'].errors, 1); assert.equal(snap.summary['playlist:apply'].errors, 1);
        assert.ok(!JSON.stringify(snap).includes('playlist.invalid'));
        f.window.EveAudioflixBulk.replaceMusic = () => ({ ok: false, reason: 'synthetic-batch-rejected' });
        await assert.rejects(f.window.EveAudioflixPlaylists.syncPlaylist(imported.connection.id), /synthetic-batch-rejected/);
        delete f.window.EveAudioflixBulk; f.setApplyFailure(true); f.window.entries = [{ sourceId: 'synthetic-c' }];
        await assert.rejects(f.window.EveAudioflixPlaylists.syncPlaylist(imported.connection.id), error => error === f.fault);
        assert.equal(diag.snapshot().summary['playlist:apply'].errors, 3);
    });
    await check('optional-and-degraded-telemetry-preserves-behavior', async () => {
        for (const degraded of [undefined, {}, { span() { throw new Error('telemetry'); }, gauge() { throw new Error('telemetry'); }, increment() { throw new Error('telemetry'); } },
            { span: () => () => { throw new Error('telemetry-finish'); } }, new Proxy({}, { get() { throw new Error('telemetry-access'); } })]) {
            const f = fixture(false); f.window.EveAudioflixDiagnostics = degraded;
            f.store.music = [{ id: 'synthetic', title: 'Synthetic', folder: 'Open', type: 'music' }];
            assert.match(f.renderer.renderItems(f.store.music, 'music'), /<article/);
            f.setCardFailure(true);
            assert.throws(() => f.renderer.renderItems(f.store.music, 'music'), error => error === f.fault);
            const result = await f.window.EveAudioflixPlaylists.importPlaylist('https://playlist.invalid/two');
            assert.equal(result.ok, true); assert.equal(result.added, 1);
            f.setApplyFailure(true); f.window.entries = [{ sourceId: 'new-synthetic' }];
            await assert.rejects(f.window.EveAudioflixPlaylists.syncPlaylist(result.connection.id), error => error === f.fault);
        }
    });
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify({ ok: true, passed }, null, 2));
    console.log(`AUDIOFLIX_LIBRARY_DIAGNOSTICS_SMOKE_OK passed=${passed.length}/${passed.length}`);
} catch (error) {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify({ ok: false, active, passed, error: String(error.stack || error) }, null, 2));
    console.error(`AUDIOFLIX_LIBRARY_DIAGNOSTICS_SMOKE_FAIL ${active}\n${String(error.stack || error).split('\n').slice(0, 30).join('\n')}`);
    process.exitCode = 1;
}
