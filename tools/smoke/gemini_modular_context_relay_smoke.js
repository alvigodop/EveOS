const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];
const displayed = [];

const context = {
  console,
  Date,
  JSON,
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
        requestJson: async (query) => ({
          ok: true,
          payload: {
            ok: true,
            mode: query.includes('mode=full') ? 'full' : 'summary',
            contextText: '[EVEOS MODULAR CONTEXT]\nActive tab: Main',
            payload: {
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
        })
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
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
  const api = context.window.EveDataStore._modularSync;
  assert(api.apiContextReady === true, 'API context should initialize');

  const result = await api.sendContextToGemini('full', 30);
  assert(result.ok && result.sent && result.mode === 'full', 'context relay should report sent full context');
  assert(sent.length === 1, 'one Gemini context payload should be sent');

  const payload = sent[0];
  assert(payload.source === 'modular_gemini_context', 'payload should identify modular context source');
  assert(payload.is_system_context === true, 'payload must use backend-recognized system context flag');
  assert(payload.is_system_message !== true, 'payload must not be ignored as a system message');
  assert(payload.realtime_input.media_chunks[0].mime_type === 'text/plain', 'context should be sent as text/plain');
  assert(payload.realtime_input.media_chunks[0].data.includes('Active tab: Main'), 'context text should be preserved');
  assert(payload.context_manifest?.label === 'EveOS Context Snapshot', 'payload should include a readable manifest');
  assert(payload.context_manifest?.counts?.bookmarks === 2, 'manifest should expose bookmark counts');
  assert(payload.context_manifest?.route === 'websocket', 'manifest should expose send route');
  assert(result.manifest?.activeWorkspaceName === 'Main', 'result should expose active workspace');
  assert(displayed.some((message) => /Sent EveOS context snapshot/i.test(message)), 'relay should display sent status');

  console.log('GEMINI_MODULAR_CONTEXT_RELAY_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
