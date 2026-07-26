// Smoke test for Audioflix WPL playlist parsing, importing, and Music Port folder syncing.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function makeCtx(initialState = {}, nativeStub = {}) {
    const memory = {};

    const localStorage = {
        getItem: (k) => (k in memory ? memory[k] : null),
        setItem: (k, v) => { memory[k] = String(v); },
        removeItem: (k) => { delete memory[k]; }
    };

    if (Object.keys(initialState).length) {
        memory['audioflix-state-v1'] = JSON.stringify(initialState);
    }

    class CustomEvent {
        constructor(type, detail) {
            this.type = type;
            this.detail = detail;
        }
    }

    const ctx = vm.createContext({
        window: {
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => {},
            setTimeout: setTimeout,
            clearTimeout: clearTimeout,
            localStorage,
            CustomEvent
        },
        localStorage,
        CustomEvent,
        setTimeout,
        clearTimeout,
        console,
        Date, Array, Set, Map, JSON, String, Number, Object, RegExp, Math
    });
    ctx.window.window = ctx.window;
    ctx.window.EveAudioflixNative = nativeStub;
    return ctx;
}

function runScript(ctx, relPath) {
    const code = fs.readFileSync(relPath, 'utf8');
    vm.runInContext(code, ctx);
}

function loadAll(ctx) {
    runScript(ctx, 'js/modules/features/audioflix/audioflix.paths.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.schema.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.groups.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.state.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.wpl.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.playlists.wpl.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.playlists.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.nexus.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.classifiers.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.localize.audit.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.localize.port.js');
    runScript(ctx, 'js/modules/features/audioflix/audioflix.localize.js');
    return {
        S: ctx.window.EveAudioflixState,
        PL: ctx.window.EveAudioflixPlaylists,
        WPL: ctx.window.EveAudioflixWpl,
        L: ctx.window.EveAudioflixLocalize
    };
}

(async function main() {
    // 1. WPL XML Parsing
    {
        const wplSample = `<?wpl version="1.0"?>
<smil>
    <head>
        <title>Anime High Energy</title>
    </head>
    <body>
        <seq>
            <media src="C:\\Music\\Track1.mp3"/>
            <media src="..\\Rock\\Track2.flac"/>
        </seq>
    </body>
</smil>`;
        const ctx = makeCtx();
        const { WPL } = loadAll(ctx);
        const parsed = WPL.parseWplXml(wplSample, 'C:/Users/alvin/Playlists/MyList.wpl');
        assert(parsed.ok === true, 'WPL parse ok');
        // The FILENAME wins when we know the path. Windows Media Player leaves the original name
        // in <title> forever, so preferring it made a renamed .wpl look permanently stuck on its
        // old name. The embedded title is only the fallback for pasted XML with no path.
        assert(parsed.title === 'MyList', `filename beats the stale embedded title (got ${parsed.title})`);
        const pasted = WPL.parseWplXml(wplSample, '');
        assert(pasted.title === 'Anime High Energy', `pasted XML with no path falls back to the embedded title (got ${pasted.title})`);
        assert(parsed.tracks.length === 2, '2 tracks found');
        assert(parsed.tracks[0].path === 'C:/Music/Track1.mp3', 'track 1 absolute path');
        assert(parsed.tracks[1].path === 'C:/Users/alvin/Rock/Track2.flac', `track 2 relative path resolved (got ${parsed.tracks[1].path})`);
        console.log('WPL XML parsing OK');
    }

    // 2. WPL Import
    {
        const wplSample = `<?wpl version="1.0"?>
<smil>
    <head><title>My WPL Mix</title></head>
    <body>
        <seq>
            <media src="C:/Music/SongA.mp3"/>
            <media src="C:/Music/SongB.mp3"/>
        </seq>
    </body>
</smil>`;
        const ctx = makeCtx();
        const { S, PL } = loadAll(ctx);
        const res = await PL.importWplPlaylist(wplSample);
        assert(res.ok === true && res.added === 2, 'imported 2 WPL tracks');
        assert(res.folder === 'WPL Playlists', 'default target folder = WPL Playlists');
        assert(res.group === 'My WPL Mix', 'WPL group title = My WPL Mix');

        console.log('TEST 2 RES:', res);
        const music = S.ensure().music;
        assert(music.length === 2, '2 tracks added to music library');
        assert(music.every(m => m.folder === 'WPL Playlists'), 'all tracks in WPL Playlists folder');
        assert(S.ensure().musicGroups.includes('My WPL Mix'), 'My WPL Mix added to musicGroups');
        console.log('WPL playlist import OK');
    }

    // 3. Music Port Connection & Folder Sync
    {
        const diskPath = 'C:/Users/alvin/Downloads/Temp-Music-Index-Holder/Old Song Relocation';
        const nat = {
            scanLocalized: async (dir) => ({
                ok: true,
                dir,
                files: [
                    { name: 'Song 1', fileName: 'Song 1.mp3', path: `${dir}/Anime/Song 1.mp3`, ext: 'mp3' },
                    { name: 'Song 2', fileName: 'Song 2.mp3', path: `${dir}/English/Song 2.mp3`, ext: 'mp3' }
                ]
            })
        };
        const ctx = makeCtx({}, nat);
        const { S, L } = loadAll(ctx);
        const resImport = await L.importMusicPort(diskPath, 'Ported-Folder');
        assert(resImport.ok === true && resImport.added === 2, 'imported 2 ported tracks');

        // Verify connection tracking saved in state
        const conns = S.ensure().musicPortConnections || [];
        assert(conns.length === 1 && conns[0].folder === 'Ported-Folder', 'musicPortConnection tracked');

        // Now simulate a folder sync where Song 2 was deleted from disk on PC
        nat.scanLocalized = async (dir) => ({
            ok: true,
            dir,
            files: [
                { name: 'Song 1', fileName: 'Song 1.mp3', path: `${dir}/Anime/Song 1.mp3`, ext: 'mp3' },
                { name: 'Song 3 (NEW)', fileName: 'Song 3.mp3', path: `${dir}/Anime/Song 3.mp3`, ext: 'mp3' }
            ]
        });

        const resSync = await L.syncMusicPortFolder('Ported-Folder');
        assert(resSync.ok === true, 'syncMusicPortFolder ok');
        assert(resSync.added === 1, '1 new track added');
        assert(resSync.missing === 1, '1 missing track flagged');

        const music = S.ensure().music;
        const song2 = music.find(m => m.title === 'Song 2');
        assert(song2.missingLocal === true, 'Song 2 marked missingLocal=true');
        console.log('Music Port Folder Sync OK');
    }

    // 4. WPL Import when tracks already exist in EveOS
    {
        const ctx = makeCtx();
        const { S, PL } = loadAll(ctx);

        // Pre-add an existing track under OLD-SONG-RELOCATION
        S.addItem('music', {
            title: 'Anxiety Freestyle',
            url: 'C:/Music/Anxiety.mp3',
            localPath: 'C:/Music/Anxiety.mp3',
            folder: 'OLD-SONG-RELOCATION',
            card: 'OLD-SONG-RELOCATION'
        });

        const wplSample = `<?wpl version="1.0"?>
<smil>
    <head><title>Rap Songs Only</title></head>
    <body>
        <seq>
            <media src="C:/Music/Anxiety.mp3"/>
            <media src="C:/Music/NewSong.mp3"/>
        </seq>
    </body>
</smil>`;

        const res = await PL.importWplPlaylist(wplSample);
        assert(res.ok === true && res.added === 2, 'reconciled 2 WPL tracks');

        const music = S.ensure().music;
        const groupMap = S.ensure().musicGroupMap || {};
        const anxiety = music.find(m => m.title === 'Anxiety Freestyle');
        assert(anxiety.folder === 'OLD-SONG-RELOCATION', 'existing track kept original folder');
        assert((groupMap[anxiety.id] || []).includes('Rap Songs Only'), 'existing track assigned to Rap Songs Only group');

        const newSong = music.find(m => m.title === 'NewSong');
        assert(newSong.folder === 'WPL Playlists', 'new track assigned to WPL Playlists folder');
        assert((groupMap[newSong.id] || []).includes('Rap Songs Only'), 'new track assigned to Rap Songs Only group');
        assert(music.length === 2, 'no duplicate tracks created');
        console.log('WPL Import with pre-existing tracks OK');
    }

    console.log('AUDIOFLIX_WPL_SMOKE_OK');
})().catch(err => { console.error(err); process.exit(1); });
