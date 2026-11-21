/* SYNC-25: four successive linked-source songs with all three room viewers.
 * This is the same real coordinator, IFrame arbiter and virtual decoder used by
 * the other sync labs. Track replacements are explicit transports, not seeks.
 */
import {createRoomLab, summarize} from './room-lab.js';
import {PROFILES} from './fake-youtube.js';

export const MULTISONG_SCENARIOS = {
  async 'SYNC-32:two linked tracks keep a tight lock and bound TV catch-up after a buffered transition'() {
    const lab = await createRoomLab({seed:32, sourceNoiseMs:0, fineTrim:true});
    const saved = () => new Map([['watchfusion.viewerSyncModel.v1', JSON.stringify({rateHonored:false, rateRejections:2})]]);
    const host = lab.addViewer('host', PROFILES.laptop, {offsetSec:.059, store:saved()});
    const tv = lab.addViewer('tv', {...PROFILES.variableTv, quantumMs:0}, {offsetSec:.012, store:saved()});
    const setHostRate = host.player.setPlaybackRate;
    let pendingRate;
    host.player.setPlaybackRate = rate => {
      lab.clock.clearTimeout(pendingRate);
      if (rate === 1) setHostRate(rate);
      else pendingRate = lab.clock.setTimeout(() => setHostRate(rate), 100);
    };
    const players = [host,tv];
    const measure = () => {
      const end=lab.clock.now();
      const positions=players.map(d=>d.samples.filter(s=>s.at>=end-5000 && s.at<=end));
      const gaps=positions[0].map((s,i)=>Math.abs(s.errorMs-positions[1][i].errorMs));
      return {maxGapMs:Math.max(...gaps), players:players.map(d=>({
        ...summarize(d,end-5000,end), seeks:d.player.stats.seeks, loads:d.player.stats.loads,
        roomRate:d.player.getPlaybackRate(), phase:d.diagnostics().startup.transitionPhase
      }))};
    };
    try {
      await lab.run(20000);
      const first=measure(), firstRateProof=host.ctx.WatchFusionZeroConverge.diagnostics().hostRateRecheck.measuredImprovement;
      const priorRateRequests = tv.player.stats.rateRequests.length;
      lab.nextTrack('WF-Song-002');
      tv.player.stall(850);
      await lab.run(3000);
      const startupGapMs = Math.abs(host.errorMs() - tv.errorMs());
      await lab.run(22000);
      const second=measure();
      await lab.run(12000);
      const settled=measure();
      const tvUsedRate = tv.player.stats.rateRequests.slice(priorRateRequests).some(rate=>rate>1);
      const ok=firstRateProof && first.maxGapMs<=25 && first.players.every(p=>p.p95AbsMs<=25 && p.seeks===0 && p.loads===0) &&
        startupGapMs>=400 && tvUsedRate && second.maxGapMs<=50 && settled.maxGapMs<=50 &&
        second.players.every(p=>p.seeks===0) && settled.players.every(p=>
        p.samples>=20 && p.frozenMs===0 && p.p95AbsMs<=50 && p.phase==='decoder-confirmed' &&
        p.seeks===0 && p.loads===1 && p.roomRate===1);
      return {ok,detail:{firstRateProof,startupGapMs,tvUsedRate,first,second,settled}};
    } finally {lab.close();}
  },
  async 'SYNC-25:four-song three-member transitions keep late locks without reload or seek loops'() {
    const lab = await createRoomLab({seed: 37, sourceNoiseMs: 12});
    const host = lab.addViewer('laptop', PROFILES.laptop);
    const phone = lab.addViewer('phone', PROFILES.phone, {offsetSec: .05});
    const tv = lab.addViewer('tv', PROFILES.fixedTv, {offsetSec: 1.2});
    const devices = [host, phone, tv], songs = [];
    try {
      for (let i = 0; i < 4; i++) {
        if (i) lab.nextTrack('WF-Song-0' + (i + 1));
        await lab.run(12000);
        if (i === 1) lab.source.stall(450); // source stall, not a viewer seek
        if (i === 2) phone.player.stall(650); // one viewer buffers
        if (i === 3) { lab.pause(); await lab.run(1500); lab.resume(); }
        await lab.run(67000);
        const end = lab.clock.now();
        const summaries = devices.map(d => {
          const report = d.diagnostics?.() || {};
          return {name: d.name, ...summarize(d, end - 25000, end),
            seeks: d.player.stats.seeks, loads: d.player.stats.loads,
            corrections: report.arbiter?.corrections ?? 0,
            startupPhase: report.startup?.transitionPhase ?? null,
            decoderFirstProgressMs: report.startup?.firstProgressDelayMs ?? null,
            learnedReleaseLatencyMs: report.arbiter?.model?.releaseLatencyMs ?? null,
            verifiedReleases: report.arbiter?.model?.verifiedReleases ?? 0,
            arbiterReason: report.arbiter?.reason ?? null};
        });
        songs.push({song:i+1, summaries});
      }
      // Only three *intentional* track loads, plus at most one bounded recovery;
      // progress and phase must converge independently on all three devices.
      const late = songs.flatMap(s => s.summaries);
      const stable = late.every(s => s.samples >= 60 && s.frozenMs === 0 &&
        s.p95AbsMs <= 400 && s.within200 >= 85);
      const bounded = devices.every(d => d.player.stats.loads <= 4 &&
        d.player.stats.seeks <= 16 && d.player.stats.networkSeeks <= 5);
      return {ok: stable && bounded, detail: {songs, totals: devices.map(d => ({name:d.name,
        seeks:d.player.stats.seeks, networkSeeks:d.player.stats.networkSeeks,
        loads:d.player.stats.loads, rates:d.player.stats.rateRequests.length}))}};
    } finally {lab.close();}
  }
};
