const test = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDERS } = require('../extension/providers.js');
const manifest = require('../scripts/provider-manifest.js');

test('extension manifest provider wiring is generated exactly from the registry contract', () => {
  const current = manifest.readManifest();
  assert.equal(manifest.manifestDrift(current, PROVIDERS), null);
  assert.deepEqual(current.content_scripts, manifest.expectedContentScripts(PROVIDERS));
});

test('future provider manifest registration is derivable without provider-specific script logic', () => {
  const fake = {
    matchPatterns: ['https://future.example/*'],
    contentScripts: ['content/future-input.js', 'content/future.js', 'content/dex-provider-control.js', 'content/provider-health.js']
  };
  assert.deepEqual(manifest.expectedContentScripts([fake]), [{
    matches: ['https://future.example/*'],
    js: fake.contentScripts,
    run_at: 'document_idle'
  }]);
});