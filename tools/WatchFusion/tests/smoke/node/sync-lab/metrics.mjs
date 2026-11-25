// Before/after metrics for every sync-lab scenario (not a smoke lane):
//   node tests/smoke/node/sync-lab/metrics.mjs > metrics.json
// For every TV device: p95/max |error| after a 30 s warm-up, plus whole-run
// seeks, network seeks, buffering interruptions, frozen time and reloads.
import { SCENARIOS, assertUniqueScenarioIds } from './scenarios.js';
assertUniqueScenarioIds();
const out = {};
for (const [name, fn] of Object.entries(SCENARIOS)) {
  globalThis.__watchFusionSyncLabs = [];
  let ok = null, error = null;
  try { ok = (await fn()).ok; } catch (e) { error = String(e.message || e).slice(0, 160); }
  if (!ok) process.exitCode = 1;
  const tvs = [];
  for (const lab of globalThis.__watchFusionSyncLabs) {
    for (const device of lab.devices.filter(d => d.name === 'tv')) {
      const s = device.samples;
      if (!s.length) continue;
      const t0 = s[0].at, settled = s.filter(x => x.at >= t0 + 30000);
      const abs = (settled.length ? settled : s).map(x => Math.abs(x.errorMs)).sort((a, b) => a - b);
      let interruptions = 0;
      for (let i = 1; i < s.length; i++) if (s[i].state === 3 && s[i - 1].state !== 3) interruptions++;
      const st = device.player.stats;
      tvs.push({p95Ms: abs[Math.min(abs.length - 1, Math.floor(abs.length * .95))], maxMs: abs.at(-1),
        within200Pct: Math.round(abs.filter(v => v <= 200).length / abs.length * 100),
        seeks: st.seeks, networkSeeks: st.networkSeeks, bufferingInterruptions: interruptions,
        bufferingMs: Math.round(st.bufferingMs), frozenMs: Math.round(st.frozenMs), reloads: st.loads,
        rateRequests: st.rateRequests.length});
    }
  }
  out[name.split(':')[0]] = {ok, error, title: name.split(':')[1], tv: tvs};
}
console.log(JSON.stringify(out, null, 1));
