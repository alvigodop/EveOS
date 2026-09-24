const test = require('node:test');
const assert = require('node:assert/strict');
const { preferLocalTargets } = require('../local-targets/manager');

const existing = {
  id: 'local:antigravity-existing:4242',
  providerId: 'local-antigravity-existing',
  sessionOrigin: 'existing'
};
const antigravity = {
  id: 'local:antigravity-cli:managed',
  providerId: 'local-antigravity-cli',
  sessionOrigin: 'spawned'
};
const gemini = { id: 'local:gemini-cli:latest', providerId: 'local-gemini-cli' };
const codexSpawned = { id: 'local:codex-cli:spawned', providerId: 'local-codex-spawned', sessionOrigin: 'spawned' };

test('Antigravity hides the legacy Gemini CLI target by default', () => {
  const targets = preferLocalTargets([antigravity, gemini], {});
  assert.deepEqual(targets.map((target) => target.id), [antigravity.id]);
});

test('existing running sessions sort before spawned fallback sessions', () => {
  const targets = preferLocalTargets([antigravity, existing], {});
  assert.deepEqual(targets.map((target) => target.id), [existing.id, antigravity.id]);
});

test('legacy Gemini CLI remains available when Antigravity is absent', () => {
  const targets = preferLocalTargets([gemini], {});
  assert.deepEqual(targets.map((target) => target.id), [gemini.id]);
});

test('legacy Gemini CLI can be explicitly shown for diagnostics', () => {
  const targets = preferLocalTargets([antigravity, gemini], { BROWSER_AI_BRIDGE_SHOW_LEGACY_GEMINI_CLI: '1' });
  assert.deepEqual(targets.map((target) => target.id), [antigravity.id, gemini.id]);
});

test('ChatGPT Codex spawned target coexists with other local agents', () => {
  const targets = preferLocalTargets([antigravity, codexSpawned, existing], {});
  assert.deepEqual(targets.map((target) => target.id), [existing.id, antigravity.id, codexSpawned.id]);
});
