const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

function run(ctx, file) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}

function load(seed) {
    const store = { eveAudioflixFallbackState: JSON.stringify(seed) };
    const ctx = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, Promise, RegExp,
        queueMicrotask, setTimeout, clearTimeout,
        localStorage: {
            getItem: (key) => store[key] || null,
            setItem: (key, value) => { store[key] = String(value); }
        },
        config: {},
        window: {
            dispatchEvent() {},
            addEventListener() {},
            EveAudioflixNative: {}
        },
        CustomEvent: function CustomEvent(type, init) {
            this.type = type;
            this.detail = init?.detail;
        }
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
    ].forEach((file) => run(ctx, `js/modules/features/audioflix/${file}`));
    return ctx.window.EveAudioflixLocalize;
}

const localize = load({
    music: [
        {
            id: 'multi',
            title: 'Multi Path Song',
            folder: 'Chill',
            localizations: [
                { source: 'folder:Chill', path: 'D:/Chill/Multi Path Song.mp3', kind: 'file' },
                { source: 'folder:Archive', path: 'E:/Archive/Multi Path Song.mp3', kind: 'file' },
                { source: 'group:Vibes', path: 'F:/Vibes/Multi Path Song.mp3', kind: 'file' }
            ],
            localPath: 'D:/Chill/Multi Path Song.mp3'
        },
        {
            id: 'shared',
            title: 'Shared Elsewhere',
            folder: 'Chill',
            localizations: [
                { source: 'group:Other', path: 'G:/Other/Shared Elsewhere.mp3', kind: 'file' }
            ],
            localPath: 'G:/Other/Shared Elsewhere.mp3'
        },
        { id: 'remote', title: 'Remote Only', folder: 'Chill', url: 'https://y/remote' }
    ],
    musicGroups: ['Vibes'],
    musicGroupMap: { multi: ['Vibes'], shared: ['Vibes'], remote: ['Vibes'] }
});

const paths = localize.groupLocalizationPaths('Vibes');
assert(paths.memberCount === 3, `unique member count (got ${paths.memberCount})`);
assert(paths.firstClass.length === 1, `duplicate folder paths collapse (got ${paths.firstClass.length})`);
assert(paths.groupPaths.length === 1, `own group path visible (got ${paths.groupPaths.length})`);
assert(paths.inheritedPaths.length === 1, `external path visible (got ${paths.inheritedPaths.length})`);
assert(paths.uncoveredCount === 1, `remote-only member uncovered (got ${paths.uncoveredCount})`);

console.log('AUDIOFLIX_GROUP_PATH_SUMMARY_SMOKE_OK');
