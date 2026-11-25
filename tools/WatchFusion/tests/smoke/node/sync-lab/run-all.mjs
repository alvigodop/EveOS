// Verbose lab runner: node tests/smoke/node/sync-lab/run-all.mjs [SYNC-xx]
import { SCENARIOS, assertUniqueScenarioIds } from './scenarios.js';
assertUniqueScenarioIds();
const only = process.argv[2];
const selected = Object.entries(SCENARIOS).filter(([name]) => !only || name.split(':')[0] === only);
if (!selected.length) { console.error(`Unknown synchronization scenario: ${only}`); process.exitCode = 1; }
for (const [name, fn] of selected) {
  const started = Date.now();
  try {
    const r = await fn();
    if (!r.ok) process.exitCode = 1;
    console.log(r.ok ? 'PASS' : 'FAIL', name, (Date.now()-started)+'ms', JSON.stringify(r.detail).slice(0, 600));
  } catch (e) {
    process.exitCode = 1;
    console.log('ERROR', name, e.stack.split('\n').slice(0,4).join(' | '));
  }
}
