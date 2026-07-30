/**
 * audioflix_classifiers_smoke.js
 *
 * The classifier system (audioflix.classifiers.js) — a standalone way to slice the music library,
 * deliberately separate from artist/folder/group metadata:
 *   1. AUTOMATIC "time filter": duration buckets using the shared :36 roll-up rule.
 *   2. AUTOMATIC "group rank": songs ordered by how many groups they are in (ungrouped last).
 *   3. MANUAL labels: create / attach / detach / rename / delete, with membership persisted.
 *   4. Manager overview + drill-down counts, and the frontend/nexus selectable entries.
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
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, RegExp,
        URL,   // classifiers parse track urls to identify the import source
        setTimeout, clearTimeout,
        localStorage: {
            getItem: (k) => (k in stores ? stores[k] : null),
            setItem: (k, v) => { stores[k] = String(v); },
            removeItem: (k) => { delete stores[k]; }
        },
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
    ['audioflix.state.schema.js', 'audioflix.state.groups.js', 'audioflix.state.js',
        'audioflix.nexus.js', 'audioflix.classifiers.js']
        .forEach((f) => runScript(ctx, 'js/modules/features/audioflix/' + f));
    return { S: ctx.window.EveAudioflixState, C: ctx.window.EveAudioflixClassifiers };
}

const SEED = {
    music: [
        { id: 'a', title: 'Short One', url: 'https://y/a', duration: 194 },   // 3:14 -> ~3
        { id: 'b', title: 'Edge Low', url: 'https://y/b', duration: 216 },    // 3:36 -> ~3
        { id: 'c', title: 'Edge High', url: 'https://y/c', duration: 218 },   // 3:38 -> ~4
        { id: 'd', title: 'No Length', url: 'https://y/d' }                   // unknown -> no bucket
    ],
    musicGroups: ['G1', 'G2'],
    musicGroupMap: { a: ['G1', 'G2'], b: ['G1'] }        // c and d have no groups
};

(function main() {
    // --- 1. Automatic: duration buckets (the time filter), :36 edge respected ---
    {
        const { C } = load(makeCtx(SEED));
        const buckets = C.durationBuckets();
        const byMin = Object.fromEntries(buckets.map((b) => [b.min, b.tracks.map((t) => t.id).sort().join(',')]));
        assert(byMin[3] === 'a,b', `~3 min holds 3:14 and 3:36 (got ${byMin[3]})`);
        assert(byMin[4] === 'c', `3:38 tips into ~4 min (got ${byMin[4]})`);
        assert(!buckets.some((b) => b.tracks.some((t) => t.id === 'd')), 'a track with no known length is in no bucket');
        console.log('automatic time filter OK (:36 edge)');
    }

    // --- 2. Automatic: group rank (most groups first, ungrouped last) ---
    {
        const { C } = load(makeCtx(SEED));
        const ranked = C.groupRanking();
        assert(ranked[0].track.id === 'a' && ranked[0].groups === 2, 'most-grouped song ranks #1');
        assert(ranked[1].track.id === 'b' && ranked[1].groups === 1, 'one-group song ranks #2');
        assert(ranked[ranked.length - 1].groups === 0, 'ungrouped songs rank last');
        const rb = C.rankBuckets();
        assert(rb[0].groups === 2 && rb[rb.length - 1].label === 'No groups', 'rank buckets run high -> "No groups"');
        console.log('automatic group rank OK');
    }

    // --- 3. Manual: create / attach / detach / rename / delete ---
    {
        const { S, C } = load(makeCtx(SEED));
        assert(C.addManual('English only').ok, 'create a manual classifier');
        assert(!C.addManual('english ONLY').ok, 'duplicate names (case-insensitive) are rejected');
        assert(C.manualNames().includes('English only'), 'registry lists the new classifier');

        assert(C.toggleOnTrack('a', 'English only', true).ok, 'attach to a track');
        assert(C.manualTracks('English only').map((t) => t.id).join() === 'a', 'membership records the track');
        assert(S.ensure().music.find((m) => m.id === 'a').classifiers.includes('English only'), 'membership persists on the track');

        C.toggleOnTrack('a', 'English only', false);
        assert(C.manualTracks('English only').length === 0, 'detach removes membership');

        // Attaching an unknown name auto-registers it (quick-add from the song panel).
        C.toggleOnTrack('b', 'mid artist', true);
        assert(C.manualNames().includes('mid artist'), 'attaching an unknown name auto-registers it');

        assert(C.renameManual('mid artist', 'Mid Artist').ok, 'rename a classifier');
        assert(C.manualTracks('Mid Artist').map((t) => t.id).join() === 'b', 'rename carries membership across');

        C.removeManual('Mid Artist');
        assert(!C.manualNames().includes('Mid Artist'), 'delete removes the definition');
        assert(!(S.ensure().music.find((m) => m.id === 'b').classifiers || []).includes('Mid Artist'),
            'delete also detaches it from every track (no orphan labels)');
        console.log('manual classifiers OK (create/attach/detach/rename/delete)');
    }

    // --- 4. Automatic: Localized, URL, Ported classifiers + dual-source tracks ---
    {
        const seed = {
            music: [
                { id: '1', title: 'URL Only', url: 'http://stream/1' },
                { id: '2', title: 'Localized Only', localPath: 'C:/offline/2.mp3' },
                { id: '3', title: 'Both Dual Source', url: 'http://stream/3', localPath: 'C:/offline/3.mp3' },
                { id: '4', title: 'Ported Song', localPath: 'C:/port/4.mp3', isPorted: true }
            ]
        };
        const { C, S } = load(makeCtx(seed));
        assert(C.urlTracks().length === 2, 'urlTracks counts songs with a url');
        assert(C.localizedTracks().length === 3, 'localizedTracks counts songs with a localPath');
        assert(C.portedTracks().length === 1, 'portedTracks counts ported songs');

        const dualTrack = C.classifiersForTrack(seed.music[2]); // Both Dual Source
        const autoKeys = dualTrack.auto.map((a) => a.key);
        assert(autoKeys.includes('class:auto:localized'), 'song with localPath gets ⚡ Localized classifier');
        assert(autoKeys.includes('class:auto:url'), 'song with url gets 🌐 URL Track classifier');
        console.log('automatic localized / url / ported classifiers OK (dual source tested)');
    }

    // --- 5. Manager overview + selectable entries for frontend / nexus ---
    {
        const { C } = load(makeCtx(SEED));
        C.addManual('English only');
        C.toggleOnTrack('a', 'English only', true);

        const ov = C.overview();
        // localized, url, ported, youtube, spotify, wpl, time filter, group rank
        assert(ov.auto.length === 8,
            `eight automatic classifiers incl. the three import sources (got ${ov.auto.length})`);
        ['auto:youtube', 'auto:spotify', 'auto:wpl'].forEach((id) =>
            assert(ov.auto.some((entry) => entry.id === id), `${id} appears in the manager overview`));
        assert(ov.auto.find((e) => e.id === 'auto:duration').count === 3, 'duration covers the 3 tracks with a length');
        assert(ov.manual.find((e) => e.label === 'English only').count === 1, 'manual count reflects membership');
        assert(ov.auto.every((e) => e.kind === 'auto') && ov.manual.every((e) => e.kind === 'manual'), 'kinds are labelled');

        const det = C.detail('auto:duration');
        assert(det && det.buckets.length >= 2, 'drill-down exposes the buckets');
        assert(C.detail('manual:English only').buckets[0].tracks.length === 1, 'manual drill-down lists its songs');

        const entries = C.selectableEntries();
        assert(entries.some(([k]) => k === 'class:auto:around:3'), 'duration bucket is selectable');
        assert(entries.some(([k]) => k === 'class:auto:rank:0'), 'rank bucket is selectable');
        assert(entries.some(([k]) => k === 'class:manual:English only'), 'manual classifier is selectable');
        assert(C.tracksForKey('class:manual:English only').map((t) => t.id).join() === 'a', 'a key resolves back to its tracks');

        const forTrack = C.classifiersForTrack(C.tracksForKey('class:manual:English only')[0]);
        assert(forTrack.manual.includes('English only'), 'per-track view lists its manual labels');
        assert(forTrack.auto.length >= 2, 'per-track view also shows automatic memberships');
        console.log('manager overview + selectable entries OK');
    }

    // ---- automatic import-source classifiers ----------------------------------------------------
    // Derived from the obvious marker, never stored. The case that would glitch quietly is a track
    // sitting in SEVERAL wpl playlist groups: it must be tagged WPL Linked once, not once per group.
    {
        const seed = {
            music: [
                { id: 'yt', title: 'Tube', url: 'https://www.youtube.com/watch?v=abc' },
                { id: 'ytshort', title: 'Short link', url: 'https://youtu.be/abc' },
                { id: 'sp', title: 'Spot', url: 'https://open.spotify.com/track/xyz' },
                { id: 'wpl2', title: 'In two playlists', localPath: 'C:/M/a.mp3' },
                { id: 'wpl1', title: 'In one playlist', localPath: 'C:/M/b.mp3' },
                { id: 'dual', title: 'Tube and playlist', url: 'https://youtu.be/dual', localPath: 'C:/M/d.mp3' },
                { id: 'plain', title: 'Nothing special', url: 'https://example.com/x.mp3' },
                // A near-miss host must NOT match: substring checks would wrongly tag this.
                { id: 'fake', title: 'Lookalike', url: 'https://notyoutube.com.evil.test/x' }
            ],
            musicGroups: ['WPL A', 'WPL B', 'Normal'],
            musicGroupMap: {
                wpl2: ['WPL A', 'WPL B'],
                wpl1: ['WPL A'],
                dual: ['WPL B', 'Normal'],
                plain: ['Normal']
            },
            musicPlaylists: [
                // url is required or the state normalizer drops the connection; a real wpl
                // connection always carries its .wpl path.
                { id: 'p1', provider: 'wpl', group: 'WPL A', title: 'WPL A', url: 'C:/P/a.wpl' },
                { id: 'p2', provider: 'wpl', group: 'WPL B', title: 'WPL B', url: 'C:/P/b.wpl' },
                { id: 'p3', provider: 'youtube', group: 'Normal', title: 'Normal', url: 'https://youtube.com/playlist?list=1' }
            ]
        };
        const { C } = load(makeCtx(seed));
        // selectableEntries keys carry the class: prefix.
        const ids = (key) => C.tracksForKey(`class:${key}`).map((t) => t.id).sort().join(',');

        assert(ids('auto:youtube') === 'dual,yt,ytshort',
            `YouTube Linked covers youtube.com and youtu.be only (got ${ids('auto:youtube')})`);
        assert(ids('auto:spotify') === 'sp', `Spotify Linked matches spotify hosts (got ${ids('auto:spotify')})`);
        // A wpl group drives it; the youtube-provider group must not.
        assert(ids('auto:wpl') === 'dual,wpl1,wpl2',
            `WPL Linked comes from wpl playlist groups only (got ${ids('auto:wpl')})`);

        // The multi-group case: listed once despite belonging to two wpl groups.
        const twoGroup = C.tracksForKey('class:auto:wpl').filter((t) => t.id === 'wpl2');
        assert(twoGroup.length === 1,
            `a track in two wpl groups is tagged once, not per group (got ${twoGroup.length})`);

        // Several sources on one track is legitimate, not an either/or.
        const dualAuto = C.classifiersForTrack(seed.music.find((t) => t.id === 'dual')).auto.map((a) => a.key);
        assert(dualAuto.includes('class:auto:youtube') && dualAuto.includes('class:auto:wpl'),
            `a dual-source track carries both tags (got ${dualAuto.join(',')})`);
        const wplOnce = dualAuto.filter((k) => k === 'class:auto:wpl');
        assert(wplOnce.length === 1, 'the per-track view also lists WPL Linked only once');

        // Host matching, not substring matching.
        const fakeAuto = C.classifiersForTrack(seed.music.find((t) => t.id === 'fake')).auto.map((a) => a.key);
        assert(!fakeAuto.includes('class:auto:youtube'),
            'a lookalike hostname is not treated as YouTube');

        const spAuto = C.classifiersForTrack(seed.music.find((t) => t.id === 'sp')).auto.map((a) => a.key);
        assert(spAuto.includes('class:auto:spotify') && !spAuto.includes('class:auto:youtube'),
            'a spotify track is tagged spotify and not youtube');

        console.log('import-source classifiers OK — youtube/spotify/wpl, multi-group deduped');
    }

    console.log('AUDIOFLIX_CLASSIFIERS_SMOKE_OK');
})();
