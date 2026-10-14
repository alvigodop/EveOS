import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'js/modules/features/audioflix/audioflix.classifiers.js'), 'utf8');
const artifact = path.join(root, 'data/runtime/smoke-results/audioflix-classifier-projection-scale.json');
const evidence = { cases: [] };
const plain = value => JSON.parse(JSON.stringify(value));
const text = value => String(value ?? '').trim();
const youtube = /(?:^|\.)(?:youtube\.com|youtu\.be)$/i;
const spotify = /(?:^|\.)spotify\.com$/i;
const nativeHost = value => { try { return new URL(text(value)).hostname.toLowerCase(); } catch { return ''; } };
const minute = seconds => Number(seconds) > 0 && Number.isFinite(Number(seconds))
    ? Math.floor(Number(seconds) / 60) + (Number(seconds) % 60 > 36 ? 1 : 0) : null;

function load(state) {
    let constructions = 0;
    class SpyURL extends URL { constructor(...args) { super(...args); constructions += 1; } }
    // Count rejected constructor attempts too, rather than only valid URLs.
    const URLProbe = new Proxy(SpyURL, { construct(target, args) {
        const before = constructions;
        try { return Reflect.construct(target, args); }
        catch (error) { constructions = before + 1; throw error; }
    } });
    const window = { EveAudioflixState: { ensure: () => state }, EveAudioflixNexus: { aroundMinute: minute } };
    vm.runInNewContext(source, { window, URL: URLProbe }, { filename: 'audioflix.classifiers.js' });
    return { api: window.EveAudioflixClassifiers, count: () => constructions, reset: () => { constructions = 0; } };
}

// Independent reference: original URL-based provider filters and original projection order.
function reference(state, items = state.music) {
    const groups = id => state.musicGroupMap[id] || [];
    const wplGroups = new Set(state.musicPlaylists.filter(row => row?.provider === 'wpl').map(row => text(row.group)).filter(Boolean));
    const basic = [
        ['localized', items.filter(row => Boolean(text(row.localPath))), '⚡ Localized'],
        ['url', items.filter(row => Boolean(text(row.url))), '🌐 URL Track'],
        ['ported', items.filter(row => Boolean(row.isPorted || row.isMusicPort)), '📁 Ported'],
        ['youtube', items.filter(row => youtube.test(nativeHost(row.url))), '▶️ YouTube Linked'],
        ['spotify', items.filter(row => spotify.test(nativeHost(row.url))), '🟢 Spotify Linked'],
        ['wpl', items.filter(row => Array.isArray(groups(row.id)) && groups(row.id).some(group => wplGroups.has(text(group)))), '🎵 WPL Linked']
    ];
    const durations = new Map(), ranks = new Map();
    for (const row of items) {
        const value = minute(row.duration);
        if (value !== null) { if (!durations.has(value)) durations.set(value, []); durations.get(value).push(row); }
    }
    const ranked = items.map(row => ({ row, count: groups(row.id).length }))
        .sort((a, b) => b.count - a.count || String(a.row.title).localeCompare(String(b.row.title)));
    for (const { row, count } of ranked) { if (!ranks.has(count)) ranks.set(count, []); ranks.get(count).push(row); }
    const entries = basic.filter(([, rows]) => rows.length).map(([key, rows, label]) => [`class:auto:${key}`, rows, label]);
    [...durations].sort((a, b) => a[0] - b[0]).forEach(([value, rows]) => entries.push([`class:auto:around:${value}`, rows, `⏱ ~${value} min`]));
    [...ranks].sort((a, b) => b[0] - a[0]).forEach(([value, rows]) => entries.push([
        `class:auto:rank:${value}`, rows, `🏆 ${value === 0 ? 'No groups' : `${value} group${value === 1 ? '' : 's'}`}`]));
    const names = state.musicClassifiers.map(text).filter(Boolean);
    for (const name of names) {
        const rows = items.filter(row => (row.classifiers || []).map(text).includes(name));
        if (rows.length) entries.push([`class:manual:${name}`, rows, `🏷 ${name}`]);
    }
    return { entries, overview: {
        auto: [...basic.map(([key, rows]) => ({ id: `auto:${key}`, count: rows.length, buckets: 1 })),
            { id: 'auto:duration', count: [...durations.values()].reduce((total, rows) => total + rows.length, 0), buckets: durations.size },
            { id: 'auto:grouprank', count: items.length, buckets: ranks.size }],
        manual: names.map(name => ({ id: `manual:${name}`, count: items.filter(row => (row.classifiers || []).map(text).includes(name)).length, buckets: 0 })),
        totalTracks: items.length
    } };
}

const shapeEntries = entries => plain(entries.map(([key, rows, label]) => [key, rows.map(row => row.id), label]));
const shapeOverview = view => plain({ auto: view.auto.map(({ id, count, buckets }) => ({ id, count, buckets })),
    manual: view.manual.map(({ id, count, buckets }) => ({ id, count, buckets })), totalTracks: view.totalTracks });
function verify(state, probe) {
    const expected = reference(state);
    assert.deepEqual(shapeEntries(probe.api.selectableEntries()), shapeEntries(expected.entries));
    assert.deepEqual(shapeOverview(probe.api.overview()), expected.overview);
    for (const name of ['youtube', 'spotify']) {
        const expectedIds = state.music.filter(row => (name === 'youtube' ? youtube : spotify).test(nativeHost(row.url))).map(row => row.id);
        assert.deepEqual(plain(probe.api.detail(`auto:${name}`).buckets[0].tracks.map(row => row.id)), expectedIds);
    }
    for (const row of state.music) {
        const automatic = probe.api.classifiersForTrack(row).auto.map(entry => entry.key);
        const host = nativeHost(row.url);
        assert.equal(automatic.includes('class:auto:youtube'), youtube.test(host));
        assert.equal(automatic.includes('class:auto:spotify'), spotify.test(host));
    }
}
function stateFor(urls) {
    return { music: urls.map((url, index) => ({ id: `row-${index}`, title: `Title ${index % 7}`, url,
        localPath: index % 2 ? 'local.mp3' : '', isPorted: index % 3 === 0, isMusicPort: index % 5 === 0,
        duration: [0, 194, 216, 218][index % 4], classifiers: index % 2 ? [' One '] : ['Two'] })),
    musicGroupMap: Object.fromEntries(urls.map((_, index) => [`row-${index}`, index % 2 ? ['WPL A', 'WPL B', 'Other'] : []])),
    musicPlaylists: [{ provider: 'wpl', group: 'WPL A' }, { provider: 'wpl', group: ' WPL B ' }, { provider: 'spotify', group: 'Other' }],
    musicClassifiers: [' One ', 'Two', 'Empty'] };
}
function run(id, operation) {
    try { evidence.cases.push({ id, passed: true, ...operation() }); }
    catch (error) { evidence.cases.push({ id, passed: false, error: String(error.stack || error) }); }
}

run('original-reference-special-url-semantics', () => {
    const urls = [
        'https://youtube.com/watch?v=1', 'HTTP://WWW.SPOTIFY.COM:65535/a', 'https://youtu.be/a',
        'https://youtube.com.evil.invalid/a', 'https://spotify.com./a', 'https://spotify.com:000000/a',
        'https://%73potify.com/a', 'https://you%74ube.com/a', 'https://spotify.com/%61',
        'https://user:pass@spotify.com/a', 'https://spotify.com@youtube.com/a',
        'https://spo\ntify.com/a', 'https://you\ttube.com/a', 'https://spotify.com\r/a',
        'https://spotify.com\\@youtube.com/a', 'https:\\youtube.com\\a',
        'https://spotify.com:65536/a', 'https://spotify.com:-1/a', 'https://spotify.com:+1/a',
        'https://spotify.com:1.5/a', 'https://spotify.com:/a', 'https://spotify.com:999999/a',
        'https://ｓｐｏｔｉｆｙ.com/a', 'https://spótify.com/a', 'https://xn--sptify-dxa.com/a',
        'ftp://spotify.com/a', 'ws://youtube.com/a', 'custom://spotify.com/a', 'file://youtube.com/a',
        'spotify://spotify.com/a', 'mailto:spotify.com', '//youtube.com/a', 'http:spotify.com/a',
        ' https://spotify.com/a ', 'https://127.1/a', 'https://[::1]/a', '', null,
        'https://-youtube.com/a', 'https://youtube..com/a', 'https://spotify.com/a#youtube.com'
    ];
    const state = stateFor(urls), probe = load(state); verify(state, probe);
    const subset = state.music.filter((_, index) => index % 3 === 0);
    assert.deepEqual(shapeEntries(probe.api.selectableEntries(subset)), shapeEntries(reference(state, subset).entries));
    assert.ok(probe.count() > 0, 'Special/ambiguous URLs must keep the original URL fallback');
    return { rows: urls.length, fallbackConstructions: probe.count() };
});

run('25k-simple-projection-zero-url-constructions', () => {
    const urls = Array.from({ length: 25000 }, (_, index) => `https://${['media.invalid', 'youtube.com', 'open.spotify.com'][index % 3]}/${index}.mp3`);
    const state = stateFor(urls), probe = load(state), expected = reference(state);
    assert.deepEqual(shapeEntries(probe.api.selectableEntries()), shapeEntries(expected.entries));
    const selectableConstructions = probe.count(); probe.reset();
    assert.deepEqual(shapeOverview(probe.api.overview()), expected.overview);
    const overviewConstructions = probe.count();
    assert.equal(selectableConstructions, 0, `25k simple selectableEntries constructed ${selectableConstructions} URLs`);
    assert.equal(overviewConstructions, 0, `25k simple overview constructed ${overviewConstructions} URLs`);
    return { rows: urls.length, selectableConstructions, overviewConstructions };
});

run('one-fallback-parse-per-projection-row', () => {
    const state = stateFor(['https://%73potify.com/a', 'ftp://youtube.com/a', 'https://user:pass@spotify.com/a', 'https://spotify.com:65536/a']);
    const probe = load(state);
    probe.api.selectableEntries(); assert.equal(probe.count(), state.music.length); probe.reset();
    probe.api.overview(); assert.equal(probe.count(), state.music.length);
    return { rows: state.music.length };
});

run('same-array-url-and-group-edits-stay-fresh', () => {
    const state = stateFor(['https://media.invalid/a', 'https://youtube.com/b', 'https://spotify.com/c']);
    const probe = load(state), originalArray = state.music; verify(state, probe);
    state.music[0].url = 'https://%73potify.com/a'; state.music[1].url = 'https://media.invalid/b';
    state.music[2].url = 'ftp://youtube.com/c'; state.musicGroupMap['row-0'] = ['WPL A', 'WPL B'];
    state.music[0].classifiers = ['Two']; state.music[0].duration = 218;
    assert.equal(state.music, originalArray); verify(state, probe);
    state.music.push({ id: 'appended', title: 'A', url: 'https://youtu.be/d', duration: 216 }); verify(state, probe);
    return { sameArray: true };
});

run('sparse-subset-keeps-original-filter-semantics', () => {
    const state = stateFor(['https://youtube.com/a', 'https://spotify.com/b', 'https://media.invalid/c']);
    const probe = load(state), sparse = [state.music[0], , state.music[1]];
    assert.deepEqual(shapeEntries(probe.api.selectableEntries(sparse)), shapeEntries(reference(state, sparse.filter(() => true)).entries));
    assert.equal(probe.count(), 0);
    return { sparse: true };
});

const failures = evidence.cases.filter(row => !row.passed);
if (failures.length) {
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
    console.error(`AUDIOFLIX_CLASSIFIER_PROJECTION_SCALE_FAILED ids=${failures.map(row => row.id).join(',')}`);
    console.error(failures.flatMap(row => [row.id, ...row.error.split('\n').slice(0, 4)]).slice(0, 36).join('\n'));
    console.error(`Artifact: ${artifact}`); process.exitCode = 1;
} else console.log(`AUDIOFLIX_CLASSIFIER_PROJECTION_SCALE_OK PASS ${evidence.cases.length}/${evidence.cases.length} simpleURLs=25000 constructors=0 fresh=true`);
