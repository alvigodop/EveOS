/* WatchFusion v13.10.8h: host-only seek trust policy; TV and normal transport remain untouched.
 * The host rejoin actuator still belongs exclusively to viewer-sync-arbiter. */
(() => {
  'use strict';
  if (globalThis.WatchFusionHostSeekPolicy) return;
  const SAFE_LANDING_SEC = .85, LANDING_WAIT_MS = 1500, MIN_HOST_REJOIN_SEC = .70;
  // v8n: the older shared decoder model can persist a spurious ~1.9 s host start
  // delay. Preserve its TV behavior; a linked host gets an independent, measured
  // release model, seeded conservatively until a resumed landing is verified.
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  function releaseLatency(io,model){
    if(!io.hostLinked)return model.releaseLatencySec;
    const known=model.hostReleaseLatencySec;
    return Number.isFinite(known)&&known>=0 ? clamp(known,0,.9)
      : clamp(model.releaseLatencySec,0,.35);
  }
  function eligibleFineHold(error,io,model){
    return io.hostLinked && error < -.10 && error >= -2.5 &&
      io.hostFineHoldTrusted?.() === true && Number.isFinite(model.hostReleaseLatencySec) && model.hostReleaseLatencySec >= 0 &&
      (-error/io.baseRate-releaseLatency(io,model))*1000 >= 80;
  }
  function learnRelease(residual,correction,model){
    if(!correction?.hostLinked||!correction.releaseVerified||
       !Number.isFinite(correction.releaseLeadSec)||!Number.isFinite(correction.baseRate)||
       correction.baseRate<=0||!Number.isFinite(residual))return false;
    // From rejoin-probe: measured start delay = release lead + resumed error.
    // Only an advancing, stable, verified post-release sample can teach us.
    const measured=(correction.releaseLeadSec+residual)/correction.baseRate;
    if(measured<-.025||measured>1.2)return false;
    const next=clamp(measured,0,.9),prior=model.hostReleaseLatencySec;
    model.hostReleaseLatencySec=Number.isFinite(prior)&&prior>=0
      ? clamp(prior*.35+next*.65,0,.9) : next;
    return true;
  }
  function create() {
    let blocked = '', fineHolds = 0;
    function fineHold(error,io,model){
      if(fineHolds>=2||!eligibleFineHold(error,io,model))return false;
      fineHolds++;return true;
    }
    function timeout(job) {
      if (job?.hostLinked && job.why !== 'manual') blocked = 'landing-timeout';
    }
    function landing(job, nowMs, landingError) {
      const tolerance = job.hostLinked && job.why === 'host-peer' ? .35 : SAFE_LANDING_SEC;
      if (!job.hostLinked || Math.abs(landingError) <= tolerance) {
        job.landedAt = -1; return 'pass';
      }
      if (!Number.isFinite(job.landedAt) || job.landedAt < 0) job.landedAt = nowMs;
      if (nowMs - job.landedAt < LANDING_WAIT_MS) return 'wait';
      blocked = 'unverified-landing'; return 'reject';
    }
    function blockRejoin(why, io, nowMs) {
      if (why === 'manual') { blocked = ''; return false; }
      if (!io.hostLinked || !['host-source', 'host-peer'].includes(why)) return false;
      const error = Number(io.target(nowMs)) - Number(io.current());
      const min = why === 'host-peer' ? .17 : MIN_HOST_REJOIN_SEC;
      return !!blocked || !Number.isFinite(error) || Math.abs(error) < min;
    }
    return { timeout, landing, blockRejoin, releaseLatency, learnRelease, fineHold, reset: () => { blocked = ''; fineHolds = 0; },
      get blocked() { return blocked; } };
  }
  globalThis.WatchFusionHostSeekPolicy = {create};
})();
