const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const dexMode = fs.readFileSync(path.join(ROOT, 'public', 'dex-mode.js'), 'utf8');
const scheduler = fs.readFileSync(path.join(ROOT, 'dex', 'server-scheduler.js'), 'utf8');
const schedulerState = fs.readFileSync(path.join(ROOT, 'dex', 'server-scheduler-state.js'), 'utf8');

test('Dex UI dispatches relay start via runtime client on user send', () => {
  assert.match(
    dexMode,
    /runtime\.startRelay\(room, message, room\.settings\.autoRelay \? room\.settings\.maxTurns : 1\);/
  );
});

test('initial user send batches transcript persistence into relay enqueue and avoids duplicate render', () => {
  assert.match(
    dexMode,
    /roomMessage\(room, 'user', 'user', room\.userName, text, false\)/
  );
  assert.match(
    dexMode,
    /el\.dexPrompt\.value = '';\s*runtime\.startRelay/
  );
});

test('online turns reuse the already-selected exact tab without a select-target round trip', () => {
  assert.match(
    scheduler,
    /const selected = getSelectedOnlineTarget\(\);\s*if \(selected && String\(selected\.id\) === String\(target\.id\) && selected\.providerId === target\.providerId\) \{\s*return dispatchOnline\(target\);/
  );
});

test('relay prompt is built once per turn and reused after target selection', () => {
  assert.match(scheduler, /current\.prompt = protocol\.buildRelayPrompt\(\{/);
  const builds = scheduler.match(/protocol\.buildRelayPrompt\(/g) || [];
  assert.equal(builds.length, 1);
  assert.match(
    scheduler,
    /msg\.type === 'target_selected' && current\.phase === 'selecting'[\s\S]*?return dispatchOnline\(msg\.target\);/
  );
});

test('agent-to-agent continuation enqueues next turn on localhost without browser reliance', () => {
  assert.match(
    scheduler,
    /if \(disposition\.action === 'stop'\) setStopped\(room, disposition\.reason\);\s*else enqueueNext\(room, message\);\s*save\(snapshot\);\s*processSoon\(0\);/
  );
});

test('online participant resolution prefers its exact live tab id before URL fallback', () => {
  const idLookup = schedulerState.indexOf("String(tab.id) === String(binding.targetId)");
  const urlLookup = schedulerState.indexOf("binding.url && tab.url === binding.url");
  assert.ok(idLookup >= 0 && urlLookup > idLookup);
});
