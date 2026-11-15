// WatchFusion v13 synchronization qualification: real viewer controller +
// real server coordinator + physically plausible players, in virtual time.
import { createRoomLab, summarize } from './room-lab.js';
import { PROFILES } from './fake-youtube.js';

const correctionsOf = device => device.diagnostics()?.arbiter?.corrections ?? device.player.stats.seeks;

async function trio(tvProfile, {tvOffset = 1.2, tvOptions = {}, lab: labOptions = {}} = {}) {
  const lab = await createRoomLab(labOptions);
  const t0 = lab.clock.now();
  const laptop = lab.addViewer('laptop', PROFILES.laptop);
  const phone = lab.addViewer('phone', PROFILES.phone, {offsetSec: .05});
  const tv = lab.addViewer('tv', {...tvProfile, ...tvOptions}, {offsetSec: tvOffset, ...(tvOptions.viewer || {})});
  return {lab, t0, laptop, phone, tv, at: s => t0 + s * 1000};
}

function settled(device, from, to, {p95 = 200, frozen = 0} = {}) {
  const summary = summarize(device, from, to);
  return {ok: summary.p95AbsMs <= p95 && summary.frozenMs <= frozen, summary};
}

// Each scenario returns {ok, detail}; the runner owns pass/fail reporting.
export const SCENARIOS = {
  async 'SYNC-01:three devices, fixed-rate TV starts 1.2 s behind'() {
    const r = await trio(PROFILES.fixedTv);
    await r.lab.run(120000);
    const tv = settled(r.tv, r.at(45), r.at(120)), laptop = settled(r.laptop, r.at(45), r.at(120)), phone = settled(r.phone, r.at(45), r.at(120));
    const detail = {tv: tv.summary, laptop: laptop.summary, phone: phone.summary, tvSeeks: r.tv.player.stats.seeks,
      networkSeeks: r.tv.player.stats.networkSeeks, loads: r.tv.player.stats.loads};
    r.lab.close();
    return {ok: tv.ok && laptop.ok && phone.ok && detail.loads === 0 && detail.networkSeeks === 0 && detail.tvSeeks <= 4, detail};
  },
  async 'SYNC-02:variable-rate TV converges by speed without seeking'() {
    const r = await trio(PROFILES.variableTv);
    await r.lab.run(90000);
    const tv = settled(r.tv, r.at(30), r.at(90));
    const detail = {tv: tv.summary, seeks: r.tv.player.stats.seeks, rateRequests: r.tv.player.stats.rateRequests.length};
    r.lab.close();
    return {ok: tv.ok && detail.seeks === 0 && detail.rateRequests >= 2, detail};
  },
  async 'SYNC-03:TV that advertises speeds but decodes at 1x falls back to scheduled rejoin'() {
    const r = await trio(PROFILES.lyingTv);
    await r.lab.run(120000);
    const tv = settled(r.tv, r.at(60), r.at(120));
    const model = r.tv.diagnostics().arbiter.model;
    r.lab.close();
    return {ok: tv.ok && model.rateHonored === false, detail: {tv: tv.summary, model}};
  },
  async 'SYNC-04:PLAYING without timeline progress is never treated as evidence'() {
    const r = await trio(PROFILES.fixedTv, {tvOptions: {stuckStartMs: 6000}});
    let earlyCorrections = 0;
    await r.lab.run(6000, 250, () => { earlyCorrections = correctionsOf(r.tv); });
    await r.lab.run(84000);
    const tv = settled(r.tv, r.at(50), r.at(90));
    r.lab.close();
    return {ok: earlyCorrections === 0 && tv.ok, detail: {earlyCorrections, tv: tv.summary}};
  },
  async 'SYNC-05:TV buffering during catch-up recovers without a seek loop'() {
    const r = await trio(PROFILES.fixedTv);
    // Stall the TV right when its first rejoin lands, then again after release.
    await r.lab.run(4600); r.tv.player.stall(2500);
    await r.lab.run(9000); r.tv.player.stall(1800);
    await r.lab.run(106400);
    const tv = settled(r.tv, r.at(70), r.at(120));
    const detail = {tv: tv.summary, seeks: r.tv.player.stats.seeks, loads: r.tv.player.stats.loads};
    r.lab.close();
    return {ok: tv.ok && detail.seeks <= 6 && detail.loads === 0, detail};
  },
  async 'SYNC-06:reference promotion and demotion never make a locked TV look late'() {
    const r = await trio(PROFILES.fixedTv);
    await r.lab.run(60000);
    const before = correctionsOf(r.tv);
    r.lab.linkedSource(false);           // linked source vanishes -> peer cohort
    await r.lab.run(25000);
    r.lab.linkedSource(true);            // source reference returns
    await r.lab.run(35000);
    const after = correctionsOf(r.tv);
    const tv = settled(r.tv, r.at(60), r.at(120));
    r.lab.close();
    return {ok: after - before === 0 && tv.ok, detail: {extraCorrections: after - before, tv: tv.summary}};
  },
  async 'SYNC-07:pause, resume, host seek and local scrub all re-align'() {
    const r = await trio(PROFILES.fixedTv);
    await r.lab.run(45000);
    r.lab.pause(); await r.lab.run(6000);
    r.lab.resume(); await r.lab.run(35000);
    const resumed = settled(r.tv, r.at(75), r.at(86), {frozen: 0});
    r.lab.hostSeek(400); await r.lab.run(40000);
    const sought = settled(r.tv, r.at(110), r.at(126));
    r.tv.scrub(r.tv.player.truePosition() + 60); await r.lab.run(45000);
    const scrubbed = settled(r.tv, r.at(155), r.at(171));
    const detail = {resumed: resumed.summary, sought: sought.summary, scrubbed: scrubbed.summary, loads: r.tv.player.stats.loads};
    r.lab.close();
    return {ok: resumed.ok && sought.ok && scrubbed.ok && detail.loads === 0, detail};
  },
  async 'SYNC-08:hostile player whose corrections worsen alignment is bounded'() {
    const hostile = {...PROFILES.fixedTv, seekJitterMs: 2500, startJitterMs: 1200};
    const r = await trio(hostile);
    await r.lab.run(300000);
    const corrections = correctionsOf(r.tv), stats = r.tv.player.stats;
    const late = r.tv.samples.filter(s => s.at > r.at(150));
    const lateCorrections = stats.landings.length;
    r.lab.close();
    // At most one correction every ~20 s on average, no reloads, no network chase.
    return {ok: corrections <= 15 && stats.loads === 0 && stats.networkSeeks === 0, detail: {corrections, lateCorrections, seeks: stats.seeks, samples: late.length}};
  },
  async 'SYNC-09:a successful correction stays stable for five minutes'() {
    const r = await trio(PROFILES.fixedTv);
    await r.lab.run(45000);
    const locked = correctionsOf(r.tv);
    await r.lab.run(300000);
    const tv = settled(r.tv, r.at(45), r.at(345));
    const extra = correctionsOf(r.tv) - locked;
    r.lab.close();
    return {ok: tv.ok && extra === 0, detail: {extra, tv: tv.summary}};
  },
  async 'SYNC-10:long playback with source hiccups has no oscillation or reload loop'() {
    const hiccups = Array.from({length: 12}, (_, i) => ({at: 0, ms: 350 + (i % 3) * 150, offset: 40000 + i * 45000}));
    const r = await trio(PROFILES.variableTv, {lab: {sourceHiccups: []}});
    for (const h of hiccups) {
      const wait = r.t0 + h.offset - r.lab.clock.now();
      if (wait > 0) await r.lab.run(wait);
      r.lab.source.stall(h.ms);
    }
    await r.lab.run(Math.max(0, r.at(600) - r.lab.clock.now()));
    const summaries = r.lab.devices.map(d => ({name: d.name, ...summarize(d, r.at(60), r.at(600)), seeks: d.player.stats.seeks,
      loads: d.player.stats.loads, corrections: correctionsOf(d)}));
    r.lab.close();
    // Each stall of the audible source is unknowable until it is observed; between
    // stalls every device must return inside 200 ms without a seek or a freeze.
    const ok = summaries.every(s => s.loads === 0 && s.seeks === 0 && s.frozenMs === 0 && s.within200 >= 85 && s.p95AbsMs <= 700 && s.corrections <= 16);
    return {ok, detail: summaries};
  },
  async 'SYNC-11:a learned device model makes the next session converge with one rejoin'() {
    const store = new Map();
    let r = await trio(PROFILES.fixedTv, {tvOptions: {viewer: {store}}});
    await r.lab.run(60000); r.lab.close();
    r = await trio(PROFILES.fixedTv, {tvOptions: {viewer: {store}}});
    await r.lab.run(60000);
    const tv = settled(r.tv, r.at(25), r.at(60));
    const corrections = correctionsOf(r.tv);
    r.lab.close();
    return {ok: tv.ok && corrections <= 1, detail: {corrections, tv: tv.summary}};
  },
  async 'SYNC-12:Sync me on a keyframe TV is one landing-aware rejoin'() {
    const r = await trio(PROFILES.fixedTv);
    await r.lab.run(45000);
    r.tv.player.seekTo(r.tv.player.truePosition() - .9, false); // knock it out of sync
    await r.lab.run(3000);
    const seeks = r.tv.player.stats.seeks;
    r.tv.syncMe();
    await r.lab.run(20000);
    const tv = settled(r.tv, r.at(58), r.at(68));
    r.lab.close();
    return {ok: tv.ok && r.tv.player.stats.seeks - seeks <= 2, detail: {tv: tv.summary, seeks: r.tv.player.stats.seeks - seeks}};
  }
};

export async function runSyncLabChecks(check) {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    await check(name, async () => {
      const result = await scenario();
      if (!result.ok) throw new Error(JSON.stringify(result.detail).slice(0, 1500));
    });
  }
}
