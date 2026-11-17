/* WatchFusion v13.10.8h: host-only seek trust policy; TV and normal transport remain untouched.
 * The host rejoin actuator still belongs exclusively to viewer-sync-arbiter. */
(() => {
  'use strict';
  if (globalThis.WatchFusionHostSeekPolicy) return;
  const SAFE_LANDING_SEC = .85, LANDING_WAIT_MS = 1500, MIN_HOST_REJOIN_SEC = .70;
  function create() {
    let blocked = '';
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
    return { timeout, landing, blockRejoin, reset: () => { blocked = ''; },
      get blocked() { return blocked; } };
  }
  globalThis.WatchFusionHostSeekPolicy = {create};
})();
