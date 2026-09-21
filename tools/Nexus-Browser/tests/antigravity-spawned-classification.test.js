const test = require('node:test');
const assert = require('node:assert/strict');
const { publicTarget, openVisibleConsole } = require('../local-targets/antigravity-cli');

test('managed Antigravity is explicitly a spawned session', () => {
  const target = publicTarget({ command: 'agy', prefixArgs: [], source: 'agy', shell: false });
  assert.equal(target.sessionOrigin, 'spawned');
  assert.match(target.title, /Spawned Session/);
  assert.match(target.detail, /not an attachment/i);
});

test('visible companion console is Windows-only and can be disabled', () => {
  assert.equal(openVisibleConsole({ platform: 'linux', spawnImpl: () => { throw new Error('no'); } }), false);
  assert.equal(openVisibleConsole({
    platform: 'win32',
    env: { BROWSER_AI_BRIDGE_SPAWN_VISIBLE_CONSOLE: '0' },
    spawnImpl: () => { throw new Error('no'); }
  }), false);
});
