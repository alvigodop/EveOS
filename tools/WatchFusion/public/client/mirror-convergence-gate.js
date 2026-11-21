/* WatchFusion v13.10.8d: prevent adjacent partial source samples from repeatedly
 * republishing the authoritative room timeline. Never delay explicit transport. */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionMirrorConvergenceGate) return;
  const CONFIRM_MS = 900, MAX_GAP_MS = 2600, MAX_SPREAD_SEC = .32, COOLDOWN_MS = 3500;
  // v13.10.8g: a held large-drift candidate is the source tab disagreeing with the room by >0.75 s. The coordinator can
  // still report the source live and in phase; that is contradictory evidence, so host-source recovery waits on it.
  const CONTRADICTION_MS = 4000, LARGE_SEC = .75;
  let candidate = null, lastPublishedAt = -Infinity, held = 0, published = 0, lastNote = -Infinity, heldSinceNote = 0;
  let contradiction = null, clockEvidence = null, coherent = null;
  const clock = () => performance.now();
  function defer(plan, metadata = {}, page = '') {
    coherent = null;
    if (!plan?.publish || plan.reason !== 'drift' || metadata.paused || metadata.ended) {
      candidate = null; return false;
    }
    const drift = Number(plan.drift), sampleAt = Number(metadata.sampledAt), current = Number(metadata.currentTime);
    // Keep the first large source seek immediate; an adjacent second drift-driven
    // room re-anchor must not reset synced viewers again without fresh evidence.
    // Explicit state and force changes bypass this drift-only gate entirely.
    if (Number.isFinite(drift) && Math.abs(drift) > 2.5 && clock() - lastPublishedAt >= COOLDOWN_MS) {
      candidate = null; lastPublishedAt = clock(); return false;
    }
    if (!Number.isFinite(drift) || !Number.isFinite(sampleAt) || !Number.isFinite(current) || sampleAt <= 0) {
      candidate = null; return true;
    }
    const now = clock(), sign = Math.sign(drift), same = candidate && candidate.page === page &&
      sign === candidate.sign && sampleAt > candidate.lastAt && sampleAt - candidate.lastAt <= MAX_GAP_MS &&
      Math.abs(drift - candidate.drift) <= MAX_SPREAD_SEC && current > candidate.current + .05;
    if (!same) candidate = {page, sign, firstAt: sampleAt, lastAt: sampleAt, drift, current};
    else { candidate.lastAt = sampleAt; candidate.current = current; candidate.drift = drift; }
    const playout = window.watchFusionPlayout, c = playout?.status?.();
    // Repetition against the publisher's last mirror anchor is not confirmation
    // of a room displacement when the independent source still follows the room.
    const disagrees = playout?.hasSourceReference?.(c, estimatedServerNow()) &&
      Math.abs(c.sourcePhaseMs) <= 35 && Math.abs(drift * 1000 - c.sourcePhaseMs) > LARGE_SEC * 1000;
    if (!same || disagrees || sampleAt - candidate.firstAt < CONFIRM_MS || now - lastPublishedAt < COOLDOWN_MS) {
      held++; heldSinceNote++;
      if (Math.abs(drift) > LARGE_SEC) contradiction = {page, driftMs: Math.round(drift * 1000), at: now};
      const phaseNow=window.watchFusionPlayout?.status?.()?.sourcePhaseMs; const gapNow=Number.isFinite(phaseNow)?Math.round(drift*1000-phaseNow):null;
      clockEvidence={gapMs:gapNow,sourcePhaseMs:Number.isFinite(phaseNow)?Math.round(phaseNow):null,sampleAgeMs:Math.round(Date.now()-sampleAt),at:now,classification:gapNow!==null&&Math.abs(gapNow)>750?'clock-domains-disagree':'unverified'};
      if (now - lastNote > 15000) {
        lastNote = now;
        // Sample age (local clock, same domain as the anchor) and how often this happened: is it a held source sample?
        // Compare independent room-source phase with the mirror planner's drift,
        // without asserting that either number measures audible speaker latency.
        const phase=window.watchFusionPlayout?.status?.()?.sourcePhaseMs;
        const gap=Number.isFinite(phase)?Math.round(drift*1000-phase):null;
        window.watchFusionRoomSyncLog?.note?.('mirror-drift-observing', {driftMs: Math.round(drift * 1000),
          sampleAgeMs: Math.round(Date.now() - sampleAt), sourcePhaseMs:Number.isFinite(phase)?Math.round(phase):null,
          clockGapMs:gap, clockEvidence:gap!==null&&Math.abs(gap)>750?'contradictory':'unverified',
          step: heldSinceNote, reason: same ? 'repeated-sample' : 'isolated-sample'});
        heldSinceNote = 0;
      }
      return true;
    }
    published++; lastPublishedAt = now; candidate = null; return false;
  }
  function observeSteady(plan, metadata, page) {
    const playout = window.watchFusionPlayout, c = playout?.status?.();
    const {sampledAt, currentTime, rate, paused, ended, buffering} = metadata;
    const age = Date.now() - sampledAt;
    if (!contradicted() || contradiction.page !== page || plan?.reason !== 'steady' || paused || ended || buffering ||
        ![sampledAt,currentTime,rate,c?.sourcePhaseMs,plan?.drift].every(Number.isFinite) ||
        age < 0 || age > 500 || rate <= 0 || Math.abs(plan.drift * 1000 - c.sourcePhaseMs) > 100 ||
        !playout.hasSourceReference?.(c, estimatedServerNow())) { coherent = null; return; }
    const elapsed = coherent ? sampledAt - coherent.sampledAt : Infinity;
    if (elapsed >= 0 && elapsed < 150) return;
    const expected = elapsed * rate / 1000, advance = currentTime - coherent?.position;
    if (elapsed >= 150 && elapsed <= 1000 && advance >= expected * .5 && advance <= expected * 1.5) {
      contradiction = candidate = coherent = clockEvidence = null;
      return;
    }
    coherent = {sampledAt, position:currentTime};
  }
  function reset() {candidate = null; lastPublishedAt = -Infinity; contradiction = coherent = clockEvidence = null;}
  // A drift publish (the room re-anchored to the source) resolves it; so does CONTRADICTION_MS without another one.
  function contradicted(now = clock()) {
    if (!contradiction || now - contradiction.at > CONTRADICTION_MS || contradiction.at <= lastPublishedAt) return null;
    return {driftMs: contradiction.driftMs, ageMs: Math.round(now - contradiction.at)};
  }
  window.WatchFusionMirrorConvergenceGate = {defer, observeSteady, reset, contradicted, diagnostics: () => ({held,published,contradiction:contradicted(),clockEvidence:clockEvidence&&clock()-clockEvidence.at<=4000?clockEvidence:null})};
})();
