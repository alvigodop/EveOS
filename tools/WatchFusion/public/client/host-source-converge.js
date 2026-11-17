/* WatchFusion v13.10.8d: independent linked-source corroboration for a host with no usable peer.
 * Only a live, fresh, advancing source can authorize a bounded player rejoin.
 * The existing exclusive viewer arbiter owns ALL player operations. */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionHostSourceConverge) return;
  const MIN_ERROR = 170, MAX_ERROR = 1100, MIN_DWELL = 3200, MIN_SAMPLES = 8;
  const MAX_SPREAD = 75, SEGMENT_SETTLE = 1500, VERIFY_MS = 8000, RETRY_MS = 12000, MAX_ATTEMPTS = 2;
  let scope = '', segment = null, segmentAt = -Infinity, samples = [], attempts = 0;
  let stage = 'observe', outcome = 'idle', lastSampleAt = -Infinity, verifyAt = -Infinity;
  let nearSince = -1, retryAt = 0, lastErrorMs = null, acceptedAt = null;
  const note = (kind, detail) => window.watchFusionRoomSyncLog?.note?.(kind, detail);
  const resetSamples = () => { samples = []; lastSampleAt = -Infinity; };
  function reset(key, seg, at) {
    scope = key; segment = seg; segmentAt = at; resetSamples(); attempts = 0;
    stage = 'observe'; outcome = 'new-scope'; verifyAt = -Infinity; nearSince = -1;
    retryAt = 0; lastErrorMs = null; acceptedAt = null;
  }
  function gate(reason) { resetSamples(); outcome = reason; return false; }
  function consider(input = {}) {
    const at = Number(input.nowMs), error = Number(input.errorMs), c = input.coordination;
    if (!Number.isFinite(at) || !input.scope) return false;
    if (scope !== input.scope) reset(input.scope, input.segment, at);
    if (segment !== input.segment) { segment = input.segment; segmentAt = at; resetSamples(); }
    if (Number.isFinite(error)) lastErrorMs = Math.round(error);
    if (stage === 'exhausted' || stage === 'actuating') return false;
    if (stage === 'settled') {
      if (!input.active || !Number.isFinite(error) || Math.abs(error) <= MIN_ERROR || at - acceptedAt < 12000) return false;
      stage = attempts < MAX_ATTEMPTS ? 'observe' : 'exhausted';
      outcome = stage === 'exhausted' ? 'solo-source-budget-used' : 'solo-source-drift-returned';
      resetSamples(); if (stage === 'exhausted') return false;
    }
    if (stage === 'verifying') {
      if (!input.active || !input.publisher || !input.sameVideo || !c || c.source !== 'live' ||
          !Number.isFinite(input.sourceAgeMs) || input.sourceAgeMs > 750 || !Number.isFinite(error)) { nearSince = -1; return false; }
      if (Math.abs(error) <= 95) {
        if (nearSince < 0) nearSince = at;
        if (at - nearSince >= 1800) { stage = 'settled'; outcome = 'solo-source-settled'; note('host-source-settled', {errorMs: Math.round(error), attempts}); }
        return false;
      }
      nearSince = -1;
      if (at - verifyAt < VERIFY_MS) return false;
      stage = attempts < MAX_ATTEMPTS ? 'retry-wait' : 'exhausted'; retryAt = at + RETRY_MS;
      outcome = stage === 'exhausted' ? 'solo-source-budget-used' : 'solo-source-landing-incomplete';
      note('host-source-landing-incomplete', {errorMs: Math.round(error), attempts}); return false;
    }
    if (stage === 'retry-wait') {
      if (at < retryAt) return false;
      stage = 'observe'; resetSamples();
    }
    if (!input.active || !input.publisher || !input.sameVideo || input.peerPresent) return gate('solo-source-not-eligible');
    if (!c || c.source !== 'live' || c.authorityBuffering === true ||
        !['linked-tab', 'room-clock'].includes(c.reference) ||
        !Number.isFinite(c.sourcePhaseMs) || Math.abs(c.sourcePhaseMs) > 35 ||
        (c.uncertaintyMs != null && (!Number.isFinite(c.uncertaintyMs) || c.uncertaintyMs > 75))) return gate('solo-source-untrusted');
    if (!Number.isFinite(input.sourceAgeMs) || input.sourceAgeMs < 0 || input.sourceAgeMs > 750) return gate('solo-source-stale');
    if (!Number.isFinite(error) || Math.abs(error) < MIN_ERROR) return gate('solo-source-within-band');
    if (Math.abs(error) > MAX_ERROR) return gate('solo-source-drift-too-large');
    if (at - segmentAt < SEGMENT_SETTLE) return gate('solo-source-anchor-settling');
    if (at - lastSampleAt < 180) return false;
    if (samples.length && (at - lastSampleAt > 1200 || Math.sign(error) !== Math.sign(samples.at(-1).error))) resetSamples();
    lastSampleAt = at; samples.push({at, error}); samples = samples.filter(s => at - s.at <= 6000);
    if (samples.length < MIN_SAMPLES || at - samples[0].at < MIN_DWELL) { outcome = 'solo-source-observing'; return false; }
    const errors = samples.map(s => s.error);
    if (Math.max(...errors) - Math.min(...errors) > MAX_SPREAD) return gate('solo-source-unstable');
    attempts++; stage = 'actuating'; outcome = 'solo-source-rejoin'; acceptedAt = at;
    note('host-source-rejoin-triggered', {errorMs: Math.round(error), dwellMs: at - samples[0].at, attempts});
    return true;
  }
  function accept(ok, at) {
    if (stage !== 'actuating') return;
    if (ok) { stage = 'verifying'; verifyAt = at; nearSince = -1; outcome = 'solo-source-verifying'; }
    else { stage = attempts < MAX_ATTEMPTS ? 'retry-wait' : 'exhausted'; retryAt = at + RETRY_MS; outcome = 'solo-source-rejoin-refused'; }
    resetSamples();
    note(ok ? 'host-source-rejoin-accepted' : 'host-source-rejoin-refused', {attempts});
  }
  window.WatchFusionHostSourceConverge = {
    consider, accept, diagnostics: () => ({outcome, stage, attempts, witnesses: samples.length,
      errorMs: lastErrorMs, segment, acceptedAt, verifyMs: verifyAt >= 0 ? Math.max(0, Math.round(performance.now() - verifyAt)) : null})
  };
})();
