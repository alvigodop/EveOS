const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
const { PROVIDERS } = require('../extension/providers.js');

test('every provider has one matching ordered manifest content-script bundle', () => {
  for (const provider of PROVIDERS) {
    const entry = manifest.content_scripts.find((candidate) => {
      return JSON.stringify(candidate.matches || []) === JSON.stringify(provider.matchPatterns);
    });
    assert.ok(entry, `Missing manifest content-script entry for ${provider.name}`);
    const expected = [...provider.contentScripts];
    assert.deepEqual(entry.js, expected, `${provider.name} manifest order drifted from provider registry`);

    for (const relativePath of provider.contentScripts) {
      const absolutePath = path.join(ROOT, 'extension', relativePath);
      assert.equal(fs.existsSync(absolutePath), true, `Missing ${provider.name} content script: ${relativePath}`);
    }

  }
});

test('extension grants only supported providers and loopback while keeping injection provider-scoped', () => {
  const manifestMatches = manifest.content_scripts.flatMap((entry) => entry.matches || []);
  const providerMatches = PROVIDERS.flatMap((provider) => provider.matchPatterns);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false, 'Extension must not request all-sites access.');
  for (const pattern of providerMatches) {
    assert.equal(manifest.host_permissions.includes(pattern), true, `Missing provider host permission: ${pattern}`);
  }
  assert.deepEqual([...new Set(manifestMatches)].sort(), [...new Set(providerMatches)].sort());
  assert.equal(manifestMatches.includes('<all_urls>'), false, 'Content scripts must stay restricted to supported AI providers.');
});

test('explicit loopback permissions cover runtime health and websocket coordination', () => {
  assert.equal(manifest.host_permissions.includes('http://127.0.0.1/*'), true);
  assert.equal(manifest.host_permissions.includes('http://localhost/*'), true);
});
