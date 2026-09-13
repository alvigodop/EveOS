const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];
const displayed = [];
const requests = [];
let currentBrowserStateSaved = false;

const context = {
  console,
  Date,
  JSON,
  URLSearchParams,
  WebSocket: { OPEN: 1 },
  navigator: {},
  window: {
    config: {
      activeWorkspace: 'main',
      workspaces: [{ id: 'main', name: 'Main' }]
    },
    EveDataStore: {
      _modularSync: {
        sharedReady: true,
        engineReady: true,
        isHttpContext: () => true,
        state: { lastUploadedHash: '', lastSyncedLocalHash: '', remoteSignature: '' },
        hashState: () => 'current-browser-state',
        withOperationMonitor: async (work) => work(),
        getStore: () => ({ captureState: () => ({ marker: 'Fresh scoped datapack from browser' }) }),
        requestJson: async (query, options) => {
          requests.push(query);
          if (query === '/api/eve-state/modular/save') {
            currentBrowserStateSaved = JSON.parse(options.body).marker === 'Fresh scoped datapack from browser';
            return { ok: true, payload: { ok: true, status: { signature: 'fresh' } } };
          }
          const parsed = new URL(`http://localhost${query}`);
          return {
            ok: true,
            payload: {
              ok: true,
              mode: parsed.searchParams.get('mode') === 'full' ? 'full' : 'summary',
              contextText: '[EVEOS MODULAR CONTEXT]\n' + (currentBrowserStateSaved
                ? 'Fresh scoped datapack from browser'
                : 'STALE server datapack'),
              payload: {
                scope: {
                  scope: parsed.searchParams.get('scope'),
                  label: 'Current tab branch',
                  workspaceId: parsed.searchParams.get('workspaceId'),
                  workspaceIds: ['main'],
                  source: 'search-monitor'
                },
              bookmarks: {
                config: {
                  activeWorkspace: 'main',
                  workspaces: [{ id: 'main', name: 'Main' }]
                },
                links: [
                  { workspace: 'main', category: 'Start', title: 'Alpha' },
                  { workspace: 'main', category: 'Start', title: 'Beta' }
                ]
              },
              library: {
                categories: { Manga: [{ title: 'Alpha' }] },
                connections: [{ source: 'Alpha', target: 'Beta' }]
              }
            }
            }
          };
        }
      }
    },
    WebSocket: { OPEN: 1 },
    webSocket: {
      readyState: 1,
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    },
    displayMessage(message) {
      displayed.push(message);
    }
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
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.sync.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.scope.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.transport.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
  const api = context.window.EveDataStore._modularSync;
  assert(api.apiContextReady === true, 'API context should initialize');

  const result = await api.sendContextToGemini('full', 30);
  assert(result.ok && result.sent && result.mode === 'full', 'context relay should report sent full context');
  assert(requests[0] === '/api/eve-state/modular/save', 'relay must flush current browser datapack before building context');
  assert(/scope=workspace/.test(requests[1]), 'default relay should request current workspace branch scope');
  assert(/workspaceId=main/.test(requests[1]), 'default relay should include active workspace id');
  assert(sent.length === 1, 'one Gemini context payload should be sent');

  const payload = sent[0];
  assert(payload.source === 'modular_gemini_context', 'payload should identify modular context source');
  assert(payload.is_system_context === true, 'payload must use backend-recognized system context flag');
  assert(payload.is_system_message !== true, 'payload must not be ignored as a system message');
  assert(payload.realtime_input.media_chunks[0].mime_type === 'text/plain', 'context should be sent as text/plain');
  assert(payload.realtime_input.media_chunks[0].data.includes('Fresh scoped datapack from browser'), 'fresh browser datapack should be relayed');
  assert(!payload.realtime_input.media_chunks[0].data.includes('STALE server datapack'), 'stale server datapack must not be relayed');
  assert(payload.context_manifest?.label === 'EveOS Context Snapshot', 'payload should include a readable manifest');
  assert(payload.context_manifest?.scopeMode === 'workspace', 'manifest should preserve scoped workspace mode');
  assert(payload.context_manifest?.counts?.bookmarks === 2, 'manifest should expose bookmark counts');
  assert(payload.context_manifest?.route === 'websocket', 'manifest should expose send route');
  assert(result.manifest?.activeWorkspaceName === 'Main', 'result should expose active workspace');
  assert(displayed.some((message) => /Sent EveOS context snapshot/i.test(message)), 'relay should display sent status');

  console.log('GEMINI_MODULAR_CONTEXT_RELAY_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
