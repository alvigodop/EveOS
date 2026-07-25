/**
 * audioflix_ui_render_smoke.js
 *
 * Invokes the Audioflix UI factory modules' renderers directly (ui.render, ui.localize, nexus.ui)
 * so a template typo or bad reference in a rarely-boot-exercised view (music frontend, nexus panel,
 * localize forms, group paths, song localizations) fails here instead of only at click time.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
function runScript(ctx, rel) { vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel }); }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }
const isStr = (v) => typeof v === 'string';

const stored = {
    music: [
        { id: 'a', title: 'Night Drive', artist: 'Kavinsky', folder: 'Synthwave', duration: 194, url: 'https://y/a', localizations: [{ source: 'folder:Synthwave', path: 'D:/S/a.mp3', kind: 'file' }, { source: 'group:Fav', path: 'D:/Fav/a.mp3', kind: 'shortcut' }], localPath: 'D:/S/a.mp3' },
        { id: 'b', title: 'Sunset', artist: 'Kavinsky', folder: 'Chill', duration: 216, url: 'https://y/b' }
    ],
    musicGroups: ['Fav'], musicGroupMap: { a: ['Fav'] }
};

const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, RegExp,
    setTimeout, clearTimeout,
    localStorage: { getItem: () => JSON.stringify(stored), setItem() {}, removeItem() {} },
    config: {},
    window: { dispatchEvent() {}, addEventListener() {} }
};
ctx.window.window = ctx.window;
ctx.window.localStorage = ctx.localStorage;
ctx.window.setTimeout = setTimeout; ctx.window.clearTimeout = clearTimeout;

['audioflix.state.schema.js', 'audioflix.state.groups.js', 'audioflix.state.js', 'audioflix.nexus.js',
    'audioflix.localize.audit.js', 'audioflix.localize.port.js', 'audioflix.localize.js', 'audioflix.ui.render.js', 'audioflix.ui.localize.js', 'audioflix.nexus.ui.js']
    .forEach((f) => runScript(ctx, 'js/modules/features/audioflix/' + f));

const W = ctx.window;
const esc = (v) => String(v ?? '');
const noSvg = '';

// ui.render
const render = W.EveAudioflixUiRender.create({
    state: () => W.EveAudioflixState.ensure(), esc,
    itemMeta: (it) => String(it.artist || ''), groupKey: () => 'G',
    groupTags: () => '', internalViewButton: () => '',
    isItemExposed: () => true, allGroups: (t) => (t === 'music' ? ['Fav'] : []),
    groupsOf: (id, t) => (W.EveAudioflixState.ensure()[t === 'music' ? 'musicGroupMap' : 'soundGroupMap'] || {})[id] || [],
    stopSvg: noSvg, playSvg: noSvg, layerPlaySvg: noSvg, cogSvg: noSvg, closeSvg: noSvg,
    getPorted: () => [], getActiveRepeaters: () => ({}),
    getActiveMusicQueue: () => ({ isPlaying: false, items: [], currentIndex: -1, groupName: '' }),
    getCollapsedGroups: () => ({})
});
const track = W.EveAudioflixState.ensure().music[0];
assert(isStr(render.renderItemCard(track, 'music')) && render.renderItemCard(track, 'music').includes('Night Drive'), 'renderItemCard');
assert(isStr(render.renderItems(W.EveAudioflixState.ensure().music, 'music')), 'renderItems backend');
const fa = render.frontendActiveGroup('music');
assert(Array.isArray(fa.smart) && fa.smart.some(([k]) => k.startsWith('smart:artist:Kavinsky')), 'smart folders include shared artist');
assert(isStr(render.renderFrontendMusicActive()), 'renderFrontendMusicActive');
console.log('ui.render OK (cards, smart folders, frontend view)');

// ui.localize
const loc = W.EveAudioflixUiLocalize.create({
    esc, findItem: (t, id) => W.EveAudioflixState.ensure().music.find((m) => m.id === id) || null,
    getLocalizeFormOpen: () => ({ open: true, scope: 'group', key: 'Fav' }),
    getMissingListOpen: () => ({ open: false, scope: '', key: '' }),
    getGroupPathsOpen: () => ({ open: true, key: 'Fav' })
});
const form = loc.renderLocalizeForm();
assert(isStr(form) && form.includes('name="mode"'), 'group localize form has the class-mode selector');
['value="link"', 'value="smart"', 'value="dup"'].forEach((v) => assert(form.includes(v), `mode selector offers ${v}`));
assert(isStr(loc.renderMusicPortForm()), 'renderMusicPortForm');
const paths = loc.renderGroupPaths('Fav');
assert(isStr(paths) && paths.includes('1st class'), 'group paths popover lists 1st-class folder files');
const songLoc = loc.renderSongLocalizations(track);
assert(isStr(songLoc) && songLoc.includes('★'), 'song localizations list marks the effective path');
console.log('ui.localize OK (mode selector, group paths, song localizations)');

// nexus.ui
const nx = W.EveAudioflixNexusUi.create({ esc, getNexusState: () => ({ open: true, type: 'music', query: 'night', facet: '' }), getPorted: () => [] });
assert(isStr(nx.renderButton('music')) && nx.renderButton('music').includes('Nexus Audio Link'), 'nexus button');
const panel = nx.renderPanel('music');
assert(isStr(panel) && panel.includes('data-af-nexus-search') && panel.includes('Night Drive'), 'nexus panel renders search + a hit');
// Facet scopes start COLLAPSED (headers only, no chips) and open on demand — clicking a header is
// what reveals the options, so the panel isn't a wall of chips.
['artist', 'group', 'folder', 'duration'].forEach((sec) =>
    assert(panel.includes(`data-af-section="${sec}"`), `panel offers a collapsible ${sec} scope`));
assert(!panel.includes('artist::') && !panel.includes('around::'),
    'collapsed scopes must not render their chips yet');
W.EveAudioflixNexusUi.toggleSection('artist');
W.EveAudioflixNexusUi.toggleSection('duration');
const openPanel = nx.renderPanel('music');
assert(openPanel.includes('artist::'), 'expanding Artists reveals artist chips');
assert(openPanel.includes('around::') && openPanel.includes('below::'),
    'expanding Duration reveals BOTH soft-around and hard-under filters');
// Artist facets must actually be populated from track metadata (they were reported missing).
assert(openPanel.includes('Kavinsky'), 'artist chips are populated from track metadata');
console.log('nexus.ui OK (button, panel, live results)');

console.log('AUDIOFLIX_UI_RENDER_SMOKE_OK');
