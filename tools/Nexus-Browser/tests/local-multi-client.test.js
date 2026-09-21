const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const manager = require('../local-targets/manager');

const fakeTarget = {
  id: 'local:antigravity-cli:managed',
  targetClassId: 'local-origin',
  targetTypeId: 'terminal-agent',
  targetTypeName: 'Terminal Agent',
  providerId: 'local-antigravity-cli',
  providerName: 'Antigravity CLI',
  title: 'Antigravity CLI · persistent bridge session',
  workspace: 'C:\\repo',
  transport: 'persistent-stream-json',
  capabilities: { chat: true, activity: true }
};

manager.listLocalTargets = async () => [fakeTarget];
manager.getLocalTarget = async (id) => id === fakeTarget.id ? fakeTarget : null;
manager.getLocalTargetStatus = () => ({ running: true, busy: false, queued: 0, pid: 4242, conversationId: 'conv-1' });
manager.sendLocalPrompt = async ({ requestId, text, emit }) => {
  emit({ type: 'prompt_accepted', requestId, providerId: fakeTarget.providerId, providerName: fakeTarget.providerName });
  emit({ type: 'response_partial', requestId, text: `echo:${text}`, providerId: fakeTarget.providerId, providerName: fakeTarget.providerName });
  emit({ type: 'response_final', requestId, text: `echo:${text}`, providerId: fakeTarget.providerId, providerName: fakeTarget.providerName, conversationId: 'conv-1' });
};

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createTurnLedger } = require('../dex/turn-ledger');
const { createIncidentStore } = require('../dex/incident-store');
const { createServerDurability } = require('../dex/server-durability');
const { createDexStateStore } = require('../dex/state-store');
const { server, HOST, configureDurability } = require('../server');

function waitMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    function onMessage(data) {
      const msg = JSON.parse(String(data));
      if (!predicate(msg)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(msg);
    }
    ws.on('message', onMessage);
  });
}

async function connectUi(port, clientKind = 'browser') {
  const ws = new WebSocket(`ws://${HOST}:${port}/ws`);
  await new Promise((resolve) => ws.once('open', resolve));
  ws.send(JSON.stringify({ type: 'hello', role: 'ui', clientKind }));
  await waitMessage(ws, (msg) => msg.type === 'local_targets_update');
  ws.send(JSON.stringify({ type: 'select_local_target', targetId: fakeTarget.id }));
  await waitMessage(ws, (msg) => msg.type === 'local_target_selected');
  return ws;
}

test('Local-Origin mirrors one broker turn to browser and console clients', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-local-multi-'));
  const testLedger = createTurnLedger({ filePath: path.join(tempDir, 'dex-turn-ledger.jsonl') });
  const testIncidents = createIncidentStore({ filePath: path.join(tempDir, 'incidents.jsonl') });
  const testDurability = createServerDurability({ ledger: testLedger, incidents: testIncidents });
  const testStateStore = createDexStateStore({ filePath: path.join(tempDir, 'dex-state.json') });
  const originalStores = configureDurability({ durability: testDurability, dexStateStore: testStateStore });

  try {
    await new Promise((resolve) => server.listen(0, HOST, resolve));
    const port = server.address().port;
    const browser = await connectUi(port, 'browser');
    const consoleUi = await connectUi(port, 'console');

    const reqId = `shared-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const peerPrompt = waitMessage(consoleUi, (msg) => msg.type === 'local_prompt_echo');
    const browserFinal = waitMessage(browser, (msg) => msg.type === 'response_final' && msg.requestId === reqId);
    const consoleFinal = waitMessage(consoleUi, (msg) => msg.type === 'response_final' && msg.requestId === reqId);

    browser.send(JSON.stringify({
      type: 'send_prompt',
      requestId: reqId,
      text: 'hello shared broker',
      targetClassId: 'local-origin',
      targetId: fakeTarget.id
    }));

    assert.equal((await peerPrompt).text, 'hello shared broker');
    assert.equal((await browserFinal).text, 'echo:hello shared broker');
    assert.equal((await consoleFinal).conversationId, 'conv-1');

    browser.close();
    consoleUi.close();
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    if (originalStores) configureDurability(originalStores);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
