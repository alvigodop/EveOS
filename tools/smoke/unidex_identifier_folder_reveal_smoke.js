const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const repoRoot = path.resolve(__dirname, '..', '..');

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: relativePath });
}

global.window = global;
global.EveOS = {
  NebulaJsonLink: {
    createLink(link) {
      const workspace = encodeURIComponent(String(link.workspace || 'main'));
      const category = encodeURIComponent(String(link.category || 'Unsorted'));
      const folder = String(link.folderId || '').trim();
      return `eve://workspace/${workspace}/card/${category}${folder ? `/folder/${encodeURIComponent(folder)}` : ''}/bookmark/${encodeURIComponent(String(link.id || ''))}`;
    }
  }
};
global.config = { activeWorkspace: 'main' };
global.eveState = { config: { activeWorkspace: 'main' }, links: [] };
global.document = {
  body: { appendChild() {} },
  getElementById() { return null; },
  createElement() {
    return {
      className: '',
      id: '',
      textContent: '',
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; } }
    };
  }
};
global.matchMedia = function () { return { matches: false }; };
global.saveConfigCalls = 0;
global.renderDashboardCalls = 0;
global.saveConfig = function () { global.saveConfigCalls += 1; };
global.renderDashboard = function () { global.renderDashboardCalls += 1; };
global.showToast = function () {};

global.EveBookmarkFolders = {
  buildScopedKey(workspaceId, categoryName) {
    return `${String(workspaceId || 'main').trim() || 'main'}::${String(categoryName || 'Unsorted').trim() || 'Unsorted'}`;
  },
  buildFolderPathLabel(workspaceId, categoryName, folderId) {
    if (String(folderId || '') === 'folder-1') return 'Arc One / Nested Folder';
    return '';
  }
};

loadScript('js/modules/ui/dashboard/categories/builder-card.header.js');
loadScript('js/modules/ui/dashboard/categories/builder-card.js');

assert(window.DashboardCategories.isCardBookmarkProgressiveRevealEnabled('main', 'Alpha') === true, 'Card reveal should default to enabled');
assert(window.DashboardCategories.isFolderBookmarkProgressiveRevealEnabled('main', 'Alpha', 'folder-1') === true, 'Folder reveal should inherit enabled card default');

window.DashboardCategories.setCardBookmarkProgressiveRevealEnabled('main', 'Alpha', false);
assert(window.DashboardCategories.isFolderBookmarkProgressiveRevealEnabled('main', 'Alpha', 'folder-1') === false, 'Folder reveal should inherit disabled card setting');

window.DashboardCategories.setFolderBookmarkProgressiveRevealMode('main', 'Alpha', 'folder-1', 'on');
assert(window.DashboardCategories.getFolderBookmarkProgressiveRevealMode('main', 'Alpha', 'folder-1') === 'on', 'Folder reveal mode should persist as on');
assert(window.DashboardCategories.isFolderBookmarkProgressiveRevealEnabled('main', 'Alpha', 'folder-1') === true, 'Folder on override should beat disabled card setting');

window.DashboardCategories.setFolderBookmarkProgressiveRevealMode('main', 'Alpha', 'folder-1', 'off');
assert(window.DashboardCategories.isFolderBookmarkProgressiveRevealEnabled('main', 'Alpha', 'folder-1') === false, 'Folder off override should disable reveal');

window.DashboardCategories.setFolderBookmarkProgressiveRevealMode('main', 'Alpha', 'folder-1', 'inherit');
assert(window.DashboardCategories.getFolderBookmarkProgressiveRevealMode('main', 'Alpha', 'folder-1') === 'inherit', 'Folder inherit should clear explicit mode');
assert(!Object.keys(window.eveState.config.folderBookmarkProgressiveReveal || {}).length, 'Folder reveal inherit should not leave config dumps');

loadScript('js/modules/ui/dashboard/unidex-view.controls.state.config.js');
const localConfig = {};
let persisted = 0;
let rendered = 0;
const configHelpers = window.UnidexViewModules.createControlsStateConfig({
  readConfig: () => localConfig,
  persistConfig: () => { persisted += 1; },
  requestRender: () => { rendered += 1; }
});
assert(configHelpers.getEntriesGroupMode() === 'flat', 'Unidex entry group mode should default to flat');
configHelpers.setEntriesGroupMode('identifiers');
assert(configHelpers.getEntriesGroupMode() === 'identifiers', 'Unidex entry group mode should persist identifiers');
assert(localConfig.unidexEntriesGroupMode === 'identifiers', 'Unidex group mode should write config');
assert(persisted === 1 && rendered === 1, 'Changing group mode should persist and render once');
configHelpers.setEntriesGroupMode('unknown');
assert(configHelpers.getEntriesGroupMode() === 'flat', 'Invalid group mode should normalize to flat');
assert(persisted === 2 && rendered === 2, 'Invalid group mode change should persist and render once');
assert(configHelpers.getEntriesDensityMode() === 'comfortable', 'Unidex entry density should default to comfortable');
configHelpers.setEntriesDensityMode('compact');
assert(configHelpers.getEntriesDensityMode() === 'compact', 'Unidex entry density should persist compact');
assert(localConfig.unidexEntriesDensity === 'compact', 'Unidex density mode should write config');
configHelpers.setEntriesDensityMode('atlas');
assert(configHelpers.getEntriesDensityMode() === 'atlas', 'Unidex entry density should persist atlas');
configHelpers.setEntriesDensityMode('unknown');
assert(configHelpers.getEntriesDensityMode() === 'comfortable', 'Invalid density mode should normalize to comfortable');
configHelpers.setEntriesDensityMode('unknown');
assert(persisted === 5 && rendered === 5, 'Density mode should persist/render only on actual changes');

global.EveBookmarkIdentifiers = {
  getDefinitions() {
    return [
      { id: 'reading', label: 'Reading', color: '#4f8cff' },
      { id: 'watching', label: 'Watching', color: '#ff7a59' }
    ];
  },
  getIdentifiersForLink(link) {
    return Array.isArray(link.identifiers) ? link.identifiers : [];
  },
  buildBadgeHtml(ids) {
    return ids.map((id) => `<span class="bookmark-identifier-badge">${id}</span>`).join('');
  },
  getBadgeHtmlForLink(link) {
    return this.buildBadgeHtml(this.getIdentifiersForLink(link));
  }
};
global.EveQuickPins = { isBookmarkPinned() { return false; } };
global.EveBookmarkCovers = { getDisplayCover() { return ''; } };

loadScript('js/modules/ui/dashboard/unidex-view.builders.entries.js');
const entryBuilders = window.UnidexViewModules.createEntryBuilders({
  encodeParam: encodeURIComponent,
  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  getDomain() { return 'example.com'; },
  truncateText(value) { return String(value || ''); },
  buildBookmarkIconHtml() { return '<span>link</span>'; }
});

const groupedHtml = entryBuilders.buildEntriesHtml([
  {
    id: 'link-1',
    title: 'Nested Bookmark',
    url: 'https://example.com/one',
    workspace: 'main',
    category: 'Alpha',
    folderId: 'folder-1',
    identifiers: ['reading']
  },
  {
    id: 'link-2',
    title: 'Unmarked Bookmark',
    url: 'https://example.com/two',
    workspace: 'main',
    category: 'Alpha',
    identifiers: []
  }
], false, 'rows', {
  groupMode: 'identifiers',
  includeCategoryTag: true,
  densityMode: 'atlas'
});

assert(groupedHtml.includes('class="unidex-identifier-group"'), 'Identifier grouping should render group sections');
assert(groupedHtml.includes('data-identifier-id="reading"'), 'Reading identifier group should render');
assert(groupedHtml.includes('is-density-atlas'), 'Identifier grouping should preserve density classes on entries');
assert(groupedHtml.includes('No Identifier'), 'Unidentified group should render for unmarked bookmarks');
assert(groupedHtml.includes('Folder: Arc One / Nested Folder'), 'Folder tag should show folder path label');
assert(groupedHtml.includes('Folder: Arc One / Nested Folder'), 'Folder path should be available in hover/title text');
assert(groupedHtml.includes('data-entity-link="eve://workspace/main/card/Alpha/folder/folder-1/bookmark/link-1"'), 'Unidex entries should expose canonical entity links');
assert(groupedHtml.includes('openEntryJsonState'), 'Unidex entries should expose JSON State actions');
assert(groupedHtml.includes('validateEntryJsonLink'), 'Unidex entries should expose entity-link validation actions');

console.log(JSON.stringify({
  ok: true,
  saveConfigCalls: global.saveConfigCalls,
  renderDashboardCalls: global.renderDashboardCalls,
  unidexGroupMode: configHelpers.getEntriesGroupMode(),
  unidexDensityMode: configHelpers.getEntriesDensityMode()
}, null, 2));
