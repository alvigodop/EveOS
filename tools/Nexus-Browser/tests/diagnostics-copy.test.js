const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const copy = require('../public/diagnostics-copy.js');

test('diagnostics copy helper prefers clipboard writeText', async () => {
  const writes = [];
  const ok = await copy.copyText('bridge log', { writeText: async (value) => writes.push(value) }, null);
  assert.equal(ok, true);
  assert.deepEqual(writes, ['bridge log']);
});

test('diagnostics copy controls are present for bridge and Dex logs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="copyBridgeDiagnostics"/);
  assert.match(html, /id="copyDexDiagnostics"/);
  assert.match(html, /src="\/diagnostics-copy\.js"/);
});
