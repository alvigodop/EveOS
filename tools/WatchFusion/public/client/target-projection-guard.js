/* A stale duration or projection must not manufacture a huge TV sync error.
 * Never force alignment: use the independent room anchor only when the viewer
 * is already demonstrably tracking it and the linked source is live.
 */
(() => {
  'use strict';
  let lastNoticeAt = -Infinity, recoveries = 0;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function target({calculated, at, delay = 0, player, playback, source, serverTime, coordination} = {}) {
    if (!finite(calculated) || !finite(at) || !playback || playback.paused || playback.ended || document.hidden) return calculated;
    if (coordination?.source !== 'live' || coordination.authorityBuffering === true) return calculated;
    const phaseMs = coordination.phaseMs;
    if (!finite(phaseMs) || Math.abs(phaseMs) > 125) return calculated;
    if (player?.getPlayerState?.() !== 1 || !source?.videoId || player?.getVideoData?.()?.video_id !== source.videoId) return calculated;
    const anchorAt = Number(playback.projectedAt ?? serverTime), base = Number(playback.position), rate = Number(playback.rate);
    const observed = Number(player.getCurrentTime?.());
    if (![anchorAt, base, rate, observed].every(Number.isFinite) || rate <= 0) return calculated;
    const independentlyProjected = Math.max(0, base + Math.max(0, at - anchorAt) * rate / 1000 + phaseMs / 1000 - delay);
    if (Math.abs(independentlyProjected - calculated) < 5 || Math.abs(observed - independentlyProjected) > .15) return calculated;
    const now = performance.now();
    if (now - lastNoticeAt >= 15000) {
      lastNoticeAt = now;
      window.watchFusionRoomSyncLog?.note?.('target-projection-guard', {
        discrepancyMs: Math.round((calculated - independentlyProjected) * 1000),
        roomOffsetMs: Math.round((observed - independentlyProjected) * 1000)
      });
    }
    recoveries++;
    return independentlyProjected;
  }
  window.WatchFusionTargetProjectionGuard = Object.freeze({target, diagnostics: () => ({recoveries, lastNoticeAt})});
})();
