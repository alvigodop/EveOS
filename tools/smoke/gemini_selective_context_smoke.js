const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const socketFrames = [];
const brainUpdates = [];
const insights = [];

const config = {
  activeWorkspace: 'main',
  geminiLiveLinkEnabled: true,
  bookmarkIdentifiers: [{ id: 'reading', label: 'Reading' }],
  workspaces: [{
    id: 'main',
    name: 'Main',
    subTabs: [
      { id: 'child', name: 'Child', subTabs: [] },
      { id: 'child-shortcut', name: 'Child Shortcut', linkedTo: 'child', subTabs: [] }
    ]
  }]
};

const links = [
  {
    id: 'root-link',
    workspace: 'main',
    category: 'Main Card',
    title: 'Marco',
    url: 'https://example.com/marco?utm_source=noise&chapter=1'
  },
  {
    id: 'child-link',
    workspace: 'child',
    category: 'Child Card',
    folderId: 'arc-two',
    title: 'Polo',
    url: 'https://example.com/polo?utm_campaign=noise&keep=yes#fragment',
    identifierIds: ['reading'],
    status: 'Actively Reading',
    chapter: 14,
    episode: 3,
    personalNotes: 'Track this exact child bookmark.',
    tags: ['Adventure', 'Focused'],
    relatedUrls: ['https://mirror.example/polo?utm_medium=noise&source=kept'],
    updatedAt: '2026-07-16T12:00:00.000Z'
  }
];

const bookmarkFolders = {
  'child::Child Card': {
    nodes: [
      { id: 'arc-one', name: 'Arc One', parentId: '' },
      { id: 'arc-two', name: 'Arc Two', parentId: 'arc-one' }
    ]
  }
};

const context = {
  console,
  Date,
  JSON,
  URL,
  URLSearchParams,
  WebSocket: { OPEN: 1 },
  window: {
    config,
    eveState: { config, links, bookmarkFolders },
    WebSocket: { OPEN: 1 },
    webSocket: {
      readyState: 1,
      send(payload) { socketFrames.push(JSON.parse(payload)); }
    },
    EveAudioflixState: { isTextBrainMode: () => false },
    EveGeminiMode2: {
      appendEveUpdate(payload) {
        brainUpdates.push(payload);
        return { count: brainUpdates.length };
      }
    },
    EveDataStore: {
      _modularSync: {
        apiContextReady: true,
        getCurrentGeminiContextScope() {
          return {
            scope: 'workspace',
            workspaceId: 'main',
            workspaceIds: ['main', 'child', 'child-shortcut'],
            label: 'Current tab branch',
            source: 'active-workspace'
          };
        },
        describeWorkspaceTabPath(workspaceId) {
          if (workspaceId === 'child') return 'sub-tab "Child" under root tab "Main"';
          if (workspaceId === 'child-shortcut') return 'sub-tab "Child Shortcut" under root tab "Main"';
          return 'root tab "Main"';
        },
        recordDataStreamEvent(entry) { insights.push(entry); }
      }
    }
  }
};
context.window.window = context.window;

function runScript(relativePath) {
  vm.runInNewContext(
    fs.readFileSync(path.join(root, relativePath), 'utf8'),
    context,
    { filename: relativePath }
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(function main() {
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.names.bookmarks.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.names.js');
  const api = context.window.EveDataStore._modularSync;

  const cards = api.buildSelectiveContext('cards').message;
  assert(cards.includes('Tab "Main" has cards: Main Card'), 'root card ownership missing');
  assert(cards.includes('Sub-tab "Child" (under "Main") has cards: Child Card'), 'child card ownership missing');
  assert(!cards.includes('Tab "Main" has cards: Child Card'), 'child card leaked into root tab');
  assert(cards.includes('Child Shortcut') && cards.includes('shortcut to tab "Child"'), 'shortcut pointer missing');

  const details = api.buildSelectiveContext('bookmark-contents');
  assert(details.count === 2 && details.folderCount === 2, 'bookmark/folder counts should reflect exact branch');
  assert(details.message.includes('[folder] Arc One:') && details.message.includes('[folder] Arc Two:'), 'folder tree missing');
  assert(details.message.includes('Polo | https://example.com/polo?keep=yes'), 'compact bookmark URL missing');
  assert(details.message.includes('labels: Reading'), 'identifier label was not resolved');
  assert(details.message.includes('status: Actively Reading'), 'bookmark status missing');
  assert(details.message.includes('chapter: 14') && details.message.includes('episode: 3'), 'progress metadata missing');
  assert(details.message.includes('notes: "Track this exact child bookmark."'), 'personal notes missing');
  assert(details.message.includes('related: https://mirror.example/polo?source=kept'), 'related URL missing or noisy');
  assert(details.message.indexOf('Polo |') === details.message.lastIndexOf('Polo |'), 'shortcut duplicated target content');

  const sent = api.sendSelectiveContext('bookmark-contents');
  assert(sent.sent && sent.route === 'websocket' && socketFrames.length === 1, 'selective context did not use live socket');
  assert(insights.some((entry) => entry.outcome === 'sent' && entry.relayMode === 'selective: bookmark-contents'), 'send insight missing');

  context.window.EveAudioflixState.isTextBrainMode = () => true;
  const brainSent = api.sendSelectiveContext('bookmarks');
  assert(brainSent.sent && brainSent.route === 'text-brain' && brainUpdates.length === 1, 'Mode 2 selective context did not reach text brain');

  config.geminiLiveLinkEnabled = false;
  const disabled = api.sendSelectiveContext('bookmark-contents');
  assert(disabled.skipped && disabled.reason === 'relay-disabled', 'master relay did not gate selective send');
  assert(socketFrames.length === 1 && brainUpdates.length === 1, 'disabled relay emitted context');

  console.log('GEMINI_SELECTIVE_CONTEXT_SMOKE_OK');
})();
