const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];
const largeContext = `EveOS Large Context\n${'Bookmark row with notes, folders, urls, pins, and state.\n'.repeat(2200)}`;

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
        requestJson: async () => ({
          ok: true,
          payload: {
            ok: true,
            mode: 'full',
            contextText: largeContext,
            payload: {
              scope: { scope: 'workspace', workspaceId: 'main', workspaceIds: ['main'], label: 'Current tab branch' },
              bookmarks: {
                config: { activeWorkspace: 'main', workspaces: [{ id: 'main', name: 'Main' }] },
                links: [{ workspace: 'main', category: 'Test', title: 'Alpha' }]
              },
              library: { categories: {}, connections: [] }
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
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
  const api = context.window.EveDataStore._modularSync;
  const result = await api.sendContextToGemini('full', 30);

  assert(result.ok && result.sent, 'large context should still report sent');
  assert(sent.length > 1, 'large context should be split into multiple frames');
  assert(result.manifest.transportChunkCount === sent.length, 'manifest should report chunk count');
  assert(sent.every((payload, index) => payload.context_manifest.chunkIndex === index + 1), 'chunks should be ordered');
  assert(sent.every((payload) => payload.realtime_input.media_chunks[0].data.length < 47000), 'chunk data should stay under frame guard');
  assert(sent[0].realtime_input.media_chunks[0].data.includes('EveOS context chunk 1/'), 'chunk marker missing');

  console.log('GEMINI_CONTEXT_CHUNKED_TRANSPORT_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
