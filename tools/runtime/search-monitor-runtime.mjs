#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  SEARCH_MONITOR_SERVICES,
  clearRuntimeSession,
  configureHeadedServices,
  ensureControlPlane,
  ensureLocalModelRuntime,
  runtimeSession,
  runtimeSnapshot,
  serviceStatus,
  startService,
  stopService,
  waitForTloReady,
  writeRuntimeSession,
  writeSnapshot,
} from './search-monitor-runtime.shared.mjs';

const args = process.argv.slice(2);
const command = String(args[0] || 'help').toLowerCase();

function flag(name) {
  return args.includes(name);
}

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

const includeGemini = flag('--gemini');
const noModelWait = flag('--no-model-wait');
const modelTimeoutMs = positiveInt(option('--model-timeout-ms', ''), 10 * 60_000);

function stackNames() {
  return ['web', 'localMoe', 'nexusBrowser', ...(includeGemini ? ['gemini'] : [])];
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function serviceLine(name, status) {
  const service = SEARCH_MONITOR_SERVICES[name];
  const state = status?.state || 'unavailable';
  const running = status?.running === true ? 'RUNNING' : 'stopped';
  const owned = status?.owned === true ? 'owned' : status?.owned === false ? 'external/unowned' : '';
  const ports = [service.port, service.runtimePort, service.websocketPort].filter(Boolean).join('/');
  return `${service.label.padEnd(22)} ${running.padEnd(8)} ${state.padEnd(16)} ${String(ports).padEnd(12)} ${owned}`.trimEnd();
}

function printSnapshot(snapshot) {
  console.log('SEARCH_MONITOR_RUNTIME_STATUS');
  console.log(`HEAD ${snapshot.head || 'unknown'}`);
  console.log(`CONTROL ${snapshot.control?.service === 'eveos-control-plane' ? 'RUNNING' : 'offline'}`);
  for (const name of Object.keys(SEARCH_MONITOR_SERVICES)) {
    console.log(serviceLine(name, snapshot.services?.[name]?.status));
  }
  const tlo = snapshot.tlo || {};
  console.log(`TLO ${tlo.state || 'unavailable'} · canChat=${tlo.canChat === true} · model=${tlo.agent?.activeModelId || tlo.agent?.configuredModelId || '—'}`);
  const nexus = snapshot.services?.nexusBrowser?.status || {};
  console.log(`NEXUS extension=${nexus.extensionConnected ? 'connected' : nexus.extensionReady ? 'ready/offline' : 'missing'} · onlineTargets=${Number(nexus.onlineTargets || 0)} · localTargets=${Number(nexus.localTargets || 0)} · rooms=${Number(nexus.dexRooms || 0)}`);
}

async function saveAndPrint(label, extra = {}) {
  const snapshot = await runtimeSnapshot(extra);
  const artifact = writeSnapshot(snapshot, label);
  printSnapshot(snapshot);
  console.log(`SNAPSHOT ${artifact.json}`);
  return { snapshot, artifact };
}

async function startStack() {
  const wanted = stackNames();
  const session = runtimeSession();
  const startedServices = new Set(Array.isArray(session.startedServices) ? session.startedServices : []);
  const control = await ensureControlPlane();
  await configureHeadedServices(wanted);

  console.log(`SEARCH_MONITOR_RUNTIME_START control=${control.started ? 'started' : 'already-running'}`);
  for (const name of wanted) {
    const before = await serviceStatus(name);
    const wasRunning = before?.running === true;
    console.log(`START ${SEARCH_MONITOR_SERVICES[name].label}: ${before?.state || 'unknown'}`);
    try {
      const timeoutMs = name === 'localMoe' ? modelTimeoutMs : 30_000;
      const result = await startService(name, timeoutMs);
      if (result.started) startedServices.add(name);
      writeRuntimeSession({
        schema: 'eveos.search-monitor-runtime-session',
        schemaVersion: 1,
        head: (await runtimeSnapshot()).head,
        startedAt: session.startedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedServices: [...startedServices],
        includeGemini,
      });
      console.log(`READY ${SEARCH_MONITOR_SERVICES[name].label}: ${result.status?.state || 'running'}`);
    } catch (error) {
      const after = await serviceStatus(name);
      if (!wasRunning && (after?.running === true || after?.state === 'starting')) {
        startedServices.add(name);
        writeRuntimeSession({
          schema: 'eveos.search-monitor-runtime-session',
          schemaVersion: 1,
          head: (await runtimeSnapshot()).head,
          startedAt: session.startedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startedServices: [...startedServices],
          includeGemini,
          lastStartFailure: { service: name, message: String(error?.message || error) },
        });
      }
      throw error;
    }
  }

  let tlo = null;
  if (!noModelWait) {
    console.log('START Local MoE model runtime stage');
    await ensureLocalModelRuntime(Math.min(modelTimeoutMs, 120_000));
    console.log(`WAITING for real TLO/Local MoE model readiness (timeout ${Math.round(modelTimeoutMs / 1000)}s)...`);
    tlo = await waitForTloReady(modelTimeoutMs);
    console.log(`READY TLO: ${tlo.agent?.activeModelId || 'active model'}`);
  } else {
    console.log('MODEL WAIT skipped (--no-model-wait). Services remain running.');
  }

  const { artifact } = await saveAndPrint('search-monitor-runtime-start', { start: { wanted, tlo } });
  console.log('LEAVE_RUNNING true');
  console.log('Stop session-owned services with: npm run runtime:search-monitor:stop');
  console.log('Restart them with: npm run runtime:search-monitor:restart');
  console.log(`LAST_RUNTIME_SNAPSHOT ${artifact.last}`);
}

async function stopStack({ all = false } = {}) {
  await ensureControlPlane();
  const session = runtimeSession();
  const targets = all
    ? ['gemini', 'nexusBrowser', 'localMoe', 'web']
    : [...new Set(Array.isArray(session.startedServices) ? session.startedServices : [])].reverse();

  if (!targets.length) {
    console.log('SEARCH_MONITOR_RUNTIME_STOP no session-owned services recorded; nothing stopped.');
    console.log('Use --all only if you explicitly want every Search Monitor runtime stopped.');
    await saveAndPrint('search-monitor-runtime-stop');
    return;
  }

  await configureHeadedServices(['web', 'localMoe', 'nexusBrowser', 'gemini']);
  console.log(`SEARCH_MONITOR_RUNTIME_STOP mode=${all ? 'all' : 'session-owned'}`);
  const remaining = new Set(Array.isArray(session.startedServices) ? session.startedServices : []);
  for (const name of targets) {
    if (!SEARCH_MONITOR_SERVICES[name]) continue;
    console.log(`STOP ${SEARCH_MONITOR_SERVICES[name].label}`);
    try {
      const result = await stopService(name);
      remaining.delete(name);
      console.log(`STOPPED ${SEARCH_MONITOR_SERVICES[name].label}: ${result.status?.state || 'stopped'}`);
    } catch (error) {
      console.error(`STOP FAILED ${SEARCH_MONITOR_SERVICES[name].label}: ${error?.message || error}`);
      throw error;
    }
  }

  if (remaining.size) {
    writeRuntimeSession({ ...session, updatedAt: new Date().toISOString(), startedServices: [...remaining] });
  } else {
    clearRuntimeSession();
  }
  await saveAndPrint('search-monitor-runtime-stop', { stop: { all, targets } });
  console.log('Local Control intentionally remains online as the lifecycle coordinator.');
}

async function extensionReload() {
  await ensureControlPlane();
  const status = await serviceStatus('nexusBrowser');
  if (status?.running !== true) {
    throw new Error('Nexus Browser must be running before extension reload qualification.');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['--prefix', path.join(ROOT, 'tools', 'Nexus-Browser'), 'run', 'extension:reload'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    windowsHide: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Nexus Browser extension reload failed (${result.status ?? 'spawn error'}).`);
  }
  await saveAndPrint('search-monitor-runtime-extension-reload');
}

function runLiveQualificationStage(label, script, env) {
  console.log(`LIVE_STAGE ${label} START ${script}`);
  const result = spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env,
    windowsHide: false,
  });
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  const spawnError = result.error ? String(result.error.message || result.error) : '';
  if (exitCode === 0 && !spawnError) console.log(`LIVE_STAGE ${label} PASS`);
  return { label, script, exitCode, spawnError, signal: result.signal || null };
}

async function qualify() {
  await startStack();
  console.log('SEARCH_MONITOR_LIVE_QUALIFICATION starting; services will remain running afterward.');
  const env = {
    ...process.env,
    EVEOS_LIVE_MODEL_TIMEOUT_MS: String(modelTimeoutMs),
    EVEOS_RUNTIME_INCLUDE_GEMINI: includeGemini ? '1' : '0',
  };
  const stages = [
    ['runtime-generation', 'tools/smoke/search_monitor_live_runtime_smoke.mjs'],
    ['localhost-browser', 'tools/smoke/search_monitor_live_browser_smoke.js'],
  ];
  const stageResults = [];
  for (const [label, script] of stages) {
    const result = runLiveQualificationStage(label, script, env);
    stageResults.push(result);
    if (result.exitCode !== 0 || result.spawnError) {
      await saveAndPrint('search-monitor-runtime-qualification', {
        qualification: {
          ok: false,
          failedStage: label,
          includeGemini,
          servicesLeftRunning: true,
          stages: stageResults,
        },
      });
      const detail = result.spawnError || `exit code ${result.exitCode}${result.signal ? ` / signal ${result.signal}` : ''}`;
      throw new Error(`Live Search Monitor ${label} stage failed: ${detail}. Services were intentionally left running.`);
    }
  }
  await saveAndPrint('search-monitor-runtime-qualification', {
    qualification: {
      ok: true,
      includeGemini,
      servicesLeftRunning: true,
      stages: stageResults,
    },
  });
  console.log('SEARCH_MONITOR_RUNTIME_QUALIFIED');
  console.log('LEAVE_RUNNING true');
}

function printHelp() {
  console.log(`Search Monitor runtime session

Commands:
  plan                 Show the real runtime stack without starting anything.
  start [--gemini]     Start headed detached runtime terminals and leave them running.
  status               Inspect verified runtime identities/readiness without starting services.
  stop                 Stop only services recorded as started by this runtime session.
  stop --all           Explicitly stop all Search Monitor runtime services (Local Control stays up).
  restart [--gemini]   Stop session-owned services, then start the requested stack again.
  qualify [--gemini]   Start stack, run real model + browser live smokes, leave services running.
  extension-reload     Run Nexus Browser's existing extension reload qualification.

Options:
  --no-model-wait
  --model-timeout-ms <ms>
  --gemini
`);
}

async function main() {
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === 'plan') {
    console.log('SEARCH_MONITOR_RUNTIME_PLAN');
    console.log(`SERVICES ${stackNames().join(' -> ')}`);
    console.log('MODEL_CHECK TLO via real EveOS localhost adapter');
    console.log('TEARDOWN none (explicit stop/restart only)');
    return;
  }
  if (command === 'status') {
    await saveAndPrint('search-monitor-runtime-status');
    return;
  }
  if (command === 'start') {
    await startStack();
    return;
  }
  if (command === 'stop') {
    await stopStack({ all: flag('--all') });
    return;
  }
  if (command === 'restart') {
    await stopStack({ all: false });
    await startStack();
    return;
  }
  if (command === 'qualify') {
    await qualify();
    return;
  }
  if (command === 'extension-reload') {
    await extensionReload();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch(async (error) => {
  console.error(`SEARCH_MONITOR_RUNTIME_FAILED: ${error?.stack || error?.message || error}`);
  try {
    const snapshot = await runtimeSnapshot({ failure: { command, message: String(error?.message || error) } });
    const artifact = writeSnapshot(snapshot, 'search-monitor-runtime-failure');
    console.error(`[RUNTIME_DIAGNOSTIC] ${artifact.json}`);
  } catch (_) {}
  process.exitCode = 1;
});
