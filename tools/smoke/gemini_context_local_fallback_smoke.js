const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];

const context = {
  console,
  Date,
  JSON,
  URLSearchParams,
  WebSocket: { OPEN: 1 },
  navigator: {},
  window: {
    EveDataStore: {
      _modularSync: {
        sharedReady: true,
        engineReady: true,
        isHttpContext: () => false,
        getStore: () => ({
          captureState: () => ({
            metadata: { version: 1 },
            bookmarks: {
              config: {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', subTabs: [] }]
              },
              links: [
                {
                  id: 'a1',
                  title: 'Alpha',
                  url: 'https://alpha.test',
                  workspace: 'main',
                  category: 'Test',
                  notes: 'Alpha note',
                  tags: ['Context'],
                  chapter: '12'
                },
                {
                  id: 'b1',
                  title: 'Beta',
                  url: 'https://beta.test',
                  workspace: 'main',
                  category: 'Other'
                }
              ],
              folders: {
                'main::Test': [{ id: 'f1', name: 'Folder' }]
              },
              pins: []
            },
            library: {
              categories: {
                'main::Test': {
                  entries: [{ id: 'l1', title: 'Alpha Library', status: 'Reading', aliases: ['A'] }]
                }
              },
              connections: [{ workspaceId: 'main', linkId: 'a1', libraryEntryId: 'l1' }]
            }
          })
        }),
        requestJson: async () => {
          throw new Error('Failed to fetch');
        }
      }
    },
    config: {
      activeWorkspace: 'main',
      workspaces: [{ id: 'main', name: 'Main', subTabs: [] }]
    },
    webSocket: {
      readyState: 1,
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    },
    displayMessage() {}
  }
};
context.window.window = context.window;

function runScript(relativePath) {
  const file = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function main() {
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.local.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.js');

  const api = context.window.EveDataStore._modularSync;
  const result = await api.sendContextToGemini('summary', 20, {
    scope: {
      scope: 'card',
      workspaceId: 'main',
      workspaceIds: ['main'],
      categoryName: 'Test',
      label: 'Specific card'
    }
  });

  assert(result.ok && result.sent, 'fallback context should send');
  assert(result.manifest?.counts?.bookmarks === 1, 'fallback should keep selected card scope');
  assert(result.localFallback === undefined || result.manifest, 'result should carry a manifest');
  assert(sent.length === 1, 'one fallback context payload should be sent');

  const message = sent[0].realtime_input.media_chunks[0].data;
  assert(message.includes('Alpha'), 'selected card bookmark missing');
  assert(!message.includes('Beta'), 'unselected card leaked into fallback context');
  assert(message.includes('Alpha note'), 'bookmark notes missing');
  assert(message.includes('Alpha Library'), 'library link context missing');

  console.log('GEMINI_CONTEXT_LOCAL_FALLBACK_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
