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
  bookmarkFolders: {
    'main::Test': {
      nodes: [
        {
          id: 'folder-h18',
          parentId: null,
          name: 'H18',
          order: 0,
          createdAt: Date.now() - 1000,
          updatedAt: Date.now() - 1000,
          clickBehaviorMode: 'inherit',
          taskMode: 'inherit'
        }
      ],
      settings: { clickBehaviorMode: 'inherit' }
    }
  },
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
      { linkId: 'library-tags-bookmark', entryId: 'entry-with-tags', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'action-a', entryId: 'entry-action-a', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'action-b', entryId: 'entry-action-b', workspace: 'main', categoryName: 'OtherCategory' },
      { linkId: 'action-c', entryId: 'entry-action-c', workspace: 'main', categoryName: 'OtherCategory' }
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
      'entry-note-missing': {
        id: 'entry-note-missing',
        tags: ['Male Protagonist', 'Fantasy'],
        language: 'English',
        libraryStatus: { id: 'reading', label: 'Reading' },
        derivedRatings: { activeValue: 8.1, confidence: 0.77 },
        chapter: 34,
        publicationYear: 2021
      },
      'entry-source-only': { id: 'entry-source-only', summary: 'Source: https://source.example.com/item' },
      'entry-with-genre': { id: 'entry-with-genre', genre: 'Action, Drama' },
      'entry-with-tags': { id: 'entry-with-tags', tags: ['fav', 'queue'] },
      'entry-action-a': {
        id: 'entry-action-a',
        author: 'Writer One',
        authorAltNames: ['W. One'],
        genre: 'Action, Adventure',
        language: 'English',
        libraryStatus: { id: 'reading', label: 'Reading' },
        derivedRatings: { activeValue: 8.7, confidence: 0.82 },
        chapter: 48,
        demographic: 'Seinen',
        publicationYear: 2022
      },
      'entry-action-b': {
        id: 'entry-action-b',
        author: 'Writer Two',
        genre: 'Action, Drama',
        language: 'ja',
        libraryStatus: { id: 'completed', label: 'Completed' },
        derivedRatings: { activeValue: 7.4, confidence: 0.61 },
        chapter: 128,
        demographic: 'Shonen',
        publicationYear: 2018
      },
      'entry-action-c': {
        id: 'entry-action-c',
        author: 'Writer One',
        genre: 'Action',
        language: 'Korean',
        libraryStatus: { id: 'plan_to_read', label: 'Plan to Read' },
        derivedRatings: { activeValue: 9.2, confidence: 0.94 },
        chapter: 512,
        demographic: 'Seinen',
        publicationYear: 2009
      }
    }
  }
};

load('js/modules/features/duplicate-sensor.js');
load('js/modules/features/bookmark-covers.js');
load('js/modules/features/bookmark-folders/bookmark-folders.shared.store.js');
load('js/modules/features/bookmark-folders/bookmark-folders.shared.library.js');
load('js/modules/features/bookmark-folders/bookmark-folders.shared.derived.js');
load('js/modules/features/bookmark-folders/bookmark-folders.shared.js');
load('js/modules/features/bookmark-folders/bookmark-folders.ghost-sensors.js');
load('js/modules/features/bookmark-folders/bookmark-folders.ghost-recursion.js');
load('js/modules/features/bookmark-folders/bookmark-folders.ghosts.js');
load('js/modules/features/bookmark-folders/bookmark-folders.view.js');
load('js/modules/features/bookmark-folders/bookmark-folders.management.toolbar.js');
load('js/modules/features/bookmark-folders/bookmark-folders.management.editor.js');
load('js/modules/features/bookmark-folders/bookmark-folders.management.mutations.js');
load('js/modules/features/bookmark-folders/bookmark-folders.management.drop.js');
load('js/modules/features/bookmark-folders/bookmark-folders.management.js');
load('js/modules/features/bookmark-folders/bookmark-folders.behavior.js');
load('js/modules/features/bookmark-folders/bookmark-folders.actions.js');
load('js/modules/features/bookmark-folders/bookmark-folders.core.js');

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
  { id: 'action-a', url: 'https://site.example.com/action-a', title: 'Action Alpha', tags: ['Action', 'Adventure'], rating: 8.7, lastVisited: Date.now() - (2 * 24 * 60 * 60 * 1000) },
  { id: 'action-b', url: 'https://site.example.com/action-b', title: 'Action Beta', tags: ['Action', 'Drama'], rating: 7.4, lastVisited: Date.now() - (20 * 24 * 60 * 60 * 1000) },
  { id: 'action-c', url: 'https://site.example.com/action-c', title: 'Action Gamma', tags: ['Action'], rating: 9.2, lastVisited: Date.now() - (200 * 24 * 60 * 60 * 1000) },
  { id: 'dup-a', url: 'https://www.example.com/series/1?b=2&a=1#part', title: 'Duplicate A' },
  { id: 'dup-b', url: 'https://example.com/series/1?a=1&b=2', title: 'Duplicate B' }
];

for (let index = 0; index < 16; index += 1) {
  global.eveState.links.push({
    id: `h18-${index}`,
    url: `https://dense.example.com/item/${index}`,
    title: `Dense Item ${index}`,
    folderId: 'folder-h18',
    tags: ['Overflow', index % 2 === 0 ? 'Dense' : 'Clustered'],
    rating: 6.5 + ((index % 5) * 0.4),
    lastVisited: Date.now() - ((index + 1) * 24 * 60 * 60 * 1000),
    createdAt: Date.now() - ((100 + index) * 24 * 60 * 60 * 1000)
  });
}

const view = global.window.EveBookmarkFolders.buildFolderView('main', 'Test', global.eveState.links);

function idsForGhost(ghostId) {
  return (view.folderLinks.get(ghostId) || []).map((link) => String(link.id));
}

const missingIcons = idsForGhost('__ghost_missing_icons__');
const missingCovers = idsForGhost('__ghost_missing_covers__');
const missingNotes = idsForGhost('__ghost_missing_notes__');
const untagged = idsForGhost('__ghost_untagged__');
const duplicateSuspects = idsForGhost('__ghost_duplicate_suspects__');

function findNode(name, parentId = undefined) {
  return view.nodes.find((node) => {
    if (String(node.name || '') !== String(name)) return false;
    if (typeof parentId === 'undefined') return true;
    return String(node.parentId || '') === String(parentId || '');
  }) || null;
}

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

const smartIndexes = findNode('[ Smart Indexes ]');
assert(!!smartIndexes, 'smart indexes category should be present');

const byTags = findNode('[ By Tags ]', smartIndexes.id);
assert(!!byTags, 'tag index group should be present under smart indexes');

const actionBucket = findNode('[ Action ]', byTags.id);
assert(!!actionBucket, 'action tag bucket should be generated');
assert((view.folderLinks.get(actionBucket.id) || []).length === 3, 'action tag bucket should contain the three tagged action bookmarks');

const nestedTagGroup = findNode('[ By Tags ]', actionBucket.id);
assert(!!nestedTagGroup, 'tag bucket should recursively expose further tag splits');

const adventureBucket = findNode('[ Adventure ]', nestedTagGroup.id);
assert(!!adventureBucket, 'nested adventure bucket should exist under action');

const byRating = findNode('[ By Rating ]', actionBucket.id);
assert(!!byRating, 'tag bucket should recursively expose rating splits');

const byConfidence = findNode('[ By Confidence ]', smartIndexes.id);
const byProgress = findNode('[ By Progress Units ]', smartIndexes.id);
const byDemographic = findNode('[ By Demographic ]', smartIndexes.id);
const byPublication = findNode('[ By Publication Era ]', smartIndexes.id);
const byAuthors = findNode('[ By Authors ]', smartIndexes.id);
const byLanguage = findNode('[ By Language ]', smartIndexes.id);
const byStatus = findNode('[ By Status ]', smartIndexes.id);
assert(!!byConfidence, 'confidence index group should be present');
assert(!!byProgress, 'progress index group should be present');
assert(!!byDemographic, 'demographic index group should be present');
assert(!!byPublication, 'publication index group should be present');
assert(!!byAuthors, 'author index group should be present');
assert(!!byLanguage, 'language index group should be present');
assert(!!byStatus, 'status index group should be present');

const confidenceHigh = findNode('[ 0.90+ ]', byConfidence.id);
const confidenceMid = findNode('[ 0.75-0.89 ]', byConfidence.id);
const publication2020s = findNode('[ 2020s ]', byPublication.id);
const publication2010s = findNode('[ 2010s ]', byPublication.id);
const languageEn = findNode('[ EN ]', byLanguage.id);
const languageJa = findNode('[ JA ]', byLanguage.id);
const languageKo = findNode('[ KO ]', byLanguage.id);
const demographicSeinen = findNode('[ Seinen ]', byDemographic.id);
const statusReading = findNode('[ Reading ]', byStatus.id);
assert(!!confidenceHigh && !!confidenceMid, 'confidence buckets should be generated');
assert(!!publication2020s && !!publication2010s, 'publication buckets should be generated');
assert(!!languageEn && !!languageJa && !!languageKo, 'normalized language buckets should be generated');
assert(!!demographicSeinen, 'demographic bucket should be generated');
assert(!!statusReading, 'status bucket should be generated');

const maintenanceGroup = findNode('[ Maintenance ]', actionBucket.id);
const domainsGroup = findNode('[ Domains ]', actionBucket.id);
const activityGroup = findNode('[ Activity ]', actionBucket.id);
assert(!!maintenanceGroup, 'tag bucket should recursively expose maintenance group');
assert(!!domainsGroup, 'tag bucket should recursively expose domain grouping');
assert(!!activityGroup, 'tag bucket should recursively expose activity group');

const missingCoversInAction = findNode('[ Missing Covers ]', maintenanceGroup.id);
assert(!!missingCoversInAction, 'maintenance group should expose missing covers inside narrowed scope');

const rootDomainsGroup = findNode('[ Domains ]', findNode('[ System Views ]')?.id);
assert(!!rootDomainsGroup, 'root domains group should be present');
const siteDomainBucket = findNode('[ SITE.EXAMPLE.COM ]', rootDomainsGroup.id);
assert(!!siteDomainBucket, 'site.example.com bucket should exist at root');
const maintenanceInsideDomain = findNode('[ Maintenance ]', siteDomainBucket.id);
const activityInsideDomain = findNode('[ Activity ]', siteDomainBucket.id);
const ratingInsideDomain = findNode('[ By Rating ]', siteDomainBucket.id);
const nestedDomainsInsideDomain = findNode('[ Domains ]', siteDomainBucket.id);
assert(!!maintenanceInsideDomain, 'domain bucket should loop back into maintenance');
assert(!!activityInsideDomain, 'domain bucket should loop back into activity');
assert(!!ratingInsideDomain, 'domain bucket should loop back into smart indexes');
assert(!nestedDomainsInsideDomain, 'single-domain bucket should not recurse into domains again');

const rootInsights = findNode('[ Insights ]', findNode('[ System Views ]')?.id);
assert(!!rootInsights, 'root insights group should be present');
const largeFoldersBucket = findNode('[ Large Folders (>15) ]', rootInsights.id);
assert(!!largeFoldersBucket, 'large folders bucket should be present');

const readingBucket = findNode('[ Reading ]', byStatus.id);
assert(!!readingBucket, 'reading bucket should exist');
const maintenanceInsideReading = findNode('[ Maintenance ]', readingBucket.id);
const activityInsideReading = findNode('[ Activity ]', readingBucket.id);
const insightsInsideReading = findNode('[ Insights ]', readingBucket.id);
const nestedReadingStatusInsideReading = findNode('[ Reading Status ]', readingBucket.id);
assert(!!maintenanceInsideReading, 'single-status bucket should loop back into maintenance');
assert(!!activityInsideReading, 'single-status bucket should loop back into activity');
assert(!!insightsInsideReading, 'single-status bucket should loop back into insights');
assert(!nestedReadingStatusInsideReading, 'single-status bucket should not recurse into reading status again');

const rootMaintenance = findNode('[ Maintenance ]', findNode('[ System Views ]')?.id);
assert(!!rootMaintenance, 'root maintenance group should be present');
const missingNotesBucket = findNode('[ Missing Notes ]', rootMaintenance.id);
assert(!!missingNotesBucket, 'missing notes bucket should exist');
const missingNotesByTags = findNode('[ By Tags ]', missingNotesBucket.id);
assert(!!missingNotesByTags, 'missing notes bucket should loop back into smart indexes');
const maleProtagonistBucket = findNode('[ Male Protagonist ]', missingNotesByTags.id);
assert(!!maleProtagonistBucket, 'male protagonist bucket should exist under missing notes -> by tags');

global.eveState.config.activeManhwaFolderChains = {
  'main::Test': [
    { dimension: 'maintenance', valueKey: 'missing_notes', label: '[ Missing Notes ]' },
    { dimension: 'tag_index', valueKey: 'male protagonist', label: 'Male Protagonist' }
  ]
};

const preferredView = global.window.EveBookmarkFolders.buildFolderView('main', 'Test', global.eveState.links);
function findPreferredNode(name, parentId = undefined) {
  return preferredView.nodes.find((node) => {
    if (String(node.name || '') !== String(name)) return false;
    if (typeof parentId === 'undefined') return true;
    return String(node.parentId || '') === String(parentId || '');
  }) || null;
}

const preferredRootMaintenance = findPreferredNode('[ Maintenance ]', findPreferredNode('[ System Views ]')?.id);
const preferredMissingNotesBucket = findPreferredNode('[ Missing Notes ]', preferredRootMaintenance?.id);
const preferredMissingNotesByTags = findPreferredNode('[ By Tags ]', preferredMissingNotesBucket?.id);
const preferredMaleProtagonistBucket = findPreferredNode('[ Male Protagonist ]', preferredMissingNotesByTags?.id);
const maleProtagonistMaintenance = findPreferredNode('[ Maintenance ]', preferredMaleProtagonistBucket?.id);
const maleProtagonistByStatus = findPreferredNode('[ By Status ]', preferredMaleProtagonistBucket?.id);
const maleProtagonistByRating = findPreferredNode('[ By Rating ]', preferredMaleProtagonistBucket?.id);
assert(!!maleProtagonistMaintenance, 'preferred derived tag path should expose maintenance');
assert(!!maleProtagonistByStatus, 'preferred derived tag path should expose status indexes');
assert(!!maleProtagonistByRating, 'preferred derived tag path should expose rating indexes');

global.eveState.config.activeManhwaFolderChains = {
  'main::Test': [
    { dimension: 'insights', valueKey: 'large_folders', label: '[ Large Folders (>15) ]' }
  ]
};

const preferredLargeView = global.window.EveBookmarkFolders.buildFolderView('main', 'Test', global.eveState.links);
function findLargePreferredNode(name, parentId = undefined) {
  return preferredLargeView.nodes.find((node) => {
    if (String(node.name || '') !== String(name)) return false;
    if (typeof parentId === 'undefined') return true;
    return String(node.parentId || '') === String(parentId || '');
  }) || null;
}

const preferredInsights = findLargePreferredNode('[ Insights ]', findLargePreferredNode('[ System Views ]')?.id);
const preferredLargeFoldersBucket = findLargePreferredNode('[ Large Folders (>15) ]', preferredInsights?.id);
const largeFoldersByTags = findLargePreferredNode('[ By Tags ]', preferredLargeFoldersBucket?.id);
const largeFoldersByRating = findLargePreferredNode('[ By Rating ]', preferredLargeFoldersBucket?.id);
const largeFoldersMaintenance = findLargePreferredNode('[ Maintenance ]', preferredLargeFoldersBucket?.id);
const largeFoldersActivity = findLargePreferredNode('[ Activity ]', preferredLargeFoldersBucket?.id);
assert(!!largeFoldersByTags, 'preferred large folders path should expose tag indexes');
assert(!!largeFoldersByRating, 'preferred large folders path should expose rating indexes');
assert(!!largeFoldersMaintenance, 'preferred large folders path should expose maintenance');
assert(!!largeFoldersActivity, 'preferred large folders path should expose activity');

console.log('SMART_GHOST_CALIBRATION_OK', JSON.stringify({
  missingIcons,
  missingCovers,
  missingNotes,
  untagged,
  duplicateSuspects,
  smartIndexes: {
    id: smartIndexes.id,
    byTags: byTags.id,
    actionBucket: actionBucket.id,
    nestedTagGroup: nestedTagGroup.id,
    adventureBucket: adventureBucket.id,
    byRating: byRating.id,
    byConfidence: byConfidence.id,
    byProgress: byProgress.id,
    byDemographic: byDemographic.id,
    byPublication: byPublication.id,
    byAuthors: byAuthors.id,
    byLanguage: byLanguage.id,
    byStatus: byStatus.id,
    maintenanceGroup: maintenanceGroup.id,
    domainsGroup: domainsGroup.id,
    activityGroup: activityGroup.id,
    rootDomainsGroup: rootDomainsGroup.id,
    siteDomainBucket: siteDomainBucket.id
  }
}));
