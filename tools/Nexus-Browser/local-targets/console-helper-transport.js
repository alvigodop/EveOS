'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFile } = require('node:child_process');

const HELPER = path.resolve(__dirname, '..', 'scripts', 'win-console-bridge.ps1');
const TIMEOUT_MS = 12000;

function parseResult(result = {}, resultPath, fsImpl = fs) {
  let raw = '';
  try { raw = String(fsImpl.readFileSync(resultPath, 'utf8') || ''); } catch {}
  if (!raw.trim()) raw = String(result.stdout || '');
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed.ok === 'boolean') return parsed;
  } catch {}
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.error?.killed === true;
  return {
    ok: false,
    code: timedOut ? 'CONSOLE_HELPER_TIMEOUT' : 'CONSOLE_HELPER_NO_RESULT',
    error: String(result.stderr || result.error?.message ||
      (timedOut ? 'Console probe timed out.' : 'Console helper exited without valid JSON.')).trim().slice(0, 350),
    exitStatus: result.status ?? null
  };
}

function helperArgs(mode, pid, resultPath) {
  return [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', HELPER, '-Mode', mode, '-TargetPid', String(pid),
    '-ResultPath', resultPath
  ];
}

function runHelper(mode, pid, text = '', {
  spawnSyncImpl = spawnSync, fsImpl = fs, tmpDir = os.tmpdir()
} = {}) {
  const dir = fsImpl.mkdtempSync(path.join(tmpDir, 'eveos-nexus-console-'));
  const resultPath = path.join(dir, 'result.json');
  try {
    const options = {
      encoding: 'utf8', windowsHide: true, timeout: TIMEOUT_MS
    };
    if (mode === 'send') options.input = Buffer.from(String(text), 'utf8').toString('base64');
    const result = spawnSyncImpl('powershell.exe', helperArgs(mode, pid, resultPath), options);
    return parseResult(result, resultPath, fsImpl);
  } finally {
    fsImpl.rmSync(dir, { recursive: true, force: true });
  }
}

function runHelperAsync(mode, pid, {
  execFileImpl = execFile, fsImpl = fs, tmpDir = os.tmpdir()
} = {}) {
  return new Promise((resolve) => {
    let dir;
    try {
      dir = fsImpl.mkdtempSync(path.join(tmpDir, 'eveos-nexus-console-'));
      const resultPath = path.join(dir, 'result.json');
      execFileImpl('powershell.exe', helperArgs(mode, pid, resultPath), {
        encoding: 'utf8', windowsHide: true, timeout: TIMEOUT_MS
      }, (error, stdout, stderr) => {
        try {
          resolve(parseResult({ error, stdout, stderr, status: error?.code ?? 0 }, resultPath, fsImpl));
        } finally {
          try { fsImpl.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
      });
    } catch (error) {
      if (dir) try { fsImpl.rmSync(dir, { recursive: true, force: true }); } catch {}
      resolve({ ok: false, code: 'CONSOLE_HELPER_START_FAILED', error: String(error?.message || error) });
    }
  });
}

module.exports = { HELPER, TIMEOUT_MS, parseResult, helperArgs, runHelper, runHelperAsync };
