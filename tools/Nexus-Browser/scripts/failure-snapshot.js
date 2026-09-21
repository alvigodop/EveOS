#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { defaultLogPath } = require('./runtime-log');
const { DEFAULT_FILE: INCIDENT_FILE } = require('../dex/incident-store');
const { DEFAULT_FILE: LEDGER_FILE } = require('../dex/turn-ledger');
const { DEFAULT_FILE: STATE_FILE, readJson } = require('../dex/state-store');
const { compactRoom } = require('../dex/handoff-packet');
const { failureExcerpt } = require('./qualify');
const { dataDir, urls } = require('../runtime-config');

const ROOT = path.resolve(__dirname, '..');
const DIAGNOSTICS = process.env.NEXUS_BROWSER_DIAGNOSTICS || process.env.BROWSER_AI_BRIDGE_DIAGNOSTICS || urls().diagnostics;
const QUALIFICATION_DIR = path.join(dataDir(), 'qualification');

function parseArgs(argv = process.argv.slice(2)) {
  const out = { requestId: '', roomId: '', provider: '', lines: 80 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--request-id') out.requestId = String(argv[++i] || '');
    else if (arg === '--room-id') out.roomId = String(argv[++i] || '');
    else if (arg === '--provider') out.provider = String(argv[++i] || '');
    else if (arg === '--lines') out.lines = Math.max(10, Math.min(300, Number(argv[++i] || 80) || 80));
  }
  return out;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function readLines(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean); }
  catch { return []; }
}

function relevantSnippets(lines, needles = [], maxLines = 80, context = 3) {
  const active = needles.map((value) => String(value || '').toLowerCase()).filter(Boolean);
  if (!active.length) return { matched: false, lines: lines.slice(-maxLines) };
  const indexes = [];
  lines.forEach((line, index) => {
    const text = line.toLowerCase();
    if (active.some((needle) => text.includes(needle))) indexes.push(index);
  });
  if (!indexes.length) return { matched: false, lines: lines.slice(-Math.min(maxLines, 30)) };
  const selected = new Set();
  for (const index of indexes) {
    for (let i = Math.max(0, index - context); i <= Math.min(lines.length - 1, index + context); i += 1) selected.add(i);
  }
  return {
    matched: true,
    lines: [...selected].sort((a, b) => a - b).slice(-maxLines).map((index) => lines[index])
  };
}

function jsonTail(filePath, needles = [], limit = 12) {
  const active = needles.map((value) => String(value || '').toLowerCase()).filter(Boolean);
  const values = [];
  for (const line of readLines(filePath)) {
    try {
      const parsed = JSON.parse(line);
      const text = JSON.stringify(parsed).toLowerCase();
      if (!active.length || active.some((needle) => text.includes(needle))) values.push(parsed);
    } catch {}
  }
  return values.slice(-limit);
}

function latestQualificationLog(dir = QUALIFICATION_DIR, maxLines = 80) {
  let files = [];
  try {
    files = fs.readdirSync(dir)
      .filter((name) => name.endsWith('.log'))
      .map((name) => ({ name, path: path.join(dir, name), stat: fs.statSync(path.join(dir, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  } catch {}
  const latest = files[0] || null;
  if (!latest) return { available: false, filePath: null, totalLines: 0, failureExcerpt: [] };
  const lines = readLines(latest.path);
  return {
    available: true,
    filePath: latest.path,
    totalLines: lines.length,
    failureExcerpt: failureExcerpt(lines.join('\n'), maxLines)
  };
}

function terminalSignals(lines = []) {
  const tabCounts = [];
  for (const line of lines) {
    const match = line.match(/tabs_update:\s+(\d+)\s+tab/i);
    if (match) tabCounts.push(Number(match[1]));
  }
  const count = (pattern) => lines.filter((line) => pattern.test(line)).length;
  return {
    extensionConnected: count(/\[bridge\] extension connected/i),
    extensionDisconnected: count(/\[bridge\] extension disconnected/i),
    supervisorRestarts: count(/restarting server pid/i),
    websocketErrors: count(/websocket error/i),
    recentTabCounts: tabCounts.slice(-12),
    lastTabCount: tabCounts.at(-1) ?? null
  };
}

async function readDiagnostics() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(DIAGNOSTICS, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildSnapshot(options = parseArgs()) {
  const serverLogFile = defaultLogPath(ROOT);
  const logLines = readLines(serverLogFile);
  const needles = [options.requestId, options.roomId, options.provider].filter(Boolean);
  const state = readJson(STATE_FILE);
  const room = (state?.rooms || []).find((entry) => entry.id === options.roomId)
    || (state?.rooms || []).find((entry) => entry.id === state?.activeRoomId)
    || null;
  const diagnostics = await readDiagnostics();
  const incidentTail = jsonTail(INCIDENT_FILE, needles, 12);
  const ledgerTail = jsonTail(LEDGER_FILE, needles, 12);
  const snippets = relevantSnippets(logLines, needles, options.lines);
  const qualification = latestQualificationLog(QUALIFICATION_DIR, options.lines);
  return {
    generatedAt: new Date().toISOString(),
    filters: options,
    repo: {
      head: git(['rev-parse', 'HEAD']),
      branch: git(['branch', '--show-current']),
      status: (git(['status', '--short']) || '').split(/\r?\n/).filter(Boolean),
      originMain: git(['rev-parse', 'origin/main'])
    },
    diagnostics,
    room: room ? compactRoom(room) : null,
    incidentTail,
    ledgerTail,
    qualification,
    serverLog: {
      filePath: serverLogFile,
      available: logLines.length > 0,
      totalLines: logLines.length,
      matchedFilter: snippets.matched,
      signals: terminalSignals(logLines.slice(-500)),
      snippets: snippets.lines
    },
    hints: {
      filtered: 'npm run diagnose -- --request-id <id> --room-id <id> --provider <provider>',
      doctor: 'npm run doctor',
      handoff: 'npm run handoff:verify'
    }
  };
}

async function main() {
  const snapshot = await buildSnapshot(parseArgs());
  console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});

module.exports = { parseArgs, readLines, relevantSnippets, jsonTail, latestQualificationLog, terminalSignals, readDiagnostics, buildSnapshot, main };
