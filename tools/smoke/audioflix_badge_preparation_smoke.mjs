#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-badge-preparation.json');
const SIZE = 25000, results = [], evidence = {};
let current = '';
const check = async (id, work) => { current = id; await work(); results.push(id); };

function fixture() {
    const reads = { music: 0, sound: 0 }, microtasks = [], timers = new Map();
    let nextTimer = 0;
    const item = (index, type = 'music') => {
        let title = type === 'music' ? `Unique ${index}` : `Sound ${index}`;
        return { id: `${type}-${index}`,
            get title() { reads[type] += 1; return title; },
            set title(value) { title = String(value); },
            url: `https://media.invalid/${type}/${index}.mp3`, duration: 180,
            folder: type === 'music' ? 'Library' : undefined, category: type === 'sound' ? 'Sounds' : undefined,
            exposed: true, volume: 1 };
    };
    const music = Array.from({ length: SIZE }, (_, index) => item(index));
    const soundboard = [item(0, 'sound')];
    const storage = new Map(), document = {
        activeElement: null, head: { appendChild() {} }, addEventListener() {}, getElementById: () => ({}),
        createElement: () => ({ id: '', textContent: '' })
    };
    const recovery = {
        read: () => ({ state: {} }), prefer: primary => primary,
        restoreStructure: (_key, state) => state, write: () => ({ written: true }),
        nextRevision: (_key, state) => Number(state?.durabilityRevision || 0) + 1,
        applyTrackStructure() {}, folderRegistry: state => state.musicFolders || []
    };
    const window = {
        window: null, document, EveAudioflixStateRecovery: recovery,
        eveState: { config: { audioflix: { musicViewMode: 'backend', soundboardViewMode: 'backend' } } },
        addEventListener() {}, dispatchEvent() {},
        setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    window.window = window;
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
    window.localStorage = localStorage;
    const context = vm.createContext({ window, document, localStorage, console,
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        queueMicrotask: callback => microtasks.push(callback),
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout });
    for (const file of ['audioflix.state.schema.js', 'audioflix.library.index.js', 'audioflix.state.mutations.js',
        'audioflix.state.groups.js', 'audioflix.state.persistence.js', 'audioflix.state.js', 'audioflix.duplicates.details.js', 'audioflix.state.duplicates.js', 'audioflix.ui.render.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', file), 'utf8'), context, { filename: file });
    }
    const S = window.EveAudioflixState, D = window.EveAudioflixDuplicates, L = window.EveAudioflixLibraryIndex;
    S.ensure(); S.update({ music, soundboard }, 'fixture-install'); reads.music = reads.sound = 0;
    const summaryCalls = [], summary = D.duplicateBadgeSummary.bind(D);
    D.duplicateBadgeSummary = type => { summaryCalls.push(type); return summary(type); };
    const collapsed = { Library: true, Sounds: true };
    const ui = window.EveAudioflixUiRender.create({
        esc: value => String(value ?? ''), state: () => S.ensure(), getCollapsedGroups: () => collapsed,
        groupKey: (entry, type) => String(type === 'music' ? entry.folder || 'Ungrouped' : entry.category || 'Ungrouped'),
        isItemExposed: () => true, allGroups: () => [], groupsOf: () => [], groupTags: () => '', itemMeta: () => '',
        internalViewButton: () => '', getPorted: () => [], getActiveRepeaters: () => ({}),
        getActiveMusicQueue: () => ({ isPlaying: false, items: [], currentIndex: -1 }),
        classifierEntries: () => [], renderClassifierRow: () => '', getFrontendOpen: () => false,
        smartArtistExpanded: () => false, closeSvg: '', cogSvg: '', playSvg: '', stopSvg: '', layerPlaySvg: ''
    });
    return { S, D, L, ui, reads, summaryCalls, music, soundboard,
        flushMicrotasks() { while (microtasks.length) microtasks.shift()(); } };
}

const articleCount = html => (String(html).match(/<article\b/g) || []).length;

try {
    await check('remote-path-fast-exit-preserves-identity', () => {
        const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.duplicates.js'), 'utf8');
        const helper = name => source.match(new RegExp(`    function ${name}\\(value\\) \\{[\\s\\S]*?\\n    \\}`))[0];
        const scope = { text: value => String(value ?? '').trim(), normalize: value => String(value ?? '').trim().toLowerCase() };
        vm.createContext(scope);
        vm.runInContext(`${helper('fileBaseName')}\n${helper('normalizedPath')}`, scope);
        const oldBase = value => {
            const clean = scope.normalize(value).split('?')[0];
            if (!clean || /^https?:\/\//.test(clean)) return '';
            const base = clean.split('\\').join('/').split('/').pop();
            return base && base.includes('.') ? base : '';
        };
        const oldPath = value => {
            const clean = scope.normalize(value).replace(/^file:\/\/+/, '').replace(/\\/g, '/');
            return clean && !/^(?:https?:\/\/|spotify:)/.test(clean) ? clean.replace(/\/+$/, '') : '';
        };
        for (const value of [undefined, null, '', '?only', ' HTTPS://media.invalid/a.mp3?q=1 ',
            'http://x/y.mp3', 'spotify:track:abc', 'C:\\Music\\A.MP3?x', '/music/a.wav/',
            'file:///C:/Music/A.mp3', 'file:///https://media.invalid/a.mp3', 'relative.mp3', 'folder/noext']) {
            assert.equal(scope.fileBaseName(value), oldBase(value));
            assert.equal(scope.normalizedPath(value), oldPath(value));
        }
    });
    const f = fixture();
    await check('collapsed-backend-prepares-compact-music-badges', async () => {
        const html = f.ui.renderItems(f.music, 'music');
        evidence.boot = { articles: articleCount(html), titleReads: f.reads.music, summaryCalls: [...f.summaryCalls] };
        assert.equal(articleCount(html), 0, 'Every backend group is collapsed, so preparation cannot rely on hidden cards');
        assert.equal(Math.min(f.reads.music, SIZE), SIZE, 'Collapsed library boot must prepare canonical duplicate metadata');
        assert.deepEqual(f.summaryCalls, ['music']);

        const beforeReport = f.reads.music, report = f.D.findDuplicates('music');
        assert.equal(report.length, 0);
        assert.ok(f.reads.music - beforeReport >= SIZE, 'Boot preparation stays compact and does not materialize the full pair report');
        await Promise.resolve(); f.flushMicrotasks();
        const beforeBadge = f.reads.music;
        assert.equal(f.D.duplicateLevelFor('music', `music-${SIZE - 1}`), '');
        assert.equal(f.reads.music - beforeBadge, 1, 'A later badge query reuses prepared metadata after the microtask boundary');
    });

    await check('state-and-index-edits-refresh-badges-and-full-report', () => {
        const targetId = `music-${SIZE - 1}`, editId = 'music-1000';
        f.S.updateItem('music', editId, { title: `Unique ${SIZE - 1}` });
        const beforeBadge = f.reads.music;
        assert.equal(f.D.duplicateLevelFor('music', targetId), 'soft');
        assert.ok(f.reads.music - beforeBadge >= SIZE, 'A real metadata revision rebuilds the compact projection');
        const pairs = f.D.findDuplicates('music');
        assert.deepEqual(Array.from(pairs, pair => ({ ids: Array.from(pair.items, entry => entry.id), level: pair.level, reason: pair.reason })), [
            { ids: [editId, targetId], level: 'soft', reason: 'matching title' }
        ], 'Explicit full reports retain exact pair, level, and reason semantics');

        f.music[1000].title = 'Unique restored 1000';
        f.L.invalidate(f.S.ensure(), 'music');
        assert.equal(f.D.duplicateLevelFor('music', targetId), '', 'Explicit index invalidation exposes a same-object metadata edit immediately');
    });

    await check('collapsed-sound-panel-does-not-warm-music', () => {
        f.summaryCalls.length = 0; f.reads.music = 0; f.reads.sound = 0;
        const html = f.ui.renderItems(f.soundboard, 'sound');
        assert.equal(articleCount(html), 0);
        assert.deepEqual(f.summaryCalls, [], 'Sound rendering has no music classifier/badge preparation work');
        assert.equal(f.reads.music, 0); assert.equal(f.reads.sound, 0);
    });

    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify({ ok: true, results, evidence }, null, 2));
    console.log(`AUDIOFLIX_BADGE_PREPARATION_SMOKE_OK passed=${results.length}/${results.length}`);
} catch (error) {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify({ ok: false, current, results, evidence, error: String(error.stack || error) }, null, 2));
    console.error(`AUDIOFLIX_BADGE_PREPARATION_SMOKE_FAIL ${current}\n${String(error.stack || error).split('\n').slice(0, 30).join('\n')}`);
    process.exitCode = 1;
}
