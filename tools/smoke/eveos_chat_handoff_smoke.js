#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNNER = path.join(ROOT, 'tools', 'smoke', 'eveos_chat_handoff.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const result = spawnSync(process.execPath, [RUNNER, '--plan', '--profile', 'none', '--script', 'smoke:regressions'], {
  cwd: ROOT,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000
});

const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
assert(result.status === 0, `chat handoff plan failed: ${output || result.error?.message || 'unknown error'}`);
assert(output.includes('EVEOS CHAT HANDOFF PLAN'), 'chat handoff plan marker missing');
assert(output.includes('PROFILE none'), 'chat handoff profile marker missing');
assert(
  output.includes('RUN test:guardrails -> smoke:regressions'),
  'focused chat handoff did not prepend structural guardrails'
);
assert(/HEAD [0-9a-f]{40}/i.test(output), 'chat handoff exact HEAD missing');

const aiControl = spawnSync(process.execPath, [RUNNER, '--plan', '--profile', 'ai-control'], {
  cwd: ROOT,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000
});
const aiOutput = [aiControl.stdout, aiControl.stderr].filter(Boolean).join('\n');
assert(aiControl.status === 0, `ai-control handoff plan failed: ${aiOutput || aiControl.error?.message || 'unknown error'}`);
assert(aiOutput.includes('PROFILE ai-control'), 'ai-control profile marker missing');
assert(aiOutput.includes('RUN test:ai-control'), 'ai-control handoff did not resolve to the focused test profile');

for (const [args, profile, command] of [
  [['--base', 'HEAD'], 'affected', 'qualify:affected:timed'],
  [['--final'], 'none', 'verify']
]) {
  const preview = spawnSync(process.execPath, [RUNNER, '--plan', ...args], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 30_000
  });
  assert(preview.status === 0, preview.stderr || preview.error?.message || 'handoff preview failed');
  const lines = preview.stdout.split(/\r?\n/);
  assert(lines.includes(`PROFILE ${profile}`) && lines.includes(`RUN ${command}`),
    'the default handoff must be scoped and a release must run verify once');
  if (profile === 'affected') {
    assert(lines.some(line => line.startsWith('AFFECTED ')), 'affected handoff preview lost its selected gates');
    assert(lines.some(line => /^BASE [0-9a-f]{40}$/i.test(line)), 'affected handoff preview lost its exact base SHA');
  }
}

console.log('EVEOS_CHAT_HANDOFF_SMOKE_OK');
