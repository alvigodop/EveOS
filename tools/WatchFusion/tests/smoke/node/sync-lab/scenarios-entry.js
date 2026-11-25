import {createRoomLab, summarize} from './room-lab.js';

const modelKey = 'watchfusion.viewerSyncModel.v1';
const fixedPlayer = {rates:[1], startLatencyMs:30};
function savedModel(release) {
  return new Map([[modelKey, JSON.stringify({rateHonored:false, rateRejections:2,
    releaseLatencySec:.03, verifiedReleases:2, ...release})]]);
}

export const ENTRY_SCENARIOS = {
  async 'SYNC-34:a late TV with verified timing corroborates one host correction'() {
    const lab = await createRoomLab({seed:32, sourceNoiseMs:0});
    try {
      const host = lab.addViewer('host', {...fixedPlayer, seekLatencyMs:90}, {offsetSec:.390,
        store:savedModel({hostReleaseLatencySec:.03, hostReleaseMeasured:true})});
      await lab.run(9000);
      const tv = lab.addViewer('tv', {rates:[.75,1], startLatencyMs:30}, {offsetSec:-.225});
      const witnessReady = tv.ctx.watchPartyClock.witnessReady;
      tv.ctx.watchPartyClock.witnessReady = () => false;
      await lab.run(22000);
      const seeksWithThinClock = host.player.stats.seeks;
      tv.ctx.watchPartyClock.witnessReady = witnessReady;
      await lab.run(22000);
      const events = JSON.parse(host.ctx.watchFusionRoomSyncLog.export()).events;
      const triggers = events.filter(e => e.kind === 'host-rejoin-triggered');
      const detail = {hostMs:host.errorMs(), tvMs:tv.errorMs(), seeksWithThinClock, hostSeeks:host.player.stats.seeks,
        tvSeeks:tv.player.stats.seeks, triggerCount:triggers.length, peerCount:triggers[0]?.peerCount, recovery:host.ctx.WatchFusionHostPeerRecovery.diagnostics()};
      return {ok:seeksWithThinClock===0 && detail.hostSeeks===1 && detail.tvSeeks===0 &&
        triggers.length===1 && triggers[0].peerCount===1 && Math.abs(detail.hostMs)<=50 &&
        Math.abs(detail.tvMs)<=50 && Math.abs(detail.hostMs-detail.tvMs)<=50, detail};
    } finally { lab.close(); }
  },
  async 'SYNC-31:a forced join during buffering preserves early catch-up for a far-behind viewer'() {
    const lab = await createRoomLab({seed:31,sourceNoiseMs:0});
    try {
      lab.addViewer('host', {rates:[1]});
      await lab.run(8000);
      lab.hostSeek(1490);
      await lab.run(4000);
      const tv = lab.addViewer('tv', {rates:[1], seekLatencyMs:100, startLatencyMs:200, bufferAheadSec:25}, {offsetSec:1480});
      tv.player.stall(1200);
      tv.ctx.syncPlayer({force:true});
      await lab.run(5250);
      const earlySeeks = tv.player.stats.seeks;
      await lab.run(4000);
      const detail = {earlySeeks, seeks:tv.player.stats.seeks, errorMs:tv.errorMs()};
      return {ok:earlySeeks===1 && detail.seeks===1 && Math.abs(detail.errorMs)<=100, detail};
    } finally { lab.close(); }
  },
  async 'SYNC-26:first linked entry removes a shared lead with one measured hold per device'() {
    const lab = await createRoomLab({seed:26, sourceNoiseMs:0});
    try {
      const host = lab.addViewer('host', fixedPlayer, {offsetSec:-.135,
        store:savedModel({hostReleaseLatencySec:.03, hostReleaseMeasured:true})});
      const tv = lab.addViewer('tv', fixedPlayer, {offsetSec:-.160, store:savedModel({})});
      await lab.run(24000);
      const log = JSON.parse(host.ctx.watchFusionRoomSyncLog.export());
      const sharedLead = log.snapshots.find(s => s.peers.length === 2 && s.peers.every(p=>p.sourceErrorMs > 100));
      const outcomes = log.events.filter(e=>e.kind==='host-hold-result').map(e=>e.reason);
      const first = [host,tv].map(d => ({...summarize(d,lab.clock.now()-5000,lab.clock.now()),
        holds:d.diagnostics().arbiter.holds, seeks:d.player.stats.seeks}));
      lab.nextTrack('WF-Song-002');
      await lab.run(16000);
      const next = [host,tv].map(d => summarize(d,lab.clock.now()-5000,lab.clock.now()));
      const sourceErrorsMs = sharedLead?.peers.map(p=>p.sourceErrorMs);
      return {ok:!!sharedLead && outcomes.join()==='improved' && first.every(d => d.p95AbsMs <= 50 && d.holds === 1 && d.seeks === 0) &&
        next.every(d => d.p95AbsMs <= 50) && [host,tv].every(d=>d.player.stats.seeks===0), detail:{sourceErrorsMs,outcomes,first,next}};
    } finally { lab.close(); }
  },
  async 'SYNC-27:first entry with legacy release data names the blocker and preserves the healthy TV'() {
    const lab = await createRoomLab({seed:27, sourceNoiseMs:0});
    try {
      const host = lab.addViewer('host',fixedPlayer,{offsetSec:-.135,store:savedModel({hostReleaseLatencySec:.03})});
      const tv = lab.addViewer('tv',fixedPlayer,{offsetSec:-.025});
      await lab.run(17000);
      const reason = host.diagnostics().arbiter.reason;
      return {ok:reason === 'host-release-unmeasured' && host.player.stats.seeks === 0 &&
        host.player.stats.pauses === 0 && tv.diagnostics().arbiter.corrections === 0, detail:{reason,hostErrorMs:host.errorMs(),tvErrorMs:tv.errorMs()}};
    } finally { lab.close(); }
  },
  async 'SYNC-28:first natural landing teaches host release latency from actual resumed playback'() {
    const lab = await createRoomLab({seed:28, sourceNoiseMs:0});
    try {
      const store = savedModel({});
      const host = lab.addViewer('host',{...fixedPlayer,seekLatencyMs:90},{offsetSec:2,store});
      lab.addViewer('tv',fixedPlayer);
      await lab.run(15000);
      const learned = JSON.parse(store.get(modelKey));
      const detail = {measured:learned.hostReleaseMeasured, latencyMs:Math.round(learned.hostReleaseLatencySec*1000),
        errorMs:host.errorMs(), seeks:host.player.stats.seeks, reason:host.diagnostics().arbiter.reason};
      return {ok:detail.measured === true && Math.abs(detail.latencyMs - 30) <= 15 &&
        Math.abs(detail.errorMs) <= 50 && detail.seeks === 1, detail};
    } finally { lab.close(); }
  },
  async 'SYNC-29:repeated mirror outliers veto correction and never re-anchor an in-phase source'() {
    const lab = await createRoomLab({seed:29,sourceNoiseMs:0});
    try {
      const host = lab.addViewer('host',fixedPlayer);
      const tv = lab.addViewer('tv',fixedPlayer);
      await lab.run(8000);
      const gate = host.ctx.WatchFusionMirrorConvergenceGate;
      let deferred = true;
      const conflict = () => {
        const now = lab.clock.now(), sample = {sampledAt:now,currentTime:lab.source.truePosition()-1};
        deferred = gate.defer({publish:true,reason:'drift',drift:-1},sample,'source') && deferred;
      };
      conflict(); host.player.jump(.135); tv.player.jump(.16);
      await lab.run(5500,350,conflict);
      const c = tv.ctx.watchFusionPlayout.status();
      const detail = {deferred, mirrored:gate.diagnostics().published, classification:gate.diagnostics().clockEvidence?.classification,
        sourcePhaseMs:c?.sourcePhaseMs, viewerVeto:c?.mirrorContradicted, host:host.diagnostics().action, tv:tv.diagnostics().action};
      return {ok:deferred && detail.mirrored===0 && detail.classification==='clock-domains-disagree' &&
        detail.viewerVeto===true && detail.host==='host-mirror-contradicted' && detail.tv==='mirror-contradicted' &&
        [host,tv].every(d=>d.player.stats.seeks===0 && d.player.stats.pauses===0),detail};
    } finally { lab.close(); }
  },
  async 'SYNC-30:source comparisons reject a cohort, old segment, stalled decoder and stale reports'() {
    const lab = await createRoomLab({seed:30,sourceNoiseMs:0});
    try {
      const host = lab.addViewer('host',fixedPlayer);
      await lab.run(8000);
      const now = lab.clock.now(), playout = host.ctx.watchFusionPlayout, c = playout.status();
      const base = c.anchorPositionMs + (now-c.anchorAt)*c.rate+c.phaseMs;
      const peer = {sampledAt:now,positionMs:base+135,targetPositionMs:base+148,playoutSegment:c.segment,
        playing:true,ready:true,startupPhase:'decoder-confirmed',sensor:{clockState:'bounded'}};
      const read = (p={},ref={})=>playout.sourceErrorMs({...peer,...p},{...c,...ref},now);
      const rejected = [read({}, {reference:'peer-cohort'}),read({playoutSegment:c.segment-1}),
        read({sampledAt:now-2000}),read({startupPhase:'decoder-stalled'}),read({playing:false}),
        read({}, {authorityBuffering:true}),read({}, {mirrorContradicted:true}),read({}, {sourceReferenceAt:null})];
      return {ok:read()===135 && rejected.every(v=>v===null),detail:{targetErrorMs:-13,sourceErrorMs:read(),rejected:rejected.length}};
    } finally { lab.close(); }
  }
};
