/* WatchFusion v13.10.8d: independent linked-source corroboration for a host with no usable peer.
 * Only a live, fresh, advancing source can authorize a bounded player rejoin.
 * The existing exclusive viewer arbiter owns ALL player operations.
 * v13.10.8g closed loop: an attempt is judged only on a valid resumed window (player playing, not owned by the
 * arbiter) and against the error that triggered it. Less than MIN_PROGRESS of lasting improvement (the 07:20:56
 * trace attempt went 327 -> 407 ms) stops this actuator for the segment instead of repeating the same move. Samples
 * taken while the arbiter holds a paused, pre-seeked player (the brief -92 ms reading) are never a landing.
 * A mirror gate holding a >0.75 s source disagreement is contradictory evidence: no new attempt until it clears. */
(() => {
  'use strict';
  if (typeof window === 'undefined' || window.WatchFusionHostSourceConverge) return;
  const MIN_ERROR = 170, MAX_ERROR = 1100, MIN_DWELL = 3200, MIN_SAMPLES = 8;
  const MAX_SPREAD = 75, SEGMENT_SETTLE = 1500, VERIFY_MS = 8000, RETRY_MS = 12000, MAX_ATTEMPTS = 2;
  const VERIFY_MAX_MS = 16000, POST_MIN = 5, POST_SPAN = 1200, POST_SPREAD = 150, MIN_PROGRESS = 100;
  let scope = '', segment = null, segmentAt = -Infinity, samples = [], attempts = 0, refusals = 0;
  let stage = 'observe', outcome = 'idle', lastSampleAt = -Infinity, verifyAt = -Infinity;
  let nearSince = -1, retryAt = 0, lastErrorMs = null, acceptedAt = null;
  let beforeMs = null, post = [], residualMs = null, progressMs = null, contradicted = null;
  const median = v => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const note = (kind, detail) => window.watchFusionRoomSyncLog?.note?.(kind, detail);
  const resetSamples = () => { samples = []; lastSampleAt = -Infinity; };
  function reset(key, seg, at) {
    scope = key; segment = seg; segmentAt = at; resetSamples(); attempts = 0; refusals = 0;
    stage = 'observe'; outcome = 'new-scope'; verifyAt = -Infinity; nearSince = -1;
    retryAt = 0; lastErrorMs = null; acceptedAt = null; beforeMs = null; post = []; residualMs = null; progressMs = null; contradicted = null;
  }
  const probe = () => { const p = window.WatchFusionRejoinProbe?.last?.(); return p ? {leadMs: p.leadMs, landedShortMs: p.landedShortMs,
    releaseLeadMs: p.releaseLeadMs, releaseErrMs: p.releaseErrMs, holdMs: p.holdMs, startLatencyMs: p.startLatencyMs} : {}; };
  function judge(at) {
    const errors = post.map(s => s.error), residual = median(errors);
    residualMs = Math.round(residual); progressMs = Math.round(Math.abs(beforeMs) - Math.abs(residual));
    const detail = {beforeMs, residualMs, progressMs, attempts, ...probe()};
    if (progressMs < MIN_PROGRESS) {
      stage = 'exhausted'; outcome = 'solo-source-no-progress'; note('host-source-backoff', detail); return false;
    }
    stage = attempts < MAX_ATTEMPTS ? 'retry-wait' : 'exhausted'; retryAt = at + RETRY_MS;
    outcome = stage === 'exhausted' ? 'solo-source-budget-used' : 'solo-source-landing-incomplete';
    note('host-source-landing-incomplete', {...detail, errorMs: residualMs}); return false;
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
          !Number.isFinite(input.sourceAgeMs) || input.sourceAgeMs > 750 || !Number.isFinite(error)) {
        nearSince = -1; post = [];
        // Never judge (or retry) an attempt without a valid resumed playback window.
        if (at - verifyAt >= VERIFY_MAX_MS) { stage = 'exhausted'; outcome = 'solo-source-unverified'; note('host-source-backoff', {beforeMs, attempts, reason: 'no-resumed-window', ...probe()}); }
        return false;
      }
      if (!post.length || at - post.at(-1).at >= 150) post.push({at, error});
      post = post.filter(s => at - s.at <= 3000);
      const valid = post.length >= POST_MIN && at - post[0].at >= POST_SPAN &&
        Math.max(...post.map(s => s.error)) - Math.min(...post.map(s => s.error)) <= POST_SPREAD;
      if (valid) window.WatchFusionRejoinProbe?.resumed?.(median(post.map(s => s.error)), at);
      if (Math.abs(error) <= 95) {
        if (nearSince < 0) nearSince = at;
        if (at - nearSince >= 1800) { stage = 'settled'; outcome = 'solo-source-settled'; note('host-source-settled', {errorMs: Math.round(error), attempts}); }
        return false;
      }
      nearSince = -1;
      if (at - verifyAt < VERIFY_MS) return false;
      if (valid) return judge(at);
      if (at - verifyAt >= VERIFY_MAX_MS) { stage = 'exhausted'; outcome = 'solo-source-unverified'; note('host-source-backoff', {beforeMs, attempts, reason: 'unstable-resumed-window', ...probe()}); }
      return false;
    }
    if (stage === 'retry-wait') {
      if (at < retryAt) return false;
      stage = 'observe'; resetSamples();
    }
    if (!input.active || !input.publisher || !input.sameVideo || input.peerPresent) return gate('solo-source-not-eligible');
    const contra = input.contradiction;
    if (contra && Number.isFinite(contra.driftMs)) {
      if (!contradicted) note('host-source-contradicted', {mirrorDriftMs: contra.driftMs, sourcePhaseMs: Number.isFinite(c?.sourcePhaseMs) ? Math.round(c.sourcePhaseMs) : null, attempts});
      contradicted = contra.driftMs; return gate('solo-source-contradicted');
    }
    contradicted = null;
    if (!c || c.source !== 'live' || c.authorityBuffering === true ||
        !['linked-tab', 'room-clock'].includes(c.reference) ||
        !Number.isFinite(c.sourcePhaseMs) || Math.abs(c.sourcePhaseMs) > 35 ||
        (c.uncertaintyMs != null && (!Number.isFinite(c.uncertaintyMs) || c.uncertaintyMs > 75))) return gate('solo-source-untrusted');
    if (!Number.isFinite(input.sourceAgeMs) || input.sourceAgeMs < 0 || input.sourceAgeMs > 750) return gate('solo-source-stale');
    if (!Number.isFinite(error) || Math.abs(error) < MIN_ERROR) return gate('solo-source-within-band');
    if (Math.abs(error) > MAX_ERROR) return gate('solo-source-drift-too-large');
    // The viewer arbiter refuses source-led host seeks below its own 700ms threshold.
    // Never spend an attempt budget on a request the single writer cannot make.
    if (input.policyBlocked === true || Number.isFinite(input.policyMinErrorMs) && Math.abs(error) < input.policyMinErrorMs)
      return gate('solo-source-actuator-ineligible');
    if (at - segmentAt < SEGMENT_SETTLE) return gate('solo-source-anchor-settling');
    if (at - lastSampleAt < 180) return false;
    if (samples.length && (at - lastSampleAt > 1200 || Math.sign(error) !== Math.sign(samples.at(-1).error))) resetSamples();
    lastSampleAt = at; samples.push({at, error}); samples = samples.filter(s => at - s.at <= 6000);
    if (samples.length < MIN_SAMPLES || at - samples[0].at < MIN_DWELL) { outcome = 'solo-source-observing'; return false; }
    const errors = samples.map(s => s.error);
    if (Math.max(...errors) - Math.min(...errors) > MAX_SPREAD) return gate('solo-source-unstable');
    attempts++; stage = 'actuating'; outcome = 'solo-source-rejoin'; acceptedAt = at; beforeMs = Math.round(error); post = [];
    note('host-source-rejoin-triggered', {errorMs: Math.round(error), dwellMs: at - samples[0].at, attempts});
    return true;
  }
  function accept(ok, at) {
    if (stage !== 'actuating') return;
    if (ok) { stage = 'verifying'; verifyAt = at; nearSince = -1; post = []; outcome = 'solo-source-verifying'; }
    else { attempts = Math.max(0, attempts - 1); refusals++; stage = refusals >= 2 ? 'exhausted' : 'retry-wait'; retryAt = at + RETRY_MS; outcome = 'solo-source-actuator-refused'; }
    resetSamples();
    note(ok ? 'host-source-rejoin-accepted' : 'host-source-rejoin-refused', {attempts});
  }
  window.WatchFusionHostSourceConverge = {
    consider, accept, diagnostics: () => ({outcome, stage, attempts, refusals, witnesses: samples.length,
      errorMs: lastErrorMs, segment, acceptedAt, verifyMs: verifyAt >= 0 ? Math.max(0, Math.round(performance.now() - verifyAt)) : null,
      beforeMs, residualMs, progressMs, contradictedMs: contradicted})
  };
})();
