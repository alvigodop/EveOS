/**
 * audioflix_nexus_smoke.js
 *
 * Nexus Audio Link query logic (audioflix.nexus.js) over the real state store:
 *   1. Free-text search matches title / artist / folder / group.
 *   2. Facets bucket artists, folders, groups, and duration minutes (with the :36 round-up edge).
 *   3. dupReport separates exact-name, look-alike, and shared-artist clusters.
 *   4. durationMatch "around"/"below" agree with the facet buckets at the boundary (3:36 -> 3, 3:38 -> 4).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
function runScript(ctx, rel) { vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel }); }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

function makeCtx(stored) {
    const stores = { eveAudioflixFallbackState: stored ? JSON.stringify(stored) : null };
    const ctx = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map,
        setTimeout, clearTimeout,
        localStorage: { getItem: (k) => (k in stores ? stores[k] : null), setItem: (k, v) => { stores[k] = String(v); }, removeItem: (k) => { delete stores[k]; } },
        config: {},
        window: { dispatchEvent() {}, addEventListener() {} },
        CustomEvent: function () {}
    };
    ctx.window.window = ctx.window;
    ctx.window.localStorage = ctx.localStorage;
    ctx.window.setTimeout = setTimeout;
    ctx.window.clearTimeout = clearTimeout;
    return ctx;
}

function load(ctx) {
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.schema.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.groups.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.nexus.js');
    return ctx.window.EveAudioflixNexus;
}

const SEED = {
    music: [
        { id: 'a', title: 'Night Drive', artist: 'Kavinsky', folder: 'Synthwave', duration: 194, url: 'https://y/a' },   // 3:14
        { id: 'b', title: 'Night Drive (Remix)', artist: 'Kavinsky', folder: 'Synthwave', duration: 218, url: 'https://y/b' }, // 3:38 -> around 4
        { id: 'c', title: 'Nightdrive', artist: 'Other', folder: 'Chill', duration: 182, url: 'https://y/c' },            // 3:02
        { id: 'd', title: 'Sunset', artist: 'Kavinsky', folder: 'Chill', duration: 216, url: 'https://y/d' }              // 3:36 -> around 3
    ],
    musicGroups: ['Fav'], musicGroupMap: { a: ['Fav'], c: ['Fav'] }
};

(function main() {
    const X = load(makeCtx(SEED));

    // 1. search
    assert(X.search('night', 'music').map((i) => i.id).sort().join() === 'a,b,c', 'search "night" -> a,b,c');
    assert(X.search('kavinsky', 'music').map((i) => i.id).sort().join() === 'a,b,d', 'search artist -> a,b,d');
    assert(X.search('synthwave', 'music').map((i) => i.id).sort().join() === 'a,b', 'search folder -> a,b');
    assert(X.search('fav', 'music').map((i) => i.id).sort().join() === 'a,c', 'search group -> a,c');
    console.log('search OK');

    // 2. facets
    const f = X.facets('music');
    assert(f.artists.find((a) => a.name === 'Kavinsky').count === 3, 'artist facet Kavinsky=3');
    assert(f.groups.find((g) => g.name === 'Fav').count === 2, 'group facet Fav=2');
    const durMap = Object.fromEntries(f.durations.map((d) => [d.min, d.count]));
    assert(durMap[3] === 3 && durMap[4] === 1, `duration buckets around 3={a,c,d}, around 4={b}; got ${JSON.stringify(durMap)}`);
    console.log('facets OK');

    // 3. dupReport
    const rep = X.dupReport('music');
    assert(rep.exact.length === 0, 'no exact-name dups (all titles differ)');
    assert(rep.similar.length === 1 && rep.similar[0].map((x) => x.id).sort().join() === 'a,c', 'similar cluster = a,c (Night Drive / Nightdrive)');
    assert(rep.sameArtist.find((s) => s.artist === 'kavinsky').items.length === 3, 'shared-artist Kavinsky cluster = 3');
    console.log('dupReport OK');

    // 4. duration edge: 3:36 -> around 3, 3:38 -> around 4 (bucket + filter agree)
    assert(X.aroundMinute(216) === 3 && X.aroundMinute(218) === 4, '3:36 -> 3, 3:38 -> 4');
    assert(X.durationMatch(216, 3, 'around') && !X.durationMatch(216, 4, 'around'), '3:36 matches around 3 only');
    assert(X.durationMatch(218, 4, 'around') && !X.durationMatch(218, 3, 'around'), '3:38 matches around 4 only');
    assert(X.durationMatch(179, 3, 'below') && !X.durationMatch(181, 3, 'below'), 'below 3 = strictly under 3:00');
    console.log('duration around/below OK');

    console.log('AUDIOFLIX_NEXUS_SMOKE_OK');
})();
