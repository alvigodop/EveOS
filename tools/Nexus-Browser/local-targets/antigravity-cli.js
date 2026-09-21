const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const TARGET_ID = 'local:antigravity-cli:managed';
const TARGET_TYPE_ID = 'terminal-agent';

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveAntigravityLaunch({
  platform = process.platform,
  env = process.env,
  spawnSyncImpl = spawnSync
} = {}) {
  const finder = platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSyncImpl(finder, ['agy'], { encoding: 'utf8', windowsHide: true, env });
  if (result?.status !== 0) return null;
  const candidates = splitLines(result.stdout);
  if (!candidates.length) return null;

  const found = platform === 'win32'
    ? (candidates.find((candidate) => /\.(exe|cmd|bat)$/i.test(candidate)) || candidates[0])
    : candidates[0];
  const shell = platform === 'win32' && /\.(cmd|bat)$/i.test(found);
  return { command: found, prefixArgs: [], source: found, shell };
}

function localWorkspace() {
  const configured = String(process.env.NEXUS_BROWSER_LOCAL_CWD || process.env.BROWSER_AI_BRIDGE_LOCAL_CWD || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, '..', '..');
}

function publicTarget(launch = resolveAntigravityLaunch()) {
  if (!launch) return null;
  const label = String(process.env.NEXUS_BROWSER_AGY_LABEL || process.env.BROWSER_AI_BRIDGE_AGY_LABEL || '').trim() || 'Antigravity CLI';
  return {
    id: TARGET_ID,
    targetClassId: 'local-origin',
    targetTypeId: TARGET_TYPE_ID,
    targetTypeName: 'Terminal Agent',
    providerId: 'local-antigravity-cli',
    providerName: 'Antigravity CLI',
    title: `${label} · Spawned Session`,
    detail: 'Bridge-owned persistent Antigravity process. This is a spawned fallback, not an attachment to an existing terminal.',
    transport: 'persistent-stream-json',
    sessionOrigin: 'spawned',
    sessionOriginName: 'Spawned Session',
    workspace: localWorkspace(),
    capabilities: { chat: true, captureLatest: false, activity: true, searchResults: false }
  };
}

function openVisibleConsole({
  platform = process.platform,
  env = process.env,
  spawnImpl = spawn
} = {}) {
  const visible = env.NEXUS_BROWSER_SPAWN_VISIBLE_CONSOLE ?? env.BROWSER_AI_BRIDGE_SPAWN_VISIBLE_CONSOLE ?? '1';
  if (platform !== 'win32' || String(visible) === '0') return false;
  const root = path.resolve(__dirname, '..');
  const consoleBat = path.join(root, 'CONSOLE.bat');
  try {
    const child = spawnImpl('cmd.exe', [
      '/d', '/s', '/c', `start "Nexus Browser · Spawned Session" "${consoleBat}"`
    ], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}

function parseStreamLine(line) {
  try { return JSON.parse(line); }
  catch { return null; }
}

function formatToolText(step) {
  const info = step.tool_info || {};
  const pieces = [];
  if (info.parameters && Object.keys(info.parameters).length) pieces.push(JSON.stringify(info.parameters, null, 2));
  if (info.output) pieces.push(String(info.output));
  if (info.error?.message) pieces.push(`Error: ${info.error.message}`);
  return pieces.join('\n\n').slice(0, 4000);
}

function createBroker({
  spawnImpl = spawn,
  resolveLaunch = resolveAntigravityLaunch,
  cwd = localWorkspace(),
  openConsoleImpl = openVisibleConsole
} = {}) {
  let child = null;
  let stdoutPending = '';
  let stderrTail = '';
  let current = null;
  let processClosing = false;
  let conversationId = null;
  let visibleConsoleOpened = false;
  const queue = [];

  function emitActivity(item, event) {
    item.activity.push(event);
    item.emit({
      type: 'activity_update',
      requestId: item.requestId,
      activity: { events: item.activity.slice() },
      final: false,
      targetClassId: 'local-origin',
      providerId: item.target.providerId,
      providerName: item.target.providerName
    });
  }

  function finishCurrent(result) {
    if (!current) return;
    const item = current;
    current = null;
    conversationId = result?.conversation_id || conversationId;
    const status = String(result?.status || '').toUpperCase();
    if (status === 'SUCCESS') {
      const text = String(result?.response ?? item.text);
      if (item.activity.length) {
        item.emit({
          type: 'activity_update',
          requestId: item.requestId,
          activity: { events: item.activity.slice() },
          final: true,
          targetClassId: 'local-origin',
          providerId: item.target.providerId,
          providerName: item.target.providerName
        });
      }
      item.emit({
        type: 'response_final',
        requestId: item.requestId,
        text,
        targetClassId: 'local-origin',
        providerId: item.target.providerId,
        providerName: item.target.providerName,
        conversationId
      });
      item.resolve(0);
    } else {
      item.emit({
        type: 'error',
        requestId: item.requestId,
        code: 'LOCAL_AGENT_ERROR',
        message: result?.error || `Antigravity ended the turn with status ${status || 'UNKNOWN'}.`,
        targetClassId: 'local-origin'
      });
      item.resolve(1);
    }
    if (!processClosing) pump();
  }

  function handleEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.event === 'init') {
      conversationId = event.conversation_id || event.init?.conversation_id || conversationId;
      return;
    }
    if (!current) return;
    if (event.event === 'step_update') {
      const step = event.step_update || {};
      conversationId = step.conversation_id || conversationId;
      if (step.step_type === 'agent_response' && step.text_delta) {
        current.text += String(step.text_delta);
        current.emit({
          type: 'response_partial',
          requestId: current.requestId,
          text: current.text,
          targetClassId: 'local-origin',
          providerId: current.target.providerId,
          providerName: current.target.providerName
        });
      } else if (step.step_type === 'tool' && step.state === 'DONE') {
        emitActivity(current, {
          type: 'tool',
          label: `Tool: ${step.tool_name || step.tool_info?.name || 'Antigravity tool'}`,
          text: formatToolText(step)
        });
      }
      return;
    }
    if (event.event === 'result') finishCurrent(event.result || {});
  }

  function failAll(message) {
    const items = current ? [current, ...queue.splice(0)] : queue.splice(0);
    current = null;
    for (const item of items) {
      item.emit({
        type: 'error',
        requestId: item.requestId,
        code: 'LOCAL_AGENT_EXITED',
        message,
        targetClassId: 'local-origin'
      });
      item.resolve(1);
    }
  }

  function attachProcess(proc) {
    stdoutPending = '';
    stderrTail = '';
    proc.stdout?.setEncoding?.('utf8');
    proc.stderr?.setEncoding?.('utf8');
    proc.stdout?.on('data', (chunk) => {
      stdoutPending += String(chunk);
      const lines = stdoutPending.split(/\r?\n/);
      stdoutPending = lines.pop() || '';
      for (const line of lines) {
        const event = parseStreamLine(line.trim());
        if (event) handleEvent(event);
      }
    });
    proc.stderr?.on('data', (chunk) => {
      stderrTail = `${stderrTail}${String(chunk)}`.slice(-4000);
    });
    proc.once('error', (error) => {
      if (proc !== child) return;
      child = null;
      conversationId = null;
      failAll(error.message || 'Antigravity process failed to start.');
    });
    proc.once('close', (code) => {
      if (proc !== child) return;
      processClosing = true;
      if (stdoutPending.trim()) {
        const event = parseStreamLine(stdoutPending.trim());
        if (event) handleEvent(event);
      }
      child = null;
      conversationId = null;
      const detail = stderrTail.trim();
      if (current || queue.length) {
        failAll(detail || `Antigravity process exited with code ${code ?? 1}.`);
      }
      processClosing = false;
    });
  }

  function ensureProcess() {
    if (child) return child;
    const launch = resolveLaunch();
    if (!launch) throw new Error('Antigravity CLI (agy) is not available on PATH.');
    const args = [...(launch.prefixArgs || []), '--input-format', 'stream-json', '--output-format', 'stream-json'];
    child = spawnImpl(launch.command, args, {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: !!launch.shell
    });
    attachProcess(child);
    if (spawnImpl === spawn && !visibleConsoleOpened) {
      visibleConsoleOpened = !!openConsoleImpl();
    }
    return child;
  }

  function pump() {
    if (current || !queue.length) return;
    let proc;
    try {
      proc = ensureProcess();
    } catch (error) {
      failAll(error.message);
      return;
    }
    current = queue.shift();
    const payload = JSON.stringify({ event: 'user', message: { content: current.textInput } }) + '\n';
    try {
      proc.stdin.write(payload, (error) => {
        if (!error) return;
        if (proc === child) {
          try { proc.kill(); } catch {}
        }
        failAll(error.message || 'Failed to write to Antigravity stdin.');
      });
    } catch (error) {
      try { proc.kill(); } catch {}
      failAll(error.message || 'Failed to write to Antigravity stdin.');
    }
  }

  function send({ requestId, text, target, emit }) {
    if (!requestId || !String(text || '').trim()) return Promise.reject(new Error('Local agent prompt is empty.'));
    if (!target) return Promise.reject(new Error('Antigravity target is unavailable.'));
    return new Promise((resolve) => {
      queue.push({ requestId, textInput: String(text), text: '', target, emit, activity: [], resolve });
      pump();
    });
  }

  function stop() {
    const proc = child;
    child = null;
    conversationId = null;
    if (current || queue.length) failAll('Antigravity broker stopped.');
    if (!proc) return;
    try { proc.stdin?.end?.(); } catch {}
    try { proc.kill?.(); } catch {}
  }

  return {
    send,
    stop,
    status: () => ({
      running: !!child,
      busy: !!current,
      queued: queue.length,
      pid: child?.pid || null,
      conversationId,
      sessionOrigin: 'spawned',
      visibleConsoleOpened
    })
  };
}

const defaultBroker = createBroker();

async function sendPrompt(args) {
  return defaultBroker.send(args);
}

function stop() {
  defaultBroker.stop();
}

function status() {
  return defaultBroker.status();
}

process.once('exit', stop);

module.exports = {
  TARGET_ID,
  TARGET_TYPE_ID,
  resolveAntigravityLaunch,
  localWorkspace,
  publicTarget,
  openVisibleConsole,
  parseStreamLine,
  formatToolText,
  createBroker,
  sendPrompt,
  stop,
  status
};
