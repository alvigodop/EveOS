const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('bridge contains no OS-global native input fallback', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'native-input.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'extension', 'gemini-native-submit.js')), false);

  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.equal(server.includes('/native-input'), false);
  assert.equal(server.includes('SendWait'), false);
  assert.equal(server.includes('sendNativeKey'), false);
});
