// Verbose lab runner (not part of the summarized smoke lanes): node tests/smoke/node/sync-lab/run-all.mjs [SYNC-xx]
import { SCENARIOS } from './scenarios.js';
const only = process.argv[2];
for (const [name, fn] of Object.entries(SCENARIOS)) {
  if (only && !name.startsWith(only)) continue;
  const started = Date.now();
  try { const r = await fn(); console.log(r.ok ? 'PASS' : 'FAIL', name, (Date.now()-started)+'ms', JSON.stringify(r.detail).slice(0, 600)); }
  catch (e) { console.log('ERROR', name, e.stack.split('\n').slice(0,4).join(' | ')); }
}
