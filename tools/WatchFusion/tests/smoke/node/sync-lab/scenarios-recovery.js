// Real-trace regressions (Nov 15, 2026 physical TV + laptop runs): natural
// starts where YouTube reported PLAYING while the timeline stayed frozen, so the
// startup gate warmed forever and both viewers fell ~1 s/s behind the room.
import { createRoomLab, summarize } from './room-lab.js';
import { PROFILES } from './fake-youtube.js';

async function pair() {
  const lab = await createRoomLab();
  const t0 = lab.clock.now();
  const laptop = lab.addViewer('laptop', PROFILES.laptop);
  const tv = lab.addViewer('tv', PROFILES.fixedTv, {offsetSec: 1.2});
  return {lab, t0, laptop, tv, at: s => t0 + s * 1000};
}
const arbiterOf = device => device.diagnostics()?.arbiter || {};
const settled = (device, from, to, p95 = 200) => { const s = summarize(device, from, to); return {ok: s.p95AbsMs <= p95, summary: s}; };

export const RECOVERY_SCENARIOS = {
  async 'SYNC-13:trace 3 replay, pause + backward scrub + play leaves both viewers PLAYING but frozen'() {
    const r = await pair();
    await r.lab.run(40000);
    r.lab.pause(); await r.lab.run(3000);
    r.lab.hostSeek(r.lab.source.truePosition() - 9.3); await r.lab.run(2000);
    r.lab.resume(); await r.lab.run(300);
    r.tv.player.wedge('pause'); r.laptop.player.wedge('pause');
    await r.lab.run(60000);
    const tv = settled(r.tv, r.at(80), r.at(105)), laptop = settled(r.laptop, r.at(80), r.at(105));
    const detail = {tv: tv.summary, laptop: laptop.summary, tvLoads: r.tv.player.stats.loads, tvStall: arbiterOf(r.tv).stallSteps, laptopStall: arbiterOf(r.laptop).stallSteps};
    r.lab.close();
    return {ok: tv.ok && laptop.ok && detail.tvLoads === 0, detail};
  },
  async 'SYNC-14:a frozen TV that only a seek revives recovers through one rejoin'() {
    const r = await pair();
    await r.lab.run(40000);
    const seeks = r.tv.player.stats.seeks;
    r.tv.player.wedge('seek');
    await r.lab.run(45000);
    const tv = settled(r.tv, r.at(65), r.at(85));
    const detail = {tv: tv.summary, seeks: r.tv.player.stats.seeks - seeks, stall: arbiterOf(r.tv).stallSteps, loads: r.tv.player.stats.loads};
    r.lab.close();
    return {ok: tv.ok && detail.seeks <= 3 && detail.loads === 0, detail};
  },
  async 'SYNC-15:a permanently frozen player gets a bounded ladder, never a loop'() {
    const r = await pair();
    await r.lab.run(40000);
    const seeks = r.tv.player.stats.seeks;
    r.tv.player.wedge('never');
    await r.lab.run(30000);
    const mid = r.tv.player.stats.seeks;
    await r.lab.run(60000);
    const detail = {seeks: r.tv.player.stats.seeks - seeks, lateSeeks: r.tv.player.stats.seeks - mid, stall: arbiterOf(r.tv).stallSteps,
      reason: r.tv.diagnostics()?.action, loads: r.tv.player.stats.loads, laptop: settled(r.laptop, r.at(100), r.at(130)).summary};
    r.lab.close();
    return {ok: detail.stall === 3 && detail.seeks <= 2 && detail.lateSeeks === 0 && detail.loads === 0 && detail.laptop.p95AbsMs <= 200, detail};
  },
  async 'SYNC-16:a 40 s freeze that ignores pause and seek still ends in a recovered lock'() {
    const r = await pair();
    await r.lab.run(40000);
    r.tv.player.wedge('never', 40000);
    await r.lab.run(70000);
    const tv = settled(r.tv, r.at(90), r.at(110));
    const a = arbiterOf(r.tv);
    const detail = {tv: tv.summary, stall: a.stallSteps, displaced: a.displacedRejoins, rejoins: a.rejoins, loads: r.tv.player.stats.loads};
    r.lab.close();
    return {ok: tv.ok && detail.loads === 0, detail};
  },
  async 'SYNC-18:a second 45 s timeline jump in one segment (reclaim spent) is recovered once, not left forever'() {
    const r = await pair();
    await r.lab.run(40000);
    r.laptop.player.jump(-45); await r.lab.run(20000);
    r.laptop.player.jump(-45); await r.lab.run(30000);
    const laptop = settled(r.laptop, r.at(75), r.at(90));
    const detail = {laptop: laptop.summary, displaced: arbiterOf(r.laptop).displacedRejoins, seeks: r.laptop.player.stats.seeks, loads: r.laptop.player.stats.loads};
    r.lab.close();
    return {ok: laptop.ok && detail.displaced === 1 && detail.loads === 0 && detail.seeks <= 4, detail};
  },
  async 'SYNC-17:once locked, three minutes of ordinary playback need no correction'() {
    const r = await pair();
    await r.lab.run(60000);
    const before = arbiterOf(r.tv).corrections, beforeLaptop = arbiterOf(r.laptop).corrections;
    await r.lab.run(180000);
    const tv = settled(r.tv, r.at(60), r.at(240)), laptop = settled(r.laptop, r.at(60), r.at(240));
    const detail = {tv: tv.summary, laptop: laptop.summary, tvExtra: arbiterOf(r.tv).corrections - before, laptopExtra: arbiterOf(r.laptop).corrections - beforeLaptop};
    r.lab.close();
    return {ok: tv.ok && laptop.ok && detail.tvExtra === 0 && detail.laptopExtra === 0, detail};
  }
};
