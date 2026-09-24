'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const common = require('../local-targets/codex-common');
const cli = require('../local-targets/codex-cli');
const existing = require('../local-targets/codex-existing');

const THREAD = '01a0d2aa-a9de-7810-b028-0a735fcb134b';

test('Codex resolver prefers native executable over Windows shims', () => {
  const launch = common.resolveCodexLaunch({
    platform: 'win32',
    spawnSyncImpl: () => ({ status: 0, stdout: 'C:\\npm\\codex\r\nC:\\npm\\codex.cmd\r\nC:\\Codex\\codex.exe\r\n' })
  });
  assert.equal(launch.command, 'C:\\Codex\\codex.exe');
  assert.equal(launch.shell, false);
});

test('Codex event parser captures exact thread and final agent text', () => {
  assert.deepEqual(common.codexEvent({ type: 'thread.started', thread_id: THREAD }), {
    type: 'thread.started', threadId: THREAD, text: ''
  });
  assert.equal(common.codexEvent({
    type: 'item.completed', item: { type: 'agent_message', text: 'NOVA_OK' }
  }).text, 'NOVA_OK');
});

test('Codex process discovery accepts only explicit resumed thread IDs', () => {
  assert.equal(common.resumedThreadId({ CommandLine: `codex.exe resume ${THREAD} --no-alt-screen` }), THREAD);
  assert.equal(common.resumedThreadId({ CommandLine: 'codex.exe app-server --listen stdio://' }), null);
  assert.equal(common.resumedThreadId({ CommandLine: 'codex.exe exec --json' }), null);
});

test('Codex rollout completion is scoped to task_complete final answer', () => {
  const events = common.rolloutEvents([
    JSON.stringify({ type: 'response_item', payload: { role: 'assistant', content: [{ text: 'draft' }] } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'NOVA_FINAL' } })
  ].join('\n'));
  assert.equal(common.completedReply(events), 'NOVA_FINAL');
});

test('Codex targets expose one reusable ChatGPT spawned terminal', () => {
  const targets = cli.publicTargets({ command: 'codex.exe', shell: false });
  assert.deepEqual(targets.map((target) => target.id), [cli.SPAWNED_ID]);
  assert.equal(targets[0].providerName, 'ChatGPT (Codex CLI)');
  assert.equal(targets[0].title, 'ChatGPT (Codex CLI) · Spawned Terminal');
  assert.equal(targets[0].sessionOrigin, 'spawned');
});

test('Visible spawned terminal explicitly resumes noninteractive Codex sessions', () => {
  let captured = null;
  assert.equal(cli.openVisibleTerminal({
    threadId: THREAD, cwd: 'C:\\Workspace', launch: { command: 'C:\\Codex\\codex.exe' },
    settings: { model: 'gpt-5.6-sol', effort: 'low', sandbox: 'read-only' },
    spawnSyncImpl: (command, args, options) => { captured = { command, args, options }; return { status: 0 }; }
  }), true);
  assert.match(captured.args.at(-1), /--include-non-interactive/);
  assert.equal(captured.options.env.NEXUS_CODEX_THREAD, THREAD);
  assert.equal(captured.options.env.TERM, 'xterm-256color');
});

test('Spawned Codex state remains machine-local and round-trips exact thread identity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eveos-codex-state-'));
  const stateFile = path.join(dir, 'codex.json');
  cli.writeState({ threadId: THREAD, cwd: 'C:\\Workspace' }, { stateFile });
  assert.deepEqual(cli.readState({ stateFile }), { threadId: THREAD, cwd: 'C:\\Workspace' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Existing adapter derives target from exact resumed terminal only', () => {
  const processInfo = { ProcessId: 4242, ParentProcessId: 42, CommandLine: `codex.exe resume ${THREAD}` };
  const target = existing.targetFromProcess(processInfo, THREAD);
  assert.equal(target.id, `${existing.TARGET_PREFIX}${THREAD}`);
  assert.equal(target.pid, 4242);
  assert.equal(target.conversationId, THREAD);
  assert.equal(existing.threadFromTarget(target.id), THREAD);
  assert.equal(target.providerName, 'ChatGPT (Codex CLI)');
});
