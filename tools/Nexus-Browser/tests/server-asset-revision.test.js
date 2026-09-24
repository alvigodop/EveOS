'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assetRevision } = require('../server-asset-revision');

test('asset revision is deterministic across server sessions and changes only with shipped assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-asset-rev-'));
  try {
    for (const dir of ['public', 'extension']) fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, 'public', 'dex-mode.js'), 'viewer one');
    fs.writeFileSync(path.join(root, 'extension', 'dex-ui-refresh.js'), 'observer one');
    const first = assetRevision({ root });
    assert.equal(first, assetRevision({ root }));
    assert.match(first, /^[a-f0-9]{20}$/);
    // A runtime pid, timestamp or diagnostic file must not affect the build id.
    fs.writeFileSync(path.join(root, 'public', 'debug.log'), 'new runtime log');
    assert.equal(first, assetRevision({ root }));
    fs.writeFileSync(path.join(root, 'public', 'dex-mode.js'), 'viewer two');
    assert.notEqual(first, assetRevision({ root }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
