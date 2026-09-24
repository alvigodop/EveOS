const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'extension', 'service-worker.js'), 'utf8');
const targetMetadata = require('../extension/target-metadata.js');
const freshness = fs.readFileSync(path.join(ROOT, 'extension', 'provider-adapter-freshness.js'), 'utf8');
const boot = fs.readFileSync(path.join(ROOT, 'extension', 'dex-provider-control-boot.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));

test('connect target stays background-only', () => {
  assert.doesNotMatch(serviceWorker, /active: true/);
  assert.doesNotMatch(serviceWorker, /focused: true/);
});

test('browser targets expose provider-neutral surface and exact tab identity metadata', () => {
  const target = targetMetadata.formatTarget(
    { id: 44, windowId: 9, title: 'Nova', url: 'https://chatgpt.com/c/one' },
    { id: 'chatgpt', name: 'ChatGPT', capabilities: { send: true } }
  );
  assert.equal(target.targetClassId, 'online-origin');
  assert.equal(target.targetTypeId, 'browser-tab');
  assert.equal(target.transport, 'browser-extension');
  assert.equal(target.sessionOrigin, 'browser');
  assert.deepEqual(target.concreteTargetIdentity, {
    kind: 'browser-tab', tabId: 44, windowId: 9,
    providerId: 'chatgpt', url: 'https://chatgpt.com/c/one'
  });
});

test('provider readiness delegates exact-tab reload and full-stack wait to freshness helper', () => {
  const start = serviceWorker.indexOf('async function ensureProviderAdapter');
  const end = serviceWorker.indexOf('function providerMatchesUrl', start);
  const body = serviceWorker.slice(start, end);
  assert.match(body, /adapterReadiness\.fresh\(tabId, provider\.id\)/);
  assert.match(body, /await adapterFreshnessApi\.ensure\(tabId, provider, chrome\)/);
  assert.match(body, /adapterReadiness\.mark\(tabId, provider\.id\)/);
  assert.match(freshness, /chromeApi\.tabs\.reload\(Number\(tabId\), \{ bypassCache: true \}\)/);
  assert.match(freshness, /await waitForCurrent\(tabId, provider, chromeApi\)/);
  assert.match(freshness, /current\(status\) && await providerReady\(tabId, provider, chromeApi\)/);
});

test('provider runtime injection no longer forces injectImmediately', () => {
  assert.match(serviceWorker, /chrome\.scripting\.executeScript\(details\)/);
  assert.doesNotMatch(serviceWorker, /injectImmediately: true/);
});

test('provider-control boot work is bounded and sequential', () => {
  assert.match(boot, /provider-control injection timeout/);
  assert.match(boot, /for \(const tab of tabs\)/);
  assert.doesNotMatch(boot, /Promise\.all\(tabs\.map/);
});

test('Muse uses the standard main-frame document_idle manifest lifecycle', () => {
  const muse = manifest.content_scripts.find((entry) => entry.matches?.includes('https://muse.ai/*'));
  assert.ok(muse);
  assert.equal(muse.all_frames, undefined);
  assert.equal(muse.run_at, 'document_idle');
});


test('extension persists selected target state and can reopen headed Dex UI without focus stealing', () => {
  assert.equal(manifest.permissions.includes('storage'), true);
  assert.match(serviceWorker, /selectedTargetStore\.write/);
  assert.match(serviceWorker, /restoreSelectedTarget/);
  assert.match(serviceWorker, /ensure_dex_ui/);
  assert.doesNotMatch(serviceWorker, /active:\s*true/);
});


test('server-driven target selection preserves the scheduler request id', () => {
  const start = serviceWorker.indexOf('async function selectTarget');
  const end = serviceWorker.indexOf('async function selectedProviderAndTab', start);
  const body = serviceWorker.slice(start, end);
  assert.match(body, /requestId: options\.requestId \|\| null/);
  assert.match(serviceWorker, /selectTarget\(Number\(msg\.tabId\), msg\.providerId \|\| null, \{ requestId: msg\.requestId \|\| null \}\)/);
});

test('online target recovery can resurrect an exact bound URL without foreground focus', () => {
  assert.match(serviceWorker, /msg\.type === 'ensure_target'/);
  assert.match(serviceWorker, /targetResurrectionApi\.ensure/);
  assert.match(serviceWorker, /safeSend\(\{ type: 'target_ensured'/);
  assert.doesNotMatch(serviceWorker, /active:\s*true/);
});


test('recovery capture forwards the exact expected prompt to the provider adapter', () => {
  assert.match(serviceWorker, /capture_latest', requestId: msg\.requestId, expectedPrompt: msg\.expectedPrompt \|\| ''/);
});
