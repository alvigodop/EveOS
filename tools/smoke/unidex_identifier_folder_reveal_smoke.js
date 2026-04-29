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
  includeCategoryTag: true
});

assert(groupedHtml.includes('class="unidex-identifier-group"'), 'Identifier grouping should render group sections');
assert(groupedHtml.includes('data-identifier-id="reading"'), 'Reading identifier group should render');
assert(groupedHtml.includes('No Identifier'), 'Unidentified group should render for unmarked bookmarks');
assert(groupedHtml.includes('Folder: Arc One / Nested Folder'), 'Folder tag should show folder path label');
assert(groupedHtml.includes('Folder: Arc One / Nested Folder'), 'Folder path should be available in hover/title text');

console.log(JSON.stringify({
  ok: true,
  saveConfigCalls: global.saveConfigCalls,
  renderDashboardCalls: global.renderDashboardCalls,
  unidexGroupMode: configHelpers.getEntriesGroupMode()
}, null, 2));
