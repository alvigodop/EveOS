/* WatchFusion v13.10.8i local freeze flight recorder.
 * Read-only: never pauses, seeks, changes rate, sends network requests, or measures speakers.
 * Export only bounded diagnostic enums/numbers, no IDs, URLs, titles, tokens or user text. */
(() => {
  'use strict';
  if (window.WatchFusionFreezeTelemetry) return;
  let previous = null, stateSince = 0, guardSince = 0, lastGuard = '';
  const number = (v, min = -1e7, max = 1e7) => Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null;
  const token = v => typeof v === 'string' && /^[a-z][a-z-]{0,47}$/.test(v) ? v : null;
  const elapsed = (now, since) => since > 0 ? number(Math.max(0, now - since), 0, 600000) : null;
  function read(peer, coordination) {
    const at = performance.now();
    const d = window.watchFusionSyncDiagnostics?.() || {};
    const a = d.arbiter || {}, m = a.model || {}, startup = d.startup || {};
    const guard = token(a.hostSeekGuard) || null;
    const reason = token(a.reason) || token(d.action) || 'unknown';
    const owner = a.owned ? 'arbiter' : window.watchFusionHostZeroCenter?.isApplying?.() ? 'host-zero'
      : window.WatchFusionZeroConverge?.isApplying?.() ? 'zero-converge' : 'none';
    const heldMs = number(peer?.sensor?.heldMs, 0, 600000);
    const sourceAgeMs = number(peer?.sourceAgeMs, 0, 600000);
    const playerErrorMs = Number.isFinite(peer?.targetPositionMs) ? number(peer.positionMs - peer.targetPositionMs) : null;
    const playing = peer?.playing === true, buffering = peer?.buffering === true;
    const reportedHeld = playing && !buffering && heldMs !== null && heldMs >= 700;
    let state = 'playing';
    if (buffering) state = 'buffering';
    else if (a.owned) state = 'arbiter-owned';
    else if (reportedHeld) state = 'reported-position-held';
    else if (guard) state = 'host-seek-blocked';
    else if (reason === 'fine-drift-awaiting-capability') state = 'rate-capability-unavailable';
    else if (reason === 'fine-drift-unverified-source') state = 'source-evidence-unverified';
    else if (!playing) state = 'not-playing';
    const signature = String(state) + ':' + String(guard||'') + ':' + String(owner);
    const previousState = previous?.signature || null;
    if (signature !== previousState) stateSince = at;
    if (guard !== lastGuard) { guardSince = guard ? at : 0; lastGuard = guard || ''; }
    previous = {signature, state};
    return {
      state, stateForMs:elapsed(at,stateSince), transition: previousState !== signature,
      reason, owner, phase:token(a.phase), guard, guardForMs:guard ? elapsed(at,guardSince) : null,
      playerErrorMs, heldMs, playerState:number(d.playerState,-1,10),
      sourceAgeMs, source:token(coordination?.source), reference:token(coordination?.reference),
      sourcePhaseMs:number(coordination?.sourcePhaseMs),
      rateHonored:typeof m.rateHonored==='boolean'?m.rateHonored:null,
      playerRate: Number.isFinite(d.playerRate) ? Math.round(d.playerRate*1000)/1000 : null,
      roomRate: Number.isFinite(d.authoritativeRate) ? Math.round(d.authoritativeRate*1000)/1000 : null,
      rejoinCount:number(a.rejoins,0,10000), seekCount:number(a.seeks,0,10000),
      stallSteps:number(a.stallSteps,0,100), failures:number(a.failures,0,100),
      lockedForMs:number(a.lockedForMs,0,600000),
      startupReason:token(startup.reason), startupStalledMs:number(startup.stalledMs,0,600000),
      replayLoads:number(d.replayLoads,0,10000), correctionSeeks:number(d.correctiveSeeks,0,10000),
      headroomHint:'no-speaker-phase'
    };
  }
  function capture(peer, coordination) {
    try { return read(peer, coordination); } catch { return {state:'observer-unavailable',transition:false}; }
  }
  function reset() { previous = null; stateSince = guardSince = 0; lastGuard = ''; }
  window.WatchFusionFreezeTelemetry = {capture,reset};
})();
