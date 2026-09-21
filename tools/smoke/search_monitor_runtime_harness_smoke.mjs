#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, SEARCH_MONITOR_SERVICES } from '../runtime/search-monitor-runtime.shared.mjs';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const profileSource = fs.readFileSync(path.join(ROOT, 'tools', 'smoke', 'eveos_profile_runner.mjs'), 'utf8');
const controlSource = fs.readFileSync(path.join(ROOT, 'server_modules', 'eveos_control_helper.py'), 'utf8');
const cli = path.join(ROOT, 'tools', 'runtime', 'search-monitor-runtime.mjs');
const runtimeCliSource = fs.readFileSync(cli, 'utf8');
const sessionPath = path.join(ROOT, 'data', 'runtime', 'search-monitor-runtime-session.json');
const sessionBefore = fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8') : null;

const requiredServices = ['web', 'localMoe', 'nexusBrowser', 'gemini'];
for (const name of requiredServices) {
  requireCondition(!!SEARCH_MONITOR_SERVICES[name], `runtime harness is missing service definition: ${name}`);
  requireCondition(/^\/api\//.test(SEARCH_MONITOR_SERVICES[name].statusPath), `${name} status path is not control-plane backed`);
  requireCondition(/^\/api\//.test(SEARCH_MONITOR_SERVICES[name].startPath), `${name} start path is not control-plane backed`);
  requireCondition(/^\/api\//.test(SEARCH_MONITOR_SERVICES[name].stopPath), `${name} stop path is not control-plane backed`);
}

requireCondition(
  SEARCH_MONITOR_SERVICES.web.stopPath.includes('/api/eveos-server/stop-web'),
  'Search Monitor stop would use Global Stop instead of scoped web shutdown'
);
requireCondition(
  runtimeCliSource.includes('ensureLocalModelRuntime'),
  'live runtime sequence no longer explicitly starts the Local MoE model stage'
);
requireCondition(
  runtimeCliSource.indexOf('ensureLocalModelRuntime') < runtimeCliSource.indexOf('waitForTloReady(modelTimeoutMs)'),
  'TLO readiness wait can run before the explicit Local MoE model start stage'
);
requireCondition(controlSource.includes('"/api/eveos-server/stop-web"'), 'control plane is missing scoped EveOS web stop');
requireCondition(
  controlSource.includes('eveos_web_control.stop_server(port=_request_web_port(self))'),
  'scoped web stop does not delegate to verified EveOS web lifecycle control'
);

const scripts = packageJson.scripts || {};
for (const script of [
  'runtime:search-monitor:start',
  'runtime:search-monitor:status',
  'runtime:search-monitor:stop',
  'runtime:search-monitor:restart',
  'runtime:search-monitor:qualify',
  'runtime:search-monitor:extension-reload',
  'smoke:search-monitor-runtime-harness',
  'smoke:search-monitor-live'
]) {
  requireCondition(typeof scripts[script] === 'string' && scripts[script], `package script missing: ${script}`);
}

requireCondition(
  !String(scripts.verify || '').includes('smoke:search-monitor-live'),
  'live GPU/runtime qualification must never run from the normal verify gate'
);
requireCondition(
  !profileSource.includes("'smoke:search-monitor-live'"),
  'live GPU/runtime qualification leaked into deterministic profile runner'
);
requireCondition(
  String(scripts['smoke:search-monitor-live']).includes('search_monitor_live_runtime_smoke.mjs')
    && String(scripts['smoke:search-monitor-live']).includes('search_monitor_live_browser_smoke.js'),
  'live Search Monitor gate does not include both runtime generation and real-browser checks'
);

const plan = spawnSync(process.execPath, [cli, 'plan'], {
  cwd: ROOT,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000
});
const output = [plan.stdout, plan.stderr].filter(Boolean).join('\n');
requireCondition(plan.status === 0, `runtime plan failed: ${output || plan.error?.message || 'unknown error'}`);
requireCondition(output.includes('SEARCH_MONITOR_RUNTIME_PLAN'), 'runtime plan marker missing');
requireCondition(output.includes('web -> localMoe -> nexusBrowser'), 'default runtime plan lost the core Search Monitor stack');
requireCondition(output.includes('TEARDOWN none'), 'runtime plan no longer promises explicit-only teardown');

const sessionAfter = fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8') : null;
requireCondition(sessionAfter === sessionBefore, 'runtime plan mutated the persistent runtime session');

for (const relative of [
  'tools/smoke/search_monitor_live_runtime_smoke.mjs',
  'tools/smoke/search_monitor_live_browser_smoke.js',
  'tools/runtime/search-monitor-runtime.shared.mjs',
  'tools/runtime/search-monitor-runtime.mjs'
]) {
  requireCondition(fs.existsSync(path.join(ROOT, relative)), `runtime qualification file missing: ${relative}`);
}

console.log('SEARCH_MONITOR_RUNTIME_HARNESS_SMOKE_OK');
