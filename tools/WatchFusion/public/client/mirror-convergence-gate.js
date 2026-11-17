/* WatchFusion v13.10.8d: prevent adjacent partial source samples from repeatedly
 * republishing the authoritative room timeline. Never delay explicit transport. */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionMirrorConvergenceGate) return;
  const CONFIRM_MS = 900, MAX_GAP_MS = 2600, MAX_SPREAD_SEC = .32, COOLDOWN_MS = 3500;
  let candidate = null, lastPublishedAt = -Infinity, held = 0, published = 0, lastNote = -Infinity;
  const clock = () => performance.now();
  function defer(plan, metadata = {}, page = '') {
    if (!plan?.publish || plan.reason !== 'drift' || metadata.paused || metadata.ended) {
      candidate = null; return false;
    }
    const drift = Number(plan.drift), sampleAt = Number(metadata.sampledAt), current = Number(metadata.currentTime);
    // Large real seeks, state changes and explicit sync remain immediate.
    if (Number.isFinite(drift) && Math.abs(drift) > 2.5) { candidate = null; return false; }
    if (!Number.isFinite(drift) || !Number.isFinite(sampleAt) || !Number.isFinite(current) || sampleAt <= 0) {
      candidate = null; return true;
    }
    const now = clock(), sign = Math.sign(drift), same = candidate && candidate.page === page &&
      sign === candidate.sign && sampleAt > candidate.lastAt && sampleAt - candidate.lastAt <= MAX_GAP_MS &&
      Math.abs(drift - candidate.drift) <= MAX_SPREAD_SEC && current > candidate.current + .05;
    if (!same) candidate = {page, sign, firstAt: sampleAt, lastAt: sampleAt, drift, current};
    else { candidate.lastAt = sampleAt; candidate.current = current; candidate.drift = drift; }
    if (!same || sampleAt - candidate.firstAt < CONFIRM_MS || now - lastPublishedAt < COOLDOWN_MS) {
      held++;
      if (now - lastNote > 15000) { lastNote = now; window.watchFusionRoomSyncLog?.note?.('mirror-drift-observing', {driftMs: Math.round(drift * 1000)}); }
      return true;
    }
    published++; lastPublishedAt = now; candidate = null; return false;
  }
  function reset() {candidate = null; lastPublishedAt = -Infinity;}
  window.WatchFusionMirrorConvergenceGate = {defer, reset, diagnostics: () => ({held,published})};
})();
