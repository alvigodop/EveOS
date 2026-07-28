const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const run = (ctx, name) => vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'modules', 'features', 'audioflix', name), 'utf8'),
    ctx,
    { filename: name }
);
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const stored = {
        music: [{
            id: 'spotify-owned',
            title: 'Mobius',
            artist: 'Sawano Hiroyuki',
            url: 'https://open.spotify.com/track/spotifyOwned123',
            sourceProvider: 'spotify',
            folder: 'Spotify Imports'
        }]
    };
    const stores = { eveAudioflixFallbackState: JSON.stringify(stored) };
    const downloaded = [];
    const native = {
        localizeTrack: async (track) => {
            downloaded.push(track.id);
            return { ok: false, error: 'Spotify must not reach this method.' };
        },
        scanLocalized: async (dir) => ({
            ok: true,
            dir,
            files: [{
                name: 'Mobius - Sawano Hiroyuki',
                fileName: 'Mobius - Sawano Hiroyuki.mp3',
                path: `${dir}/Mobius - Sawano Hiroyuki.mp3`,
                ext: 'mp3'
            }]
        })
    };
    const ctx = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, Promise,
        RegExp, queueMicrotask, setTimeout, clearTimeout, config: {},
        localStorage: {
            getItem: (key) => stores[key] ?? null,
            setItem: (key, value) => { stores[key] = String(value); },
            removeItem: (key) => { delete stores[key]; }
        },
        CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
        window: { dispatchEvent() {}, addEventListener() {}, EveAudioflixNative: native }
    };
    Object.assign(ctx.window, {
        window: ctx.window,
        localStorage: ctx.localStorage,
        CustomEvent: ctx.CustomEvent,
        setTimeout,
        clearTimeout
    });
    [
        'audioflix.paths.js',
        'audioflix.state.schema.js',
        'audioflix.state.groups.js',
        'audioflix.state.js',
        'audioflix.nexus.js',
        'audioflix.classifiers.js',
        'audioflix.localize.audit.js',
        'audioflix.localize.port.js',
        'audioflix.localize.js'
    ].forEach((name) => run(ctx, name));

    const result = await ctx.window.EveAudioflixLocalize.localizeScope(
        'folder',
        'Spotify Imports',
        'D:/OwnedSpotify',
        () => {}
    );
    const track = ctx.window.EveAudioflixState.ensure().music[0];
    assert(result.ok && result.done === 0 && result.total === 0, 'owned-file match completes without a download');
    assert(downloaded.length === 0, 'Spotify metadata never enters the downloader');
    assert(track.localPath === 'D:/OwnedSpotify/Mobius - Sawano Hiroyuki.mp3', 'owned local file was attached');
    assert(
        track.localizations.some((entry) => entry.source === 'folder:Spotify Imports'),
        'local file retains folder ownership metadata'
    );
    console.log('AUDIOFLIX_SPOTIFY_LOCALIZE_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
