/**
 * audioflix_localize_smoke.js
 *
 * Music-library localization orchestration (audioflix.localize.js) against the real state store,
 * with the native transport stubbed (no server / yt-dlp needed):
 *   1. Scope collection: library / folder / group / song select the right tracks.
 *   2. Candidates: only ONLINE tracks lacking a local file are localized.
 *   3. localizeScope tags each downloaded track with localPath while KEEPING its url (dual-source).
 *   4. Reimport "music port": scanning a folder re-attaches files to tracks by normalized title.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
function runScript(ctx, rel) { vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel }); }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

function makeCtx(stored, nativeStub) {
    const stores = { eveAudioflixFallbackState: stored ? JSON.stringify(stored) : null };
    const ctx = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, Promise, RegExp,
        queueMicrotask, setTimeout, clearTimeout,
        localStorage: {
            getItem: (k) => (k in stores ? stores[k] : null),
            setItem: (k, v) => { stores[k] = String(v); },
            removeItem: (k) => { delete stores[k]; }
        },
        config: {},
        window: { dispatchEvent() {}, addEventListener() {} },
        CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; }
    };
    ctx.window.window = ctx.window;
    ctx.window.localStorage = ctx.localStorage;
    ctx.window.CustomEvent = ctx.CustomEvent;
    ctx.window.setTimeout = setTimeout;
    ctx.window.clearTimeout = clearTimeout;
    ctx.window.EveAudioflixNative = nativeStub;
    return ctx;
}

function loadAll(ctx) {
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.groups.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.localize.js');
    return { S: ctx.window.EveAudioflixState, L: ctx.window.EveAudioflixLocalize };
}

const SEED = {
    music: [
        { id: 'a', title: 'Night Drive', url: 'https://youtube.com/watch?v=1', folder: 'Chill' },
        { id: 'b', title: 'Local Song', url: 'C:/music/local.mp3', folder: 'Chill' },
        { id: 'c', title: 'Focus Flow', url: 'https://youtube.com/watch?v=2', folder: 'Focus' }
    ],
    musicGroups: ['G'],
    musicGroupMap: { a: ['G'] }
};

function stub() {
    const downloaded = [];
    return {
        downloaded,
        localizeTrack: async (track, dir) => { downloaded.push(track.id); return { ok: true, id: track.id, filePath: `${dir}/${track.title}.mp3`, ext: 'mp3', mp3: true }; },
        scanLocalized: async (dir) => ({ ok: true, dir, files: [{ name: 'Night Drive', fileName: 'Night Drive.mp3', path: `${dir}/Night Drive.mp3`, ext: 'mp3' }] })
    };
}

(async function main() {
    // --- 1 + 2. Scope collection + candidates ---
    {
        const { L } = loadAll(makeCtx(SEED, stub()));
        assert(L.collectScope('library').length === 3, 'library scope = all 3');
        assert(L.collectScope('folder', 'Chill').map(i => i.id).sort().join() === 'a,b', 'folder Chill = a,b');
        assert(L.collectScope('group', 'G').map(i => i.id).join() === 'a', 'group G = a');
        assert(L.collectScope('song', 'c').map(i => i.id).join() === 'c', 'song = c');
        // Only online tracks with no local file are candidates (b is a local path -> excluded).
        assert(L.localizeCandidates('library').map(i => i.id).sort().join() === 'a,c', 'candidates = online-only a,c');
        console.log('scope + candidates OK');
    }

    // --- 3. localizeScope tags localPath but keeps the online url (dual-source) ---
    {
        const nat = stub();
        const { S, L } = loadAll(makeCtx(SEED, nat));
        const res = await L.localizeScope('folder', 'Chill', 'D:/EveMusic', () => {});
        assert(res.ok && res.done === 1 && res.total === 1, `localized 1 online track in Chill (got done=${res.done})`);
        assert(nat.downloaded.join() === 'a', 'only track a was downloaded');
        const a = S.ensure().music.find(m => m.id === 'a');
        assert(a.url === 'https://youtube.com/watch?v=1', 'a keeps its online url');
        assert(a.localPath === 'D:/EveMusic/Night Drive.mp3', 'a now carries a localPath');
        assert(S.ensure().localizeDir === 'D:/EveMusic', 'target folder remembered for next time');
        // Re-running finds nothing to localize (already has localPath).
        assert(L.localizeCandidates('folder', 'Chill').length === 0, 're-run has no candidates');
        console.log('localizeScope OK (dual-source: url kept + localPath added)');
    }

    // --- 4. Reimport music port: attach files to tracks by title ---
    {
        const { S, L } = loadAll(makeCtx(SEED, stub()));
        const res = await L.reimportMerge('D:/EveMusic');
        assert(res.ok && res.matched === 1, `reimport matched 1 by title (got ${res.matched})`);
        const a = S.ensure().music.find(m => m.id === 'a');
        assert(a.localPath === 'D:/EveMusic/Night Drive.mp3', 'reimport re-attached localPath by title');
        console.log('reimport music port OK');
    }

    console.log('AUDIOFLIX_LOCALIZE_SMOKE_OK');
})().catch((err) => { console.error(err); process.exit(1); });
