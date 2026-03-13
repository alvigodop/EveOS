const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || process.cwd();

function load(relPath) {
  const fullPath = path.join(repo, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(source, { filename: fullPath });
}

global.window = global;
global.location = { origin: 'https://eveos.local' };
global.document = {
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null
};
global.config = { activeWorkspace: 'main', workspaces: [{ id: 'main', name: 'Main' }] };

global.eveState = {
  config: global.config,
  bookmarkFolders: {},
  links: []
};

global.window.EveLibrary = {
  ConnectionsAPI: {
    findConnectionByLinkId(linkId) {
      return this._connections.find((item) => String(item.linkId) === String(linkId)) || null;
    },
    getLinkedEntry(linkId) {
      const conn = this.findConnectionByLinkId(linkId);
      if (!conn) return null;
      const entry = global.window.EveLibrary.EntriesAPI.getEntryById('main', conn.categoryName, conn.entryId);
      if (!entry) return null;
      return { connection: { ...conn }, entry: JSON.parse(JSON.stringify(entry)) };
    },
    _connections: [
      { linkId: 'library-cover', entryId: 'entry-1', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'note-ok-bookmark', entryId: 'entry-note-ok', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'note-missing-bookmark', entryId: 'entry-note-missing', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'bookmark-note-only', entryId: 'entry-note-missing', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'stale-connection-bookmark', entryId: 'entry-does-not-exist', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'source-only-summary', entryId: 'entry-source-only', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'library-genre-bookmark', entryId: 'entry-with-genre', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'library-tags-bookmark', entryId: 'entry-with-tags', workspace: 'main', categoryName: 'OtherCategory' }
    ]
  },
  EntriesAPI: {
    getEntryById(workspaceId, categoryName, entryId) {
      if (String(workspaceId) !== 'main' || String(categoryName) !== 'OtherCategory') return null;
      return this._entries[entryId] || null;
    },
    _entries: {
      'entry-1': { id: 'entry-1', image: 'https://img.example.com/library-cover.jpg' },
      'entry-note-ok': { id: 'entry-note-ok', summary: 'Already has notes' },
      'entry-note-missing': { id: 'entry-note-missing' },
      'entry-source-only': { id: 'entry-source-only', summary: 'Source: https://source.example.com/item' },
      'entry-with-genre': { id: 'entry-with-genre', genre: 'Action, Drama' },
      'entry-with-tags': { id: 'entry-with-tags', tags: ['fav', 'queue'] }
    }
  }
};

load('js/modules/features/duplicate-sensor.js');
load('js/modules/features/bookmark-covers.js');
load('js/modules/features/bookmark-folders.js');

global.eveState.links = [
  { id: 'domain-favicon', url: 'https://mangadex.org/title/123', title: 'Domain Favicon Only' },
  { id: 'local-missing-icon', url: 'file:///C:/Users/alvin/test.html', title: 'Local Missing Icon' },
  { id: 'primary-cover', url: 'https://site.example.com/a', title: 'Primary Cover', coverImage: 'https://img.example.com/primary.jpg' },
  { id: 'extra-cover', url: 'https://site.example.com/b', title: 'Extra Cover', coverImages: ['https://img.example.com/random-a.jpg'] },
  { id: 'fixed-cover', url: 'https://site.example.com/c', title: 'Fixed Cover', coverImages: ['https://img.example.com/random-b.jpg'], fixedCoverImage: 'https://img.example.com/random-b.jpg' },
  { id: 'library-cover', url: 'https://site.example.com/d', title: 'Library Cover' },
  { id: 'missing-cover', url: 'https://site.example.com/e', title: 'Missing Cover' },
  { id: 'note-ok-bookmark', url: 'https://site.example.com/note-ok', title: 'Library Notes Present' },
  { id: 'note-missing-bookmark', url: 'https://site.example.com/note-missing', title: 'Missing Notes' },
  { id: 'bookmark-note-only', url: 'https://site.example.com/bookmark-note', title: 'Bookmark Note Present', notes: 'Bookmark-level note text' },
  { id: 'stale-connection-bookmark', url: 'https://site.example.com/stale', title: 'Stale Connection Bookmark' },
  { id: 'source-only-summary', url: 'https://site.example.com/source-only', title: 'Source Only Summary Bookmark' },
  { id: 'library-genre-bookmark', url: 'https://site.example.com/genre', title: 'Library Genre Bookmark' },
  { id: 'library-tags-bookmark', url: 'https://site.example.com/tags', title: 'Library Tags Bookmark' },
  { id: 'bookmark-tagged', url: 'https://site.example.com/bookmark-tagged', title: 'Bookmark Tagged', tags: ['manual-tag'] },
  { id: 'dup-a', url: 'https://www.example.com/series/1?b=2&a=1#part', title: 'Duplicate A' },
  { id: 'dup-b', url: 'https://example.com/series/1?a=1&b=2', title: 'Duplicate B' }
];

const view = global.window.EveBookmarkFolders.buildFolderView('main', 'Test', global.eveState.links);

function idsForGhost(ghostId) {
  return (view.folderLinks.get(ghostId) || []).map((link) => String(link.id));
}

const missingIcons = idsForGhost('__ghost_missing_icons__');
const missingCovers = idsForGhost('__ghost_missing_covers__');
const missingNotes = idsForGhost('__ghost_missing_notes__');
const untagged = idsForGhost('__ghost_untagged__');
const duplicateSuspects = idsForGhost('__ghost_duplicate_suspects__');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(missingIcons.includes('local-missing-icon'), 'local/file bookmark should be in missing icons');
assert(!missingIcons.includes('domain-favicon'), 'domain favicon bookmark should not be in missing icons');
assert(!missingCovers.includes('primary-cover'), 'primary cover bookmark should not be in missing covers');
assert(!missingCovers.includes('extra-cover'), 'bookmark with additional covers should not be in missing covers');
assert(!missingCovers.includes('fixed-cover'), 'bookmark with fixed extra cover should not be in missing covers');
assert(!missingCovers.includes('library-cover'), 'library-linked image should satisfy missing covers');
assert(missingCovers.includes('missing-cover'), 'bookmark with no cover sources should remain in missing covers');
assert(!missingNotes.includes('note-ok-bookmark'), 'linked entry with summary should not be in missing notes');
assert(missingNotes.includes('note-missing-bookmark'), 'linked entry without notes should be in missing notes');
assert(!missingNotes.includes('bookmark-note-only'), 'bookmark-level notes should satisfy missing notes');
assert(!missingNotes.includes('stale-connection-bookmark'), 'stale library connections should not count as missing notes');
assert(missingNotes.includes('source-only-summary'), 'source-only auto summary should still count as missing notes');
assert(!untagged.includes('library-genre-bookmark'), 'linked library genre should satisfy tagged state');
assert(!untagged.includes('library-tags-bookmark'), 'linked library tags should satisfy tagged state');
assert(!untagged.includes('bookmark-tagged'), 'bookmark-level tags should satisfy tagged state');
assert(duplicateSuspects.includes('dup-a') && duplicateSuspects.includes('dup-b'), 'duplicate suspects should use normalized URL logic');

console.log('SMART_GHOST_CALIBRATION_OK', JSON.stringify({
  missingIcons,
  missingCovers,
  missingNotes,
  untagged,
  duplicateSuspects
}));
