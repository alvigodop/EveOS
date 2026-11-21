import { runSyncLabChecks } from '../WatchFusion/tests/smoke/node/sync-lab/scenarios.js';

let pass = 0;
const failed = [];
await runSyncLabChecks(async (name, run) => {
  try {
    await run();
    pass++;
  } catch (error) {
    failed.push(name);
    console.error(`[FAIL] ${name}\n${String(error.stack || error).split('\n').slice(0, 8).join('\n')}`);
  }
});
console.log(`WATCHFUSION SYNC LAB PASS ${pass} | FAIL ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
