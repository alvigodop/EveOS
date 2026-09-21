const test = require('node:test');
const assert = require('node:assert/strict');
const { runHelperAsync, snapshotProcessAsync } = require('../local-targets/antigravity-existing.js');

test('async console helper parses PowerShell JSON without blocking spawnSync path', async () => {
  let call = null;
  const result = await runHelperAsync('snapshot', 4242, {
    execFileImpl(command, args, options, callback) {
      call = { command, args, options };
      setImmediate(() => callback(null, '{"ok":true,"pid":4242,"text":">\\n? for shortcuts"}', ''));
      return {};
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.pid, 4242);
  assert.equal(call.command, 'powershell.exe');
  assert.equal(call.options.windowsHide, true);
});

test('snapshotProcessAsync delegates to async console helper contract', async () => {
  const result = await snapshotProcessAsync(4242, {
    execFileImpl(command, args, options, callback) {
      callback(null, '{"ok":true,"pid":4242,"text":"ready"}', '');
      return {};
    }
  });
  assert.equal(result.text, 'ready');
});
