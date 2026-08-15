/**
 * audioflix_duplicates_smoke.js
 *
 * The Audioflix duplicate detector + merge engine (audioflix.state.duplicates.js), exercised
 * against the real state store in a VM (state.groups + state, then duplicates):
 *   1. Detection: two music tracks sharing a title form one duplicate cluster; per-item lookups
 *      and the isDuplicate flag agree; the shared engine also flags soundboard duplicates.
 *   2. Dual-source merge: merging an ONLINE-url track and a FILE-path track of the same title
 *      leaves ONE survivor carrying BOTH (url = online, localPath = the file); the other is gone.
 *   3. Keep both: dismissDuplicate suppresses the notice for that pair without deleting anything.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
function runScript(ctx, rel) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel });
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

function makeCtx(stored) {
    const stores = { eveAudioflixFallbackState: stored ? JSON.stringify(stored) : null };
    const ctx = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, Promise,
        queueMicrotask, setTimeout, clearTimeout, RegExp,
        localStorage: {
            getItem: (k) => (k in stores ? stores[k] : null),
            setItem: (k, v) => { stores[k] = String(v); },
            removeItem: (k) => { delete stores[k]; }
        },
        config: {}, // a config root so ensure() caches its normalized state (like the real app)
        window: { dispatchEvent() {}, addEventListener() {} },
        CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; }
    };
    ctx.window.window = ctx.window;
    ctx.window.localStorage = ctx.localStorage;
    ctx.window.CustomEvent = ctx.CustomEvent;
    ctx.window.setTimeout = setTimeout;      // scheduleSave() persists via window.setTimeout
    ctx.window.clearTimeout = clearTimeout;
    return ctx;
}

function loadAll(ctx) {
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.schema.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.groups.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.recovery.js')
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.duplicates.js');
    return { S: ctx.window.EveAudioflixState, D: ctx.window.EveAudioflixDuplicates };
}

const ONLINE = 'https://youtube.com/watch?v=abc123';
const LOCAL = 'C:/Users/drift/Music/night-drive.mp3';

(function main() {
    // --- 1. Detection (music + shared soundboard path) ---
    {
        const ctx = makeCtx({
            music: [
                { id: 'a', title: 'Night Drive', url: ONLINE },
                { id: 'b', title: 'Night Drive', url: LOCAL }
            ],
            soundboard: [
                { id: 's1', title: 'Airhorn', url: 'C:/s/airhorn.wav' },
                { id: 's2', title: 'Airhorn', url: 'C:/s/airhorn-2.wav' }
            ]
        });
        const { D } = loadAll(ctx);
        const clusters = D.findDuplicates('music');
        assert(clusters.length === 1, 'one music duplicate cluster expected');
        assert(clusters[0].items.length === 2, 'cluster holds both tracks');
        assert(D.duplicatesFor('music', 'a').map((it) => it.id).join() === 'b', 'a matches b');
        assert(D.isDuplicate('music', 'a') && D.isDuplicate('music', 'b'), 'both flagged as dup');
        assert(D.isDuplicate('sound', 's1'), 'shared engine flags soundboard dup too');
        console.log('detection OK (music cluster + soundboard shared engine)');
    }

    // --- 2. Dual-source merge: online + file-path -> one track carrying both ---
    {
        const ctx = makeCtx({
            music: [
                { id: 'a', title: 'Night Drive', url: ONLINE },
                { id: 'b', title: 'Night Drive', url: LOCAL }
            ]
        });
        const { S, D } = loadAll(ctx);
        const res = D.mergeDuplicates('music', 'a', ['b'], '');
        assert(res.ok, 'merge returns ok');
        assert(res.dualSource === true, 'merge reports dual source (online + local combined)');
        const music = S.ensure().music;
        assert(music.length === 1 && music[0].id === 'a', 'only the primary survives');
        assert(music[0].url === ONLINE, 'survivor keeps the online url as primary source');
        assert(music[0].localPath === LOCAL, 'survivor now also carries the local file path');
        assert(D.duplicatesFor('music', 'a').length === 0, 'no duplicate remains after merge');
        console.log('dual-source merge OK (survivor has both url + localPath)');
    }

    // --- 3. Keep both: dismiss the pair without deleting either item ---
    {
        const ctx = makeCtx({
            music: [
                { id: 'a', title: 'Night Drive', url: ONLINE },
                { id: 'b', title: 'Night Drive', url: LOCAL }
            ]
        });
        const { S, D } = loadAll(ctx);
        assert(D.isDuplicate('music', 'a'), 'flagged before keep-both');
        const res = D.dismissDuplicate('a', 'b');
        assert(res.ok, 'dismissDuplicate returns ok');
        assert(D.duplicatesFor('music', 'a').length === 0, 'notice suppressed for the pair');
        assert(!D.isDuplicate('music', 'a') && !D.isDuplicate('music', 'b'), 'neither flagged now');
        assert(S.ensure().music.length === 2, 'keep-both deletes nothing');
        assert((S.ensure().dupDismissedPairs || []).includes('a|b'), 'dismissal persisted in state');
        console.log('keep-both OK (pair dismissed, both items kept)');
    }

    // --- 4. The real-world pair that used to slip through: one title carries a trailing ".wmv"
    //        and the two copies live in different folders (one with \ separators, one with /).
    {
        const ctx = makeCtx({
            music: [
                { id: 'ported', title: '[31]Follow Me Seira Kagami - Follow Me with lyrics',
                  url: 'C:\\Users\\alvin\\Downloads\\Temp-Music-Index-Holder\\All Songs\\[31]Follow Me Seira Kagami - Follow Me with lyrics.wmv.mp3',
                  classifiers: ['Anime-NoN-English Old Songs'] },
                { id: 'wpl', title: '[31]Follow Me Seira Kagami - Follow Me with lyrics.wmv',
                  url: 'C:/Users/alvin/Downloads/All Songs/[31]Follow Me Seira Kagami - Follow Me with lyrics.wmv.mp3',
                  classifiers: ['Instumental Old Songs'] }
            ]
        });
        const { D } = loadAll(ctx);
        assert(D.isDuplicate('music', 'ported') && D.isDuplicate('music', 'wpl'),
            'the ported copy and the WPL copy of the same song must be seen as duplicates');
        assert(D.duplicatesFor('music', 'ported').map((x) => x.id).join() === 'wpl', 'they pair with each other');
        console.log('real-world dup detection OK (trailing ext + same file name across folders)');
    }

    // --- 5. Merging carries the removed copy's classifiers and localizations onto the survivor ---
    {
        const ctx = makeCtx({
            music: [
                { id: 'keep', title: 'Song', url: 'https://y/1', classifiers: ['English only'],
                  localizations: [{ source: 'folder:Chill', path: 'D:/Chill/Song.mp3', kind: 'file' }] },
                { id: 'drop', title: 'Song', url: 'C:/music/Song.mp3', classifiers: ['Anime Only', 'English only'],
                  localizations: [{ source: 'group:Vibes', path: 'D:/Vibes/Song.mp3', kind: 'shortcut', linkOf: 'D:/Chill/Song.mp3' }] }
            ]
        });
        const { S, D } = loadAll(ctx);
        const res = D.mergeDuplicates('music', 'keep', ['drop']);
        assert(res.ok, 'merge succeeds');
        const survivor = S.ensure().music.find((m) => m.id === 'keep');
        assert(survivor.classifiers.includes('English only') && survivor.classifiers.includes('Anime Only'),
            `survivor keeps BOTH copies' classifiers (got ${JSON.stringify(survivor.classifiers)})`);
        assert(survivor.classifiers.filter((c) => c === 'English only').length === 1, 'shared classifiers are not duplicated');
        const sources = survivor.localizations.map((l) => l.source).sort();
        assert(sources.join() === 'folder:Chill,group:Vibes', `survivor keeps both localization scopes (got ${sources})`);
        assert(S.ensure().music.length === 1, 'the duplicate is gone');
        console.log('merge carries classifiers + localizations OK');
    }

    console.log('AUDIOFLIX_DUPLICATES_SMOKE_OK');
})();
