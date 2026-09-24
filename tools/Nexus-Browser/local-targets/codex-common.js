'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const THREAD_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveCodexLaunch({ platform = process.platform, env = process.env, spawnSyncImpl = spawnSync } = {}) {
  const override = String(env.NEXUS_BROWSER_CODEX_BIN || env.BROWSER_AI_BRIDGE_CODEX_BIN || '').trim();
  if (override && fs.existsSync(override)) return { command: override, source: override, shell: false };
  const result = spawnSyncImpl(platform === 'win32' ? 'where.exe' : 'which', ['codex'], {
    encoding: 'utf8', windowsHide: true, env, timeout: 5000
  });
  if (result?.status !== 0) return null;
  const candidates = splitLines(result.stdout);
  const command = platform === 'win32'
    ? (candidates.find((candidate) => /codex\.exe$/i.test(candidate)) || candidates.find((candidate) => /codex\.cmd$/i.test(candidate)))
    : candidates[0];
  if (!command) return null;
  return { command, source: command, shell: platform === 'win32' && /\.cmd$/i.test(command) };
}

function codexSettings(env = process.env) {
  return {
    model: String(env.NEXUS_BROWSER_CODEX_MODEL || env.BROWSER_AI_BRIDGE_CODEX_MODEL || 'gpt-5.6-sol').trim(),
    effort: String(env.NEXUS_BROWSER_CODEX_EFFORT || env.BROWSER_AI_BRIDGE_CODEX_EFFORT || 'low').trim(),
    sandbox: String(env.NEXUS_BROWSER_CODEX_SANDBOX || env.BROWSER_AI_BRIDGE_CODEX_SANDBOX || 'read-only').trim()
  };
}

function parseJsonLine(line) {
  try { return JSON.parse(String(line || '').trim()); }
  catch { return null; }
}

function codexEvent(event = {}) {
  const type = String(event.type || '').replaceAll('/', '.');
  const item = event.item || event.payload?.item || {};
  const itemType = String(item.type || '').toLowerCase();
  const threadId = event.thread_id || event.threadId || event.payload?.thread_id || event.payload?.threadId || null;
  let text = '';
  if (itemType === 'agent_message') {
    text = String(item.text || item.content?.map?.((part) => part.text || '').join('') || '');
  }
  if (!text && event.payload?.type === 'task_complete') text = String(event.payload.last_agent_message || '');
  return { type, threadId, text };
}

function execTurn({ prompt, ephemeral, cwd, launch = resolveCodexLaunch(), settings = codexSettings(), spawnImpl = spawn, timeoutMs = 600000, onText = null }) {
  if (!launch) return Promise.reject(new Error('Codex CLI is not installed or could not be resolved.'));
  const args = ['exec'];
  if (ephemeral) args.push('--ephemeral');
  args.push('--json', '--color', 'never', '-m', settings.model,
    '-c', `model_reasoning_effort="${settings.effort}"`, '-s', settings.sandbox, '-C', cwd, '-');
  return new Promise((resolve, reject) => {
    let stdoutPending = '';
    let stderrTail = '';
    let threadId = null;
    let finalText = '';
    let settled = false;
    const child = spawnImpl(launch.command, args, {
      cwd, env: { ...process.env }, shell: !!launch.shell,
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(Object.assign(new Error('Codex turn timed out.'), { code: 'LOCAL_CODEX_TIMEOUT' }));
    }, timeoutMs);
    const consume = (line) => {
      const parsed = codexEvent(parseJsonLine(line) || {});
      if (parsed.threadId) threadId = parsed.threadId;
      if (parsed.text) {
        finalText = parsed.text;
        onText?.(finalText);
      }
    };
    child.stdout?.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout?.on('data', (chunk) => {
      stdoutPending += String(chunk);
      const lines = stdoutPending.split(/\r?\n/);
      stdoutPending = lines.pop() || '';
      for (const line of lines) consume(line);
    });
    child.stderr?.on('data', (chunk) => { stderrTail = `${stderrTail}${chunk}`.slice(-5000); });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutPending.trim()) consume(stdoutPending);
      if (code === 0 && finalText) return resolve({ threadId, text: finalText });
      const detail = stderrTail.trim().split(/\r?\n/).filter(Boolean).slice(-8).join('\n');
      reject(Object.assign(new Error(detail || `Codex exited with code ${code ?? 1}.`), { code: 'LOCAL_CODEX_EXITED' }));
    });
    child.stdin.end(String(prompt || ''));
  });
}

function discoverCodexProcesses({ platform = process.platform, spawnSyncImpl = spawnSync } = {}) {
  if (platform !== 'win32') return [];
  const script = [
    '$items = Get-CimInstance Win32_Process -Filter "Name=\'codex.exe\'" |',
    'Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath;',
    '$json = @($items) | ConvertTo-Json -Compress;',
    'if ($json) { $json } else { "[]" }'
  ].join(' ');
  const result = spawnSyncImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 5000
  });
  if (result?.status !== 0) return [];
  const parsed = parseJsonLine(result.stdout) || [];
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item?.ProcessId);
}

function resumedThreadId(processInfo = {}) {
  const line = String(processInfo.CommandLine || processInfo.commandLine || '');
  const match = line.match(new RegExp(`(?:^|\\s)resume\\s+["']?(${THREAD_ID_PATTERN})`, 'i'));
  return match?.[1]?.toLowerCase() || null;
}

function sessionRoot(env = process.env) {
  const root = String(env.CODEX_HOME || '').trim() || path.join(env.USERPROFILE || '', '.codex');
  return path.join(root, 'sessions');
}

function findRolloutFile(threadId, { root = sessionRoot() } = {}) {
  if (!threadId || !fs.existsSync(root)) return null;
  const suffix = `${String(threadId).toLowerCase()}.jsonl`;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase().endsWith(suffix)) return full;
    }
  }
  return null;
}

function rolloutEvents(text) {
  return splitLines(text).map(parseJsonLine).filter(Boolean);
}

function completedReply(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'event_msg' && event.payload?.type === 'task_complete') {
      return String(event.payload.last_agent_message || '').trim();
    }
  }
  return '';
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function runCommand(command, args, { cwd, shell = false, spawnImpl = spawn, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let settled = false;
    const child = spawnImpl(command, args, { cwd, env: { ...process.env }, shell, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(new Error('Codex queue command timed out.'));
    }, timeoutMs);
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.once('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Codex queue exited with code ${code ?? 1}.`));
    });
  });
}

async function queueAndCapture({ threadId, text, cwd, launch = resolveCodexLaunch(), emitPartial = null, timeoutMs = 600000, pollMs = 250 }) {
  if (!launch) throw new Error('Codex CLI is not installed or could not be resolved.');
  const rollout = findRolloutFile(threadId);
  if (!rollout) throw new Error(`Could not locate the exact Codex rollout for thread ${threadId}.`);
  let offset = fs.statSync(rollout).size;
  let pending = '';
  const events = [];
  await runCommand(launch.command, ['queue', '--thread', threadId, '--message', String(text)], { cwd, shell: !!launch.shell });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const size = fs.statSync(rollout).size;
    if (size <= offset) continue;
    const length = size - offset;
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(rollout, 'r');
    try { fs.readSync(fd, buffer, 0, length, offset); } finally { fs.closeSync(fd); }
    offset = size;
    pending += buffer.toString('utf8');
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    events.push(...lines.map(parseJsonLine).filter(Boolean));
    const reply = completedReply(events);
    if (reply) { emitPartial?.(reply); return { text: reply, rollout }; }
  }
  throw Object.assign(new Error('Timed out waiting for the exact Codex thread to complete.'), { code: 'LOCAL_CODEX_TIMEOUT' });
}

module.exports = {
  THREAD_ID_PATTERN, splitLines, resolveCodexLaunch, codexSettings, parseJsonLine, codexEvent,
  execTurn, discoverCodexProcesses, resumedThreadId, sessionRoot, findRolloutFile,
  rolloutEvents, completedReply, runCommand, queueAndCapture
};
