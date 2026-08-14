const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const feature = (name) => path.join(ROOT, 'js', 'modules', 'features', 'audioflix', name);
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

const store = { music: [], musicPlaylists: [], musicGroups: [], musicGroupMap: {} };
let sequence = 0;
let nativeOnline = true;
let listCalls = 0;

global.window = {
    EveAudioflixNative: {
        async listInstagramCollection(source, options) {
            listCalls += 1;
            if (!nativeOnline) return { ok: false, reason: 'localhost offline' };
            const urls = source.split('\n');
            return {
                ok: true,
                playlistId: 'instagram:Alpha_1,Beta-2',
                title: options.title || 'Imported Reels',
                scrapeSource: 'yt-dlp',
                entries: urls.map((url, index) => ({
                    sourceId: index === 0 ? 'Alpha_1' : 'Beta-2',
                    title: index === 0 ? 'Sunset Drive' : 'Night Train',
                    artist: index === 0 ? 'drift' : 'nova',
                    image: `https://cdn.example/${index}.jpg`,
                    duration: 12 + index,
                    position: index + 1,
                    url,
                    sourceProvider: 'instagram'
                }))
            };
        },
        async resolveUrl(url) {
            return { ok: true, audioUrl: `https://media.example/audio.m4a?source=${encodeURIComponent(url)}`, duration: 14 };
        },
        getProxyUrl(url) { return `http://127.0.0.1:9082/api/proxy?url=${encodeURIComponent(url)}`; }
    },
    EveAudioflixState: {
        ensure: () => store,
        update(patch) { Object.assign(store, JSON.parse(JSON.stringify(patch))); },
        addMusicGroup(name) {
            if (!store.musicGroups.includes(name)) store.musicGroups.push(name);
        },
        addItem(type, item) {
            const added = { ...item, id: item.id || `music_${++sequence}`, type };
            store.music.push(added);
            return added;
        },
        updateItem(type, id, patch) {
            const item = store.music.find((entry) => entry.id === id);
            if (item) Object.assign(item, patch);
            return item;
        },
        toggleMusicGroup(id, group, enabled) {
            const current = store.musicGroupMap[id] || [];
            store.musicGroupMap[id] = enabled
                ? [...new Set(current.concat(group))]
                : current.filter((value) => value !== group);
        },
        renameGroup(type, oldName, newName) {
            store.musicGroups = store.musicGroups.map((name) => name === oldName ? newName : name);
            Object.keys(store.musicGroupMap).forEach((id) => {
                store.musicGroupMap[id] = store.musicGroupMap[id]
                    .map((name) => name === oldName ? newName : name);
            });
        },
        removeItem(type, id) { store.music = store.music.filter((entry) => entry.id !== id); }
    },
    EveAudioflixPlaylistsWpl: {
        create() {
            return {
                importWplPlaylist: async () => ({ ok: false }),
                syncWplPlaylist: async () => ({ ok: false })
            };
        }
    }
};
global.CustomEvent = class CustomEvent {};

[
    'audioflix.state.schema.js',
    'audioflix.audio.url.providers.js',
    'audioflix.audio.source.js',
    'audioflix.playlists.providers.js',
    'audioflix.playlists.instagram.js',
    'audioflix.audio.url.instagram.js',
    'audioflix.playlists.js'
].forEach((name) => vm.runInThisContext(fs.readFileSync(feature(name), 'utf8'), { filename: name }));

(async () => {
    const source = [
        'https://instagram.com/reels/Alpha_1/?igsh=one',
        'https://www.instagram.com/reel/Alpha_1/',
        'notes https://instagram.com/p/Beta-2/?utm_source=test'
    ].join('\n');
    const parsed = window.EveAudioflixInstagramPlaylists.parseUrls(source);
    assert(parsed.length === 2, 'aliases and duplicate Reel URLs collapse to two entries');
    assert(parsed[0] === 'https://www.instagram.com/reel/Alpha_1/', '/reels/ canonicalizes to /reel/');
    assert(parsed[1] === 'https://www.instagram.com/p/Beta-2/', 'post URLs canonicalize without query noise');

    const imported = await window.EveAudioflixPlaylists.importPlaylist(source, { group: 'Road Trip Reels' });
    assert(imported.ok && imported.added === 2, 'a pasted Reel collection imports every unique URL');
    assert(listCalls === 1, 'localhost enrichment runs once for the collection');
    const connection = store.musicPlaylists[0];
    assert(connection.provider === 'instagram', 'connection records Instagram provenance');
    assert(connection.group === 'Road Trip Reels', 'the user title becomes the Audioflix group');
    assert(connection.folder === 'IG Reel Playlists', 'Instagram imports use their dedicated default folder');
    assert(connection.url === parsed.join('\n'), 'only canonical, deduplicated URLs are stored');
    assert(connection.scrapeSource === 'yt-dlp', 'connection records its enrichment route');
    assert(store.music.length === 2 && store.musicGroups.includes('Road Trip Reels'), 'tracks and group are created');
    assert(store.music.every((track) => track.folder === 'IG Reel Playlists'), 'all tracks inherit the collection folder');
    assert(store.music.every((track) => track.sourceProvider === 'instagram'), 'all tracks retain provider identity');
    assert(store.musicGroupMap[store.music[1].id]?.includes('Road Trip Reels'), 'tracks join the collection group');
    assert(store.music[1].playlistPosition === 2 && store.music[1].image, 'position and artwork metadata survive import');

    const retried = await window.EveAudioflixPlaylists.importPlaylist(source, { folder: 'Moved Reels' });
    assert(retried.ok && retried.added === 0, 're-import synchronizes instead of duplicating tracks');
    assert(store.music.length === 2 && store.music.every((track) => track.folder === 'Moved Reels'), 're-import can move the collection folder');

    nativeOnline = false;
    const fallback = await window.EveAudioflixInstagramPlaylists.fetchPlaylist(
        'https://instagram.com/reel/Offline_3/', false, { title: 'Offline Reels' }
    );
    assert(fallback.ok && fallback.entries.length === 1, 'file-mode fallback still imports a Reel URL');
    assert(fallback.entries[0].title === 'Instagram Reel 1' && fallback.scrapeSource === 'url-list', 'fallback is transparent about missing metadata');

    const item = store.music[0];
    assert(window.EveAudioflixUrlProviders.providerFor(item.url) === 'instagram', 'Reel tracks select the Instagram controller');
    assert(window.EveAudioflixAudioSource.needsResolution(item.url), 'normal card playback resolves hidden Reel audio');
    const resolved = await window.EveAudioflixAudioSource.resolveItem(item);
    assert(resolved.sourceUrl === item.url && resolved.url.includes('/api/proxy?'), 'resolved Reel audio keeps its source and uses the local proxy');
    assert(window.EveAudioflixInstagramPlayback.embedUrl(item.url).includes('/embed/'), 'internal view builds the official Instagram embed URL');

    const schema = window.EveAudioflixStateSchema.create({
        text: (value, fallback = '') => String(value ?? '').trim() || String(fallback ?? '').trim(),
        normalizeVolume: (value, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback,
        id: (prefix) => `${prefix}_fallback`
    });
    const restored = schema.cleanItem({
        ...item,
        localPath: 'C:\\Media\\reel.mp4',
        localizations: [{ source: 'folder:Reels', path: 'C:\\Media\\reel.mp4', kind: 'file' }],
        classifiers: ['Ambient', 'Travel'],
        exposed: true
    }, 'music');
    assert(restored.sourceProvider === 'instagram' && restored.sourceId === item.sourceId, 'provider source identity survives backup normalization');
    assert(restored.playlistId === connection.id && restored.playlistPosition === 1, 'playlist identity survives backup normalization');
    assert(restored.localPath.endsWith('.mp4') && restored.localizations.length === 1, 'localized Reel video paths survive backup normalization');
    assert(restored.classifiers.length === 2 && restored.exposed, 'classifiers and frontend exposure survive backup normalization');

    console.log('AUDIOFLIX_INSTAGRAM_PLAYLIST_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
