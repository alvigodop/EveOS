// Large automatic recoveries must follow a room timeline that the audible
// source corroborates right now. A steady offset alone is not evidence: the
// Nov 15 physical runs never left 'room-clock', and a wrong room timeline can
// look just as steady as a displaced viewer.
import { createRoomLab, summarize } from './room-lab.js';
import { PROFILES } from './fake-youtube.js';

async function pair() {
  const lab = await createRoomLab();
  const t0 = lab.clock.now();
  const laptop = lab.addViewer('laptop', PROFILES.laptop);
  const tv = lab.addViewer('tv', PROFILES.fixedTv, {offsetSec: 1.2});
  await lab.run(40000);
  return {lab, t0, laptop, tv, at: s => t0 + s * 1000};
}
const arbiterOf = device => device.diagnostics()?.arbiter || {};
const source = device => device.ctx.watchFusionPlayout?.status?.()?.source ?? null;

export const TRUST_SCENARIOS = {
  async 'SYNC-19:a steady 45 s room offset the source contradicts never yanks a correct viewer'() {
    const r = await pair();
    // The audible source jumps back 45 s but the room anchor is not republished,
    // so the room clock is now wrong. The laptop follows the source and is right.
    r.lab.linkedMirror(false);
    r.lab.source.jump(-45); r.laptop.player.jump(-45);
    const seeks = r.laptop.player.stats.seeks;
    await r.lab.run(20000);
    const during = {source: source(r.laptop), seeks: r.laptop.player.stats.seeks - seeks,
      displaced: arbiterOf(r.laptop).displacedRejoins, reason: arbiterOf(r.laptop).reason, laptop: summarize(r.laptop, r.at(45), r.at(60))};
    // The source republishes: the room anchor moves to the truth as a transport change.
    r.lab.linkedMirror(true);
    await r.lab.run(30000);
    const after = {tv: summarize(r.tv, r.at(80), r.at(90)), laptop: summarize(r.laptop, r.at(80), r.at(90)), tvLoads: r.tv.player.stats.loads};
    r.lab.close();
    return {ok: during.source === 'off-phase' && during.seeks === 0 && during.displaced === 0 && during.laptop.p95AbsMs <= 200 &&
      after.tv.p95AbsMs <= 200 && after.laptop.p95AbsMs <= 200 && after.tvLoads === 0, detail: {during, after}};
  },
  async 'SYNC-20:a displaced viewer waits while the source is silent, then recovers once it is corroborated'() {
    const r = await pair();
    r.lab.linkedSource(false); await r.lab.run(2500); // evidence older than 1.7 s is stale
    r.laptop.player.jump(-45);
    const seeks = r.laptop.player.stats.seeks;
    await r.lab.run(20000);
    const during = {source: source(r.laptop), seeks: r.laptop.player.stats.seeks - seeks, displaced: arbiterOf(r.laptop).displacedRejoins};
    r.lab.linkedSource(true);
    await r.lab.run(20000);
    const laptop = summarize(r.laptop, r.at(78), r.at(82));
    const detail = {during, laptop, displaced: arbiterOf(r.laptop).displacedRejoins, seeks: r.laptop.player.stats.seeks - seeks};
    r.lab.close();
    return {ok: during.seeks === 0 && during.displaced === 0 && detail.displaced === 1 && detail.seeks <= 2 && laptop.p95AbsMs <= 200, detail};
  },
  async 'SYNC-21:a viewer displaced during a long source stall never adds its own displacement rejoin and stays bounded'() {
    const r = await pair();
    r.lab.source.stall(14000); await r.lab.run(2000); // the source reports buffering
    r.laptop.player.jump(-45);
    const seeks = r.laptop.player.stats.seeks;
    await r.lab.run(10000);
    const during = {seeks: r.laptop.player.stats.seeks - seeks, displaced: arbiterOf(r.laptop).displacedRejoins};
    await r.lab.run(30000);
    const laptop = summarize(r.laptop, r.at(78), r.at(82));
    const detail = {during, laptop, displaced: arbiterOf(r.laptop).displacedRejoins, seeks: r.laptop.player.stats.seeks - seeks, loads: r.laptop.player.stats.loads};
    r.lab.close();
    return {ok: during.displaced === 0 && detail.displaced === 0 && detail.seeks <= 3 && detail.loads === 0 && laptop.p95AbsMs <= 200, detail};
  }
};
