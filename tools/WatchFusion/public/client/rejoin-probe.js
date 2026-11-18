/* WatchFusion v13.10.8g: measure what a landing-aware rejoin actually did, read-only.
 * The arbiter commands pause -> seek(target + lead) -> wait for the landing -> play when the room catches up.
 * This wraps the arbiter's io and records, in milliseconds of player timeline:
 *   leadMs         commanded seek position minus the room target when the seek was issued
 *   landedShortMs  commanded position minus where the paused player actually landed (keyframe snap)
 *   releaseLeadMs  landed position minus the room target at the moment play() was called
 *   releaseErrMs   releaseLeadMs minus the arbiter's modelled release latency (negative: released late)
 *   holdMs         seek issued -> play called
 * After release the caller reports the resumed residual (target minus player, positive = player behind), so
 * startLatencyMs = releaseLeadMs + residual is how long the player took to really start. Never actuates anything. */
(() => {
  'use strict';
  const root = typeof window === 'undefined' ? globalThis : window;
  if (root.WatchFusionRejoinProbe) return;
  let open = null, last = null, count = 0;
  const ms = value => Number.isFinite(value) ? Math.round(value * 1000) : null;
  function wrap(io) {
    if (!io || io.__rejoinProbe) return io;
    return {...io, __rejoinProbe: true,
      seek(position, allowNetwork) {
        try { const at = io.now(); open = {at, requested: position, leadMs: ms(position - io.target(at))}; } catch { open = null; }
        return io.seek(position, allowNetwork);
      },
      play() {
        if (open) {
          try {
            const at = io.now(), landed = Number(io.current()), target = io.target(at);
            const model = root.watchFusionViewerArbiter?.snapshot?.()?.model;
            const releaseLeadMs = ms(landed - target);
            const latencyMs = io.hostLinked ? model?.effectiveHostReleaseLatencyMs : model?.releaseLatencyMs;
            last = {at, seq: ++count, leadMs: open.leadMs, landedShortMs: ms(open.requested - landed), releaseLeadMs,
              releaseErrMs: Number.isFinite(latencyMs) && releaseLeadMs !== null ? Math.round(releaseLeadMs - latencyMs * io.baseRate) : null,
              holdMs: Math.round(at - open.at), residualMs: null, startLatencyMs: null};
            root.watchFusionRoomSyncLog?.note?.('rejoin-landing', {leadMs: last.leadMs, landedShortMs: last.landedShortMs,
              releaseLeadMs, releaseErrMs: last.releaseErrMs, holdMs: last.holdMs});
          } catch {}
          open = null;
        }
        return io.play();
      }};
  }
  // The first stable resumed residual after a release (from the caller's own verified samples).
  function resumed(residualMs, at) {
    if (!last || last.residualMs !== null || !Number.isFinite(residualMs) || !(at > last.at)) return;
    last.residualMs = Math.round(residualMs);
    last.startLatencyMs = last.releaseLeadMs === null ? null : last.releaseLeadMs + last.residualMs;
  }
  root.WatchFusionRejoinProbe = {wrap, resumed, last: () => last && {...last}, reset: () => { open = null; last = null; }};
})();
