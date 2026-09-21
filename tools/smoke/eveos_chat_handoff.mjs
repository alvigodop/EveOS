#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RESULT_DIR = path.join(ROOT, 'data', 'runtime', 'smoke-results');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const PORTS_PATH = path.join(ROOT, 'config', 'eveos-ports.json');
const MAX_CAPTURE_CHARS = 8 * 1024 * 1024;
const MAX_FAILURE_LINES = 42;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

const PROFILE_SCRIPTS = Object.freeze({
  none: [],
  fast: ['test:smoke'],
  deep: ['test:deep'],
  security: ['test:security']
});

function argValues(args, name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) values.push(args[++i]);
  }
  return values;
}

function argValue(args, name, fallback = '') {
  const values = argValues(args, name);
  return values.length ? values[values.length - 1] : fallback;
}

function run(command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_CAPTURE_CHARS,
    env: options.env || process.env
  });
  return {
    status: result.status,
    signal: result.signal || '',
    error: result.error?.message || '',
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    durationMs: Date.now() - startedAt
  };
}

function git(args) {
  const result = run('git', args, { timeout: 60_000 });
  return result.status === 0 ? result.stdout.trim() : '';
}

function commandVersion(command, args) {
  const result = run(command, args, { timeout: 15_000 });
  return result.status === 0 ? (result.stdout || result.stderr).trim() : '';
}

function pythonVersion() {
  for (const command of (process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'])) {
    const args = command === 'py' ? ['-3', '--version'] : ['--version'];
    const version = commandVersion(command, args);
    if (version) return version;
  }
  return '';
}

function playwrightVersion() {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    return String(lock.packages?.['node_modules/playwright']?.version || '');
  } catch {
    return '';
  }
}

function packageScripts() {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8')).scripts || {};
  } catch {
    return {};
  }
}

function changedFiles(base) {
  if (!base) return [];
  const mergeBase = git(['merge-base', base, 'HEAD']);
  if (!mergeBase) return [];
  return git(['diff', '--name-only', `${mergeBase}..HEAD`]).split(/\r?\n/).filter(Boolean);
}

function fetchOrigin() {
  const result = run('git', ['fetch', '--quiet', 'origin'], { timeout: 120_000 });
  return {
    ok: result.status === 0,
    error: result.error || result.stderr.trim()
  };
}

function parseWindowsListeners(ports) {
  if (process.platform !== 'win32') return [];
  const result = run('netstat', ['-ano', '-p', 'tcp'], { timeout: 30_000 });
  if (result.status !== 0) return [];
  const wanted = new Set(ports.map((port) => Number(port)));
  const listeners = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const local = parts[1];
    const match = local.match(/:(\d+)$/);
    const port = match ? Number(match[1]) : 0;
    if (!wanted.has(port)) continue;
    listeners.push({ port, local, pid: Number(parts[4]) || 0 });
  }
  return listeners.sort((a, b) => a.port - b.port || a.pid - b.pid);
}

function portSnapshot() {
  try {
    const registry = JSON.parse(fs.readFileSync(PORTS_PATH, 'utf8')).ports || {};
    const records = Object.entries(registry).map(([key, value]) => ({
      key,
      port: Number(value?.port) || 0,
      service: String(value?.service || '')
    })).filter((record) => record.port > 0);
    const listeners = parseWindowsListeners(records.map((record) => record.port));
    return records.map((record) => ({
      ...record,
      listeners: listeners.filter((listener) => listener.port === record.port)
    }));
  } catch {
    return [];
  }
}

function environmentSnapshot(base, fetchResult) {
  const status = git(['status', '--short']);
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  return {
    recordedAt: new Date().toISOString(),
    branch: git(['branch', '--show-current']),
    head,
    originMain,
    syncedToOriginMain: !!head && head === originMain,
    fetchOrigin: fetchResult,
    worktreeClean: !status,
    worktreeStatus: status.split(/\r?\n/).filter(Boolean),
    base: base || '',
    changedFiles: changedFiles(base),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    node: process.version,
    npm: commandVersion(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']),
    python: pythonVersion(),
    playwright: playwrightVersion(),
    ports: portSnapshot()
  };
}

function npmCommand(script, env, timeout) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run --silent ${script}`]
    : ['run', '--silent', script];
  return run(command, args, { env, timeout });
}

function relevantFailureLines(output) {
  const lines = String(output || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const matched = lines.filter((line) => /error|fail|traceback|assert|expected|received|timeout|exception|not found|blocked|conflict|at\s+\S+/i.test(line));
  return (matched.length ? matched : lines).slice(-MAX_FAILURE_LINES);
}

function safeFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeArtifacts(report, outputs) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const stamp = safeFileStamp();
  const jsonPath = path.join(RESULT_DIR, `chat-handoff-${stamp}.json`);
  const logPath = path.join(RESULT_DIR, `chat-handoff-${stamp}.log`);
  const latestPath = path.join(RESULT_DIR, 'LAST-CHAT-HANDOFF.txt');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(logPath, outputs.join('\n\n'), 'utf8');
  fs.writeFileSync(latestPath, renderTextReport(report, {
    jsonPath: rel(jsonPath),
    logPath: rel(logPath)
  }) + '\n', 'utf8');
  return { jsonPath: rel(jsonPath), logPath: rel(logPath), latestPath: rel(latestPath) };
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function renderTextReport(report, artifacts = {}) {
  const env = report.environment;
  const lines = [
    'EVEOS_CHAT_HANDOFF',
    `HEAD ${env.head || 'unknown'}`,
    `ORIGIN_MAIN ${env.originMain || 'unknown'} (${env.syncedToOriginMain ? 'aligned' : 'MISMATCH'})`,
    `WORKTREE ${env.worktreeClean ? 'clean' : 'DIRTY'}`,
    `ENV ${env.platform}/${env.arch} | ${env.node || 'node?'} | ${env.python || 'python?'} | Playwright ${env.playwright || '?'}`,
    `PLAN ${report.plan.join(' -> ') || '(none)'}`,
    `RESULT PASS ${report.pass} | FAIL ${report.fail} | SKIP ${report.skip}`
  ];
  for (const item of report.results) {
    lines.push(`${item.ok ? 'PASS' : 'FAIL'} ${item.script} ${(item.durationMs / 1000).toFixed(1)}s${item.status === null ? ' (no exit status)' : ''}`);
  }
  if (env.changedFiles.length) lines.push(`CHANGED ${env.changedFiles.join(', ')}`);
  if (!env.worktreeClean) lines.push(...env.worktreeStatus.map((line) => `DIRTY ${line}`));
  const failed = report.results.find((item) => !item.ok);
  if (failed) {
    lines.push('FAILURE_CONTEXT');
    lines.push(...failed.failureContext.map((line) => `  ${line}`));
  }
  if (artifacts.jsonPath) lines.push(`JSON ${artifacts.jsonPath}`);
  if (artifacts.logPath) lines.push(`LOG ${artifacts.logPath}`);
  return lines.join('\n');
}

function buildPlan(args, scripts) {
  const explicit = argValues(args, '--script');
  const profileDefault = explicit.length ? 'none' : 'fast';
  const profile = argValue(args, '--profile', profileDefault).toLowerCase();
  if (!Object.hasOwn(PROFILE_SCRIPTS, profile)) {
    throw new Error(`Unknown profile '${profile}'. Use none, fast, deep, or security.`);
  }
  const plan = [...explicit, ...PROFILE_SCRIPTS[profile]];
  if (args.includes('--final')) plan.push('verify');
  const deduped = [...new Set(plan)];
  for (const script of deduped) {
    if (!scripts[script]) throw new Error(`Unknown npm script '${script}'.`);
  }
  return { profile, plan: deduped };
}

function main() {
  const args = process.argv.slice(2);
  const scripts = packageScripts();
  const { profile, plan } = buildPlan(args, scripts);
  const base = argValue(args, '--base', '');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const planOnly = args.includes('--plan');
  const fetchResult = planOnly ? { ok: true, skipped: true } : fetchOrigin();
  const environment = environmentSnapshot(base, fetchResult);

  if (planOnly) {
    console.log('EVEOS CHAT HANDOFF PLAN');
    console.log(`HEAD ${environment.head || 'unknown'}`);
    console.log(`PROFILE ${profile}`);
    console.log(`RUN ${plan.join(' -> ') || '(none)'}`);
    if (environment.changedFiles.length) console.log(`CHANGED ${environment.changedFiles.join(', ')}`);
    return;
  }

  if (!environment.worktreeClean && !args.includes('--allow-dirty')) {
    console.error('EVEOS CHAT HANDOFF REFUSED: worktree is dirty. Commit/reconcile it first, or rerun with --allow-dirty when intentional.');
    for (const line of environment.worktreeStatus) console.error(`  ${line}`);
    process.exit(2);
  }

  const timeoutValue = Number(argValue(args, '--timeout-ms', String(DEFAULT_TIMEOUT_MS)));
  const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : DEFAULT_TIMEOUT_MS;
  const results = [];
  const outputs = [];
  for (const script of plan) {
    const result = npmCommand(script, { ...process.env, EVEOS_CHAT_HANDOFF: '1', EVEOS_CHAT_TEST_TIMEOUT_MS: String(timeoutMs) }, timeoutMs);
    const output = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n');
    const item = {
      script,
      ok: result.status === 0,
      status: result.status,
      signal: result.signal,
      durationMs: result.durationMs,
      failureContext: result.status === 0 ? [] : relevantFailureLines(output)
    };
    results.push(item);
    outputs.push(`===== ${script} | status ${result.status} | ${(result.durationMs / 1000).toFixed(1)}s =====\n${output}`);
    if (verbose && output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    if (!item.ok) break;
  }

  const report = {
    schemaVersion: 1,
    profile,
    plan,
    environment,
    results,
    pass: results.filter((item) => item.ok).length,
    fail: results.filter((item) => !item.ok).length,
    skip: Math.max(0, plan.length - results.length)
  };
  const artifacts = writeArtifacts(report, outputs);
  console.log(renderTextReport(report, artifacts));
  if (report.fail) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`EVEOS CHAT HANDOFF ERROR: ${error?.message || error}`);
  process.exit(2);
}
