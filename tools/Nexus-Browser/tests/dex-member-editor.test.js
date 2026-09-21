const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const dexMode = fs.readFileSync(path.join(ROOT, 'public', 'dex-mode.js'), 'utf8');
const dexMembers = fs.readFileSync(path.join(ROOT, 'public', 'dex-members.js'), 'utf8');

test('Dex participant editor is loaded before the room controller and exposes edit controls', () => {
  assert.match(html, /id="dexCancelMemberEdit"/);
  assert.match(html, /\/dex-members\.js[\s\S]*\/dex-mode\.js/);
  assert.match(html, /Edit a participant to move its room identity/);
});

test('Dex room controller delegates participant management to the extracted module', () => {
  assert.match(dexMode, /BrowserAiBridgeDexMembers/);
  assert.match(dexMode, /memberApi\.createController/);
  assert.match(dexMode, /memberController\.render\(room\)/);
  assert.match(dexMode, /renderAll,\s*uid/);
});

test('participant rebind preserves logical identity and rejects duplicate concrete targets', () => {
  assert.match(dexMembers, /return \{ \.\.\.member, id: member\.id, name, binding(?:, relayEnabled)? }/);
  assert.match(dexMembers, /hasBindingConflict\(room\.members, binding, existing\?\.id \|\| null\)/);
  assert.match(dexMembers, /uid\('agent'\)/);
  assert.match(dexMembers, /Stop the relay before editing participants/);
});