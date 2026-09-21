const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const {
  TARGET_ID,
  resolveAntigravityLaunch,
  publicTarget,
  createBroker
} = require('../local-targets/antigravity-cli');

function fakeProcess() {
  const proc = new EventEmitter();
  proc.pid = 4242;
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.writes = [];
  proc.stdin = new Writable({
    write(chunk, encoding, callback) {
      proc.writes.push(String(chunk));
      callback();
    }
  });
  proc.kill = () => {};
  return proc;
}

test('Antigravity target metadata uses persistent Local-Origin transport', () => {
  const target = publicTarget({ command: 'agy', prefixArgs: [], source: 'agy', shell: false });
  assert.equal(target.id, TARGET_ID);
  assert.equal(target.targetClassId, 'local-origin');
  assert.equal(target.providerId, 'local-antigravity-cli');
  assert.equal(target.transport, 'persistent-stream-json');
  assert.equal(target.capabilities.chat, true);
});

test('Windows Antigravity discovery prefers executable/shim paths', () => {
  const launch = resolveAntigravityLaunch({
    platform: 'win32',
    spawnSyncImpl: () => ({ status: 0, stdout: 'C:\\tools\\agy\r\nC:\\tools\\agy.exe\r\n' })
  });
  assert.equal(launch.command, 'C:\\tools\\agy.exe');
  assert.equal(launch.shell, false);
});

test('persistent broker reuses one agy process across multiple turns', async () => {
  const proc = fakeProcess();
  const spawns = [];
  const broker = createBroker({
    cwd: 'C:\\repo',
    resolveLaunch: () => ({ command: 'agy.exe', prefixArgs: [], source: 'agy.exe', shell: false }),
    spawnImpl: (command, args, options) => {
      spawns.push({ command, args, options });
      return proc;
    }
  });
  const target = publicTarget({ command: 'agy.exe', prefixArgs: [], source: 'agy.exe', shell: false });
  const emitted = [];

  const first = broker.send({ requestId: 'one', text: 'hello', target, emit: (event) => emitted.push(event) });
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['--input-format', 'stream-json', '--output-format', 'stream-json']);
  assert.deepEqual(JSON.parse(proc.writes[0]), { event: 'user', message: { content: 'hello' } });
  assert.equal(broker.status().pid, 4242);

  proc.stdout.write(`${JSON.stringify({ event: 'init', conversation_id: 'conv-1', init: { cwd: 'C:\\repo' } })}\n`);
  assert.equal(broker.status().conversationId, 'conv-1');
  proc.stdout.write(`${JSON.stringify({ event: 'step_update', step_update: { conversation_id: 'conv-1', step_type: 'agent_response', state: 'ACTIVE', text_delta: 'hi' } })}\n`);
  proc.stdout.write(`${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'hi', conversation_id: 'conv-1' } })}\n`);
  assert.equal(await first, 0);
  const firstFinal = emitted.find((event) => event.type === 'response_final');
  assert.equal(firstFinal.text, 'hi');
  assert.equal(firstFinal.conversationId, 'conv-1');

  const secondEvents = [];
  const second = broker.send({ requestId: 'two', text: 'again', target, emit: (event) => secondEvents.push(event) });
  assert.equal(spawns.length, 1, 'second turn should reuse the same process');
  assert.deepEqual(JSON.parse(proc.writes[1]), { event: 'user', message: { content: 'again' } });
  proc.stdout.write(`${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'same session', conversation_id: 'conv-1' } })}\n`);
  assert.equal(await second, 0);
  assert.equal(secondEvents.find((event) => event.type === 'response_final').text, 'same session');
  assert.equal(broker.status().conversationId, 'conv-1');
  broker.stop();
  assert.equal(broker.status().running, false);
  assert.equal(broker.status().conversationId, null);
});

test('Antigravity tool steps are mirrored into activity UI events', async () => {
  const proc = fakeProcess();
  const broker = createBroker({
    resolveLaunch: () => ({ command: 'agy', prefixArgs: [], source: 'agy', shell: false }),
    spawnImpl: () => proc
  });
  const target = publicTarget({ command: 'agy', prefixArgs: [], source: 'agy', shell: false });
  const emitted = [];
  const turn = broker.send({ requestId: 'tool', text: 'inspect', target, emit: (event) => emitted.push(event) });

  proc.stdout.write(`${JSON.stringify({
    event: 'step_update',
    step_update: {
      step_type: 'tool', state: 'DONE', tool_name: 'run_command',
      tool_info: { name: 'run_command', parameters: { CommandLine: 'git status' }, output: 'clean' }
    }
  })}\n`);
  proc.stdout.write(`${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'done' } })}\n`);
  await turn;

  const activity = emitted.find((event) => event.type === 'activity_update' && !event.final);
  assert.ok(activity.activity.events.some((event) => event.label === 'Tool: run_command'));
  assert.match(activity.activity.events[0].text, /git status/);
  broker.stop();
});

test('Antigravity unexpected process death emits LOCAL_AGENT_EXITED', async () => {
  const proc = fakeProcess();
  const broker = createBroker({
    resolveLaunch: () => ({ command: 'agy', prefixArgs: [], source: 'agy', shell: false }),
    spawnImpl: () => proc
  });
  const target = publicTarget({ command: 'agy', prefixArgs: [], source: 'agy', shell: false });
  const emitted = [];
  const turn = broker.send({ requestId: 'crash', text: 'crash me', target, emit: (event) => emitted.push(event) });

  proc.stderr.write('fatal crash occurred\n');
  proc.emit('close', 1);
  const code = await turn;

  assert.equal(code, 1);
  const error = emitted.find((event) => event.type === 'error');
  assert.ok(error, 'Should emit error on crash');
  assert.equal(error.code, 'LOCAL_AGENT_EXITED');
  assert.match(error.message, /fatal crash occurred/);
  assert.equal(broker.status().conversationId, null);
  broker.stop();
});
