const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];
const requests = [];

const context = {
  console,
  Date,
  JSON,
  URL,
  URLSearchParams,
  WebSocket: { OPEN: 1 },
  navigator: {},
  window: {
    config: {
      activeWorkspace: 'main',
      geminiLiveLinkEnabled: true,
      geminiContextDataStreamEnabled: true,
      workspaces: [
        { id: 'main', name: 'Main', subTabs: [{ id: 'child', name: 'Child', subTabs: [] }] },
        { id: 'other', name: 'Other', subTabs: [] }
      ]
    },
    eveState: {
      config: null,
      links: [
        { id: 'a', workspace: 'main', category: 'Start', title: 'Alpha' },
        { id: 'b', workspace: 'child', category: 'ChildCard', title: 'Beta' },
        { id: 'c', workspace: 'other', category: 'OtherCard', title: 'Gamma' }
      ]
    },
    EveDataStore: {
      _modularSync: {
        sharedReady: true,
        engineReady: true,
        requestJson: async (query) => {
          requests.push(query);
          return { ok: true, payload: { ok: true, mode: 'summary', contextText: 'ok', payload: { scope: { scope: 'workspace' }, counts: { bookmarks: 2, workspaces: 2, cards: 2 } } } };
        }
      }
    },
    WebSocket: { OPEN: 1 },
    webSocket: { readyState: 1, send(payload) { sent.push(JSON.parse(payload)); } },
    SearchMonitorBoot: {
      getLatestNexusTrace() {
        return { id: 'nexus-1', query: 'alpha', scope: 'current', summary: '2 results in 5ms', totalMs: 5, resultCount: 2 };
      }
    }
  }
};
context.window.eveState.config = context.window.config;
context.window.window = context.window;

function runScript(relativePath) {
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function main() {
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.sync.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.scope.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.transport.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.datastream.trace.js');
  runScript('js/modules/features/modular-state-sync/modular-state-sync.api.datastream.js');
  const api = context.window.EveDataStore._modularSync;

  const scope = api.getCurrentGeminiContextScope();
  assert(scope.workspaceIds.includes('main') && scope.workspaceIds.includes('child'), 'current scope should include tab branch');

  const cards = api.getGeminiContextCardOptions({ scope });
  assert(cards.some((card) => card.workspaceId === 'main' && card.categoryName === 'Start'), 'main card option missing');
  assert(cards.some((card) => card.workspaceId === 'child' && card.categoryName === 'ChildCard'), 'child card option missing');
  assert(!cards.some((card) => card.workspaceId === 'other'), 'unrelated card option leaked');

  await api.fetchGeminiContext('summary', 30, { scope });
  assert(/workspaceIds=main%2Cchild/.test(requests[0]), 'fetch should forward workspaceIds branch');

  const matchingDetail = {
    source: 'test-save',
    kind: 'data',
    mutationSeq: 7,
    at: 123,
    meta: { dataDelta: { workspaceIds: ['child'], categoryNames: ['ChildCard'], updatedLinkIds: ['b'], affectedScopes: [{ workspaceId: 'child', categoryName: 'ChildCard' }] } }
  };
  assert(api.mutationMatchesScope(matchingDetail, { scope }), 'matching child mutation should pass branch scope');
  const skipped = api.sendDataStreamToGemini({ meta: { dataDelta: { workspaceIds: ['other'], categoryNames: ['OtherCard'] } } }, { scope });
  assert(skipped.skipped && skipped.reason === 'outside-scope', 'outside mutation should skip');

  const result = api.sendDataStreamToGemini(matchingDetail, { scope });
  assert(result.ok && result.sent, 'matching mutation should send');
  const payload = sent[0];
  assert(payload.source === 'modular_gemini_data_stream', 'payload source should identify data stream');
  assert(payload.silent_response === true && payload.data_stream.silent === true, 'data stream must be silent');
  assert(payload.context_manifest.mode === 'stream', 'manifest mode should be stream');
  const text = payload.realtime_input.media_chunks[0].data;
  assert(text.includes('eveos.gemini-data-stream.v2'), 'stream schema missing');
  assert(text.includes('nexus-1'), 'latest Nexus trace should be included');
  assert(text.includes('linksUpdated'), 'resolved mutation changes should be included');
  assert(text.includes('"title":"Beta"') || text.includes('"title": "Beta"'), 'updated bookmark should be traceable by title');
  assert(text.includes('"name":"Child"') || text.includes('"name": "Child"'), 'workspace should be traceable by name');

  context.window.config.geminiLiveLinkEnabled = false;
  const relayDisabled = api.sendDataStreamToGemini(matchingDetail, { scope });
  assert(relayDisabled.skipped && relayDisabled.reason === 'relay-disabled', 'master relay must gate stream sends');
  context.window.config.geminiLiveLinkEnabled = true;
  context.window.config.geminiContextDataStreamEnabled = false;
  const streamDisabled = api.sendDataStreamToGemini(matchingDetail, { scope });
  assert(streamDisabled.skipped && streamDisabled.reason === 'stream-disabled', 'stream toggle must gate stream sends');
  assert(sent.length === 1, 'disabled stream paths must not emit WebSocket frames');

  console.log('GEMINI_CONTEXT_DATA_STREAM_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
