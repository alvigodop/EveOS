const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const TARGET_ID = 'local:gemini-cli:latest';
const TARGET_TYPE_ID = 'terminal-agent';

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveGeminiLaunch({
  platform = process.platform,
  env = process.env,
  exists = fs.existsSync,
  spawnSyncImpl = spawnSync
} = {}) {
  const finder = platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSyncImpl(finder, ['gemini'], { encoding: 'utf8', windowsHide: true, env });
  if (result?.status !== 0) return null;

  const candidates = splitLines(result.stdout);
  if (!candidates.length) return null;

  const found = platform === 'win32'
    ? (candidates.find((candidate) => /\.(cmd|bat|exe)$/i.test(candidate)) || candidates[0])
    : candidates[0];

  if (platform === 'win32' && /\.(cmd|bat)$/i.test(found)) {
    const npmRoot = path.dirname(found);
    const candidateEntries = [
      path.join(npmRoot, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'),
      path.join(npmRoot, 'node_modules', '@google', 'gemini-cli', 'dist', 'index.js')
    ];
    const entry = candidateEntries.find((cand) => exists(cand));
    if (entry) return { command: process.execPath, prefixArgs: [entry], source: found };
  }
  return { command: found, prefixArgs: [], source: found };
}

function localWorkspace() {
  const configured = String(process.env.NEXUS_BROWSER_LOCAL_CWD || process.env.BROWSER_AI_BRIDGE_LOCAL_CWD || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, '..', '..');
}

function publicTarget(launch = resolveGeminiLaunch()) {
  if (!launch) return null;
  return {
    id: TARGET_ID,
    targetClassId: 'local-origin',
    targetTypeId: TARGET_TYPE_ID,
    targetTypeName: 'Terminal Agent',
    providerId: 'local-gemini-cli',
    providerName: 'Gemini CLI',
    title: 'Gemini CLI · latest repository session',
    detail: 'Session-backed bridge into the latest Gemini CLI conversation for the repository workspace.',
    transport: 'local-process',
    workspace: localWorkspace(),
    capabilities: { chat: true, captureLatest: false, activity: true, searchResults: false }
  };
}

function parseStreamLine(line) {
  try { return JSON.parse(line); }
  catch { return null; }
}

function formatExitMessage(stderr, exitCode) {
  const raw = String(stderr || '').trim();
  if (!raw) return `Gemini CLI exited with code ${exitCode}.`;
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const errorLine = lines.find((line) => /^(error\s*authenticating|error:|ineligibletiererror)/i.test(line));
  if (errorLine) return errorLine;
  return raw;
}

function createStreamAccumulator({ requestId, target, emit }) {
  let text = '';
  const activity = [];
  let sawResult = false;

  function publishActivity(final = false) {
    if (!activity.length) return;
    emit({
      type: 'activity_update',
      requestId,
      activity: { events: activity.slice() },
      final,
      targetClassId: 'local-origin',
      providerId: target.providerId,
      providerName: target.providerName
    });
  }

  return {
    handle(event) {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'message' && event.role === 'assistant' && event.content) {
        text += String(event.content);
        emit({
          type: 'response_partial',
          requestId,
          text,
          targetClassId: 'local-origin',
          providerId: target.providerId,
          providerName: target.providerName
        });
        return;
      }
      if (event.type === 'tool_use') {
        activity.push({
          type: 'tool',
          label: `Tool: ${event.tool_name || 'local agent tool'}`,
          text: event.parameters ? JSON.stringify(event.parameters, null, 2) : ''
        });
        publishActivity(false);
        return;
      }
      if (event.type === 'tool_result') {
        activity.push({
          type: 'tool',
          label: `Tool result: ${event.status || 'complete'}`,
          text: String(event.output || event.error?.message || '').slice(0, 4000)
        });
        publishActivity(false);
        return;
      }
      if (event.type === 'error') {
        activity.push({ type: 'tool', label: 'Agent warning', text: String(event.message || '') });
        publishActivity(false);
        return;
      }
      if (event.type === 'result') {
        sawResult = true;
        if (event.status === 'error') {
          emit({
            type: 'error',
            requestId,
            code: 'LOCAL_AGENT_ERROR',
            message: event.error?.message || 'Gemini CLI reported an error.',
            targetClassId: 'local-origin'
          });
          return;
        }
        publishActivity(true);
        emit({
          type: 'response_final',
          requestId,
          text,
          targetClassId: 'local-origin',
          providerId: target.providerId,
          providerName: target.providerName
        });
      }
    },
    finish(exitCode, stderr = '') {
      if (sawResult) return;
      if (exitCode === 0 && text) {
        publishActivity(true);
        emit({
          type: 'response_final',
          requestId,
          text,
          targetClassId: 'local-origin',
          providerId: target.providerId,
          providerName: target.providerName
        });
      } else {
        emit({
          type: 'error',
          requestId,
          code: 'LOCAL_AGENT_EXITED',
          message: formatExitMessage(stderr, exitCode),
          targetClassId: 'local-origin'
        });
      }
    }
  };
}

async function sendPrompt({
  requestId,
  text,
  target = publicTarget(),
  emit,
  spawnImpl = spawn,
  launch = resolveGeminiLaunch(),
  cwd = localWorkspace()
}) {
  if (!target || !launch) throw new Error('Gemini CLI is not available on PATH.');
  if (!requestId || !String(text || '').trim()) throw new Error('Local agent prompt is empty.');

  const args = [
    ...launch.prefixArgs,
    '--resume', 'latest',
    '--prompt', String(text),
    '--output-format', 'stream-json'
  ];
  const child = spawnImpl(launch.command, args, {
    cwd,
    env: { ...process.env, GEMINI_CLI_SURFACE: 'browser-ai-bridge-local-origin' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false
  });

  const accumulator = createStreamAccumulator({ requestId, target, emit });
  let pending = '';
  let stderr = '';

  child.stdout?.setEncoding?.('utf8');
  child.stderr?.setEncoding?.('utf8');
  child.stdout?.on('data', (chunk) => {
    pending += String(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      const event = parseStreamLine(line.trim());
      if (event) accumulator.handle(event);
    }
  });
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (pending.trim()) {
        const event = parseStreamLine(pending.trim());
        if (event) accumulator.handle(event);
      }
      accumulator.finish(code ?? 1, stderr);
      resolve(code ?? 1);
    });
  });
}

module.exports = {
  TARGET_ID,
  TARGET_TYPE_ID,
  resolveGeminiLaunch,
  localWorkspace,
  publicTarget,
  parseStreamLine,
  createStreamAccumulator,
  sendPrompt
};
