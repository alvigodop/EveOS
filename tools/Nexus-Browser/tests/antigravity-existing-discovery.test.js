'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helper = require('../local-targets/console-helper-transport');
const agy = require('../local-targets/antigravity-existing');
const manager = require('../local-targets/manager');

function fakeFs(result) {
  const removed = [];
  return {
    removed,
    mkdtempSync: () => path.join('fake', 'console-private'),
    readFileSync: () => result,
    rmSync: (dir) => removed.push(dir)
  };
}

test('probe reads private result file when console detach leaves stdout empty', () => {
  let passedArgs;
  const files = fakeFs('{"ok":true,"pid":10872,"processes":[10872]}');
  const probe = helper.runHelper('probe', 10872, '', {
    fsImpl: files, tmpDir: 'fake',
    spawnSyncImpl: (_exe, args) => { passedArgs = args; return { status: 0, stdout: '', stderr: '' }; }
  });
  assert.equal(probe.ok, true);
  assert.equal(probe.pid, 10872);
  assert.ok(passedArgs.includes('-ResultPath'));
  assert.equal(passedArgs[passedArgs.indexOf('-Mode') + 1], 'probe');
  assert.equal(files.removed.length, 1);
});

test('helper accepts stdout fallback for injected legacy runners', () => {
  const files = { readFileSync: () => { throw Error('not created'); } };
  const result = helper.parseResult({ stdout: '{"ok":true,"eventsWritten":4}' }, 'missing.json', files);
  assert.equal(result.ok, true);
  assert.equal(result.eventsWritten, 4);
});

test('missing probe output is an explicit diagnostic rather than invisible exclusion', () => {
  const files = fakeFs('');
  const result = helper.runHelper('probe', 10872, '', {
    fsImpl: files, tmpDir: 'fake',
    spawnSyncImpl: () => ({ status: 1, stdout: '', stderr: 'CSharp compilation failed' })
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONSOLE_HELPER_NO_RESULT');
  assert.match(result.error, /compilation failed/);
});

test('probe timeout is classified with a bounded error', () => {
  const result = helper.parseResult({
    stdout: '', stderr: '', status: null, error: { code: 'ETIMEDOUT', message: 'killed' }
  }, 'missing.json', { readFileSync: () => { throw Error('missing'); } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONSOLE_HELPER_TIMEOUT');
});

test('async snapshot also recovers file-only result and cleans scratch directory', async () => {
  const files = fakeFs('{"ok":true,"text":"ready","pid":10872}');
  const result = await helper.runHelperAsync('snapshot', 10872, {
    fsImpl: files, tmpDir: 'fake',
    execFileImpl: (_exe, args, _options, callback) => {
      assert.ok(args.includes('-ResultPath'));
      callback(null, '', '');
    }
  });
  assert.equal(result.text, 'ready');
  assert.equal(files.removed.length, 1);
});

test('unattachable existing terminal remains unavailable but rejection is inspectable', async () => {
  const targets = await agy.listTargets({
    platform: 'win32',
    discoverImpl: () => [{ ProcessId: 10872, CommandLine: 'agy.exe' }],
    probeImpl: () => ({ ok: false, code: 'CONSOLE_HELPER_NO_RESULT', error: 'Console detached before reply.' })
  });
  assert.deepEqual(targets, []);
  const scan = agy.getDiscoveryDiagnostics();
  assert.equal(scan.discovered, 1);
  assert.equal(scan.attached, 0);
  assert.deepEqual(scan.rejected.map((x) => x.pid), [10872]);
  assert.equal(scan.rejected[0].code, 'CONSOLE_HELPER_NO_RESULT');
  assert.equal(manager.discoveryDiagnostics().antigravityExisting.rejected[0].pid, 10872);
});

test('successful existing session discovery advertises the exact live terminal', async () => {
  const targets = await agy.listTargets({
    platform: 'win32',
    discoverImpl: () => [{ ProcessId: 10872, CommandLine: 'agy.exe' }],
    probeImpl: () => ({ ok: true, processes: [10872] })
  });
  assert.deepEqual(targets.map((t) => t.id), ['local:antigravity-existing:10872']);
  assert.equal(agy.getDiscoveryDiagnostics().attached, 1);
});

test('probe uses a short console sample and preserves stdout before console attach', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'win-console-bridge.ps1'), 'utf8');
  assert.match(script, /\$script:originalOutput = \[Console\]::OpenStandardOutput\(\)/);
  assert.match(script, /\[System\.IO\.File\]::WriteAllBytes\(\$ResultPath, \$bytes\)/);
  assert.match(script, /if \(\$Mode -eq 'probe'\) \{ 6 \} else \{ 640 \}/);
});

test('server diagnostics expose rejected existing Antigravity sessions', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'server-diagnostics.js'), 'utf8');
  assert.match(server, /createDiagnosticsSnapshot/);
  assert.match(source, /localDiscovery: localTargets\.discoveryDiagnostics\(\)/);
});
