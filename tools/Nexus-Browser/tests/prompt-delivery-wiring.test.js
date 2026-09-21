const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDERS } = require('../extension/providers.js');
const revision = require('../extension/content/provider-adapter-revision.js');

const root = path.resolve(__dirname, '..');
const museSource = fs.readFileSync(path.join(root, 'extension', 'content', 'muse.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'extension', 'service-worker.js'), 'utf8');
const manifest = require('../extension/manifest.json');

test('Muse loads the shared prompt-delivery verifier before its adapter', () => {
  const muse = PROVIDERS.find((provider) => provider.id === 'muse');
  const group = muse.groups.find((entry) => entry.expectedAdapter === 'muse');
  const deliveryIndex = group.files.indexOf('content/prompt-delivery.js');
  const adapterIndex = group.files.indexOf('content/muse.js');
  assert.ok(deliveryIndex >= 0);
  assert.ok(adapterIndex > deliveryIndex);

  const manifestGroup = manifest.content_scripts.find((entry) => entry.matches.includes('https://muse.ai/*'));
  assert.ok(manifestGroup.js.indexOf('content/prompt-delivery.js') >= 0);
  assert.ok(manifestGroup.js.indexOf('content/muse.js') > manifestGroup.js.indexOf('content/prompt-delivery.js'));
});

test('Muse prompt acceptance is backed by committed delivery proof', () => {
  assert.match(museSource, /promptDelivery\.markSeeded/);
  assert.match(museSource, /promptDelivery\.attemptOnce/);
  assert.match(museSource, /promptDelivery\.verifyCommitted/);
  assert.match(museSource, /deliveryProof:\s*\{ seeded: true, submitAttempted: true, submitMethod: submissionMode, committed: true \}/);
});

test('service worker preserves delivery proof and adapter error identity', () => {
  assert.match(workerSource, /deliveryProof = result\.deliveryProof \|\| null/);
  assert.match(workerSource, /code: result\?\.code \|\| 'PROMPT_SEND_FAILED'/);
  assert.match(workerSource, /type: 'prompt_accepted'.*submissionMode, deliveryProof/);
});

test('prompt-delivery adapter update advances the shared revision', () => {
  assert.ok(revision.ADAPTER_REVISION >= 16);
});
