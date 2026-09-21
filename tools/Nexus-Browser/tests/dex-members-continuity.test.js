const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.resolve(__dirname, '../public/dex-members.js'), 'utf8');

test('headed participant removal clears its durable checkpoint', () => {
  assert.match(source, /room\.agentCheckpoints\) delete room\.agentCheckpoints\[member\.id\]/);
});

test('headed participant rebind keeps checkpoint identity aligned', () => {
  assert.match(source, /agentCheckpoints\?\.\[existing\.id\]/);
  assert.match(source, /memberName: name, providerId: binding\.providerId/);
});
