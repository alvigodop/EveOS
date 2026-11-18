/* v13.10.7 (+v13.10.8 segment-stable dwell): Terminal recovery for a wedged TV decoder (replaces the v13.10 one-shot rescue).
 * Drift's trace: the TV exhausted its 3-step stall ladder, then sat in BUFFERING for ~60 s and fell
 * 86 s behind while laptop and phone stayed Locked. Only a manual page reload fixed it. The old rescue
 * never fired: it required PLAYING (not BUFFERING) and its dwell restarted every time the linked source
 * status blinked to "frozen" for one report.
 * Ladder, per video segment, only on this device, never moving the room or the other members:
 *   1. one decoder reload at the live room position (loadVideoById)
 *   2. if still wedged, one rebuild of the YouTube player (what the manual reload did)
 * Then it stops and says so. Never runs while the room reference itself is frozen or buffering.
 */
(() => {
  'use strict';
  if (typeof window === 'undefined') return;
  const STALL_DWELL_MS = 6000, BUFFER_DWELL_MS = 9000, MIN_DRIFT_SEC = 2.5, RETRY_AFTER_MS = 15000;
  const TRUST_GRACE_MS = 6000, MAX_REBUILDS_PER_10_MIN = 2;
  const HEALED_MS = 30000, HEALTH_PHASE_SEC = .10, HEALTH_PROGRESS_MS = 20000, HEALTH_GAP_MS = 4000;
  let scope = '', since = 0, steps = 0, lastStepAt = -Infinity, outcome = 'idle', liveSeenAt = -Infinity, healthySince = 0;
  let healthyAt = -1, healthyPosition = null, healthyProgressMs = 0;
  const rebuilds = [];
  // v13.10.8: the caller's scope is room:video:epoch:playoutSegment. The playout segment bumps on every
  // room transport rewrite (a frozen linked source re-mirrored once a second in Drift's trace), so it must
  // not restart the dwell or refill the budget. Dwell and budget belong to room:video:epoch; the budget
  // refills only after the player has been healthy for 30 s.
  const dwellScope = raw => String(raw ?? '').split(':').slice(0, 3).join(':');
  // Never replenish decoder-reload budgets just because YT reports PLAYING.
  // Qualify healing from actual progress and near-room phase across 30 seconds.
  function observeHealth(input, nowMs, wedged) {
    const position = Number(input.position), drift = Number(input.drift);
    const healthy = !wedged && input.playing && !input.buffering && !input.exhausted
      && input.trusted && !input.sourceBuffering && Number.isFinite(nowMs)
      && Number.isFinite(position) && Number.isFinite(drift) && Math.abs(drift) <= HEALTH_PHASE_SEC;
    if (!healthy) { healthySince = 0; healthyAt = -1; healthyPosition = null; healthyProgressMs = 0; return; }
    if (healthyAt < 0) healthySince = nowMs;
    else {
      const elapsed = nowMs - healthyAt, advanced = position - healthyPosition;
      if (elapsed <= 0 || elapsed > HEALTH_GAP_MS || advanced < -.08 || advanced > elapsed / 1000 * 1.8 + .3) {
        healthySince = nowMs; healthyProgressMs = 0;
      } else if (advanced > .05) healthyProgressMs += Math.min(elapsed, advanced * 1000);
    }
    healthyAt = nowMs; healthyPosition = position;
    if (steps && nowMs - healthySince >= HEALED_MS && healthyProgressMs >= HEALTH_PROGRESS_MS) {
      steps = 0; lastStepAt = -Infinity; outcome = 'healed-advancing-aligned';
    }
  }
  function consider(input = {}) {
    const nextScope = input.scope ? dwellScope(input.scope) : '';
    if (nextScope !== scope) { scope = nextScope; since = 0; steps = 0; lastStepAt = -Infinity; liveSeenAt = -Infinity; healthySince = 0; healthyAt = -1; healthyPosition = null; healthyProgressMs = 0; outcome = 'scope-change'; }
    const nowMs = Number(input.nowMs);
    if (input.trusted) liveSeenAt = nowMs;
    const wedged = input.buffering ? true : !!(input.exhausted && input.playing);
    observeHealth(input, nowMs, wedged);
    if (!scope || !wedged || document.hidden || !Number.isFinite(nowMs)) { since = 0; return false; }
    // A one-report "frozen" blink of the linked source is not a frozen room.
    if (input.sourceBuffering || nowMs - liveSeenAt > TRUST_GRACE_MS) { since = 0; outcome = 'room-reference-not-live'; return false; }
    if (!(input.exhausted && input.playing && !input.buffering) && !(Math.abs(Number(input.drift)) >= MIN_DRIFT_SEC)) { since = 0; outcome = 'within-buffer-guard'; return false; }
    // A stale exhausted label alone is not a new freeze; the startup sensor
    // must still confirm a prolonged lack of playback progress.
    if (input.exhausted && input.playing && !input.buffering &&
        Number.isFinite(input.stalledMs) && input.stalledMs < STALL_DWELL_MS) {
      since = 0; outcome = 'freeze-unverified'; return false;
    }
    if (!since) { since = nowMs; outcome = 'confirming-wedged-decoder'; return false; }
    if (nowMs - since < (input.buffering ? BUFFER_DWELL_MS : STALL_DWELL_MS)) return false;
    if (steps >= 2) { outcome = 'terminal-recovery-spent'; return false; }
    if (steps === 1 && nowMs - lastStepAt < RETRY_AFTER_MS) { outcome = 'verifying-decoder-reload'; return false; }
    const recent = rebuilds.filter(t => nowMs - t < 600000);
    const rebuild = steps === 1 && recent.length < MAX_REBUILDS_PER_10_MIN && typeof input.rebuild === 'function';
    if (steps === 1 && !rebuild) { steps = 2; outcome = 'rebuild-budget-spent'; return false; }
    steps++; lastStepAt = nowMs; since = 0;
    try {
      if (rebuild) { rebuilds.push(nowMs); input.rebuild(); outcome = 'player-rebuilt-once'; }
      else { input.reload(); outcome = 'one-decoder-reload'; }
      window.watchFusionRoomSyncLog?.note?.('tv-decoder-' + (rebuild ? 'rebuild' : 'reload'), {positionMs: Math.round(Number(input.drift) * 1000)});
      return true;
    } catch { outcome = 'recovery-failed'; return false; }
  }
  // The same thing a manual URL reload does for the player, without leaving the room.
  function rebuildPlayer(videoId) {
    if (!videoId || typeof ensurePlayer !== 'function') throw Error('rebuild unavailable');
    try { ytPlayer?.destroy?.(); } catch {}
    ytPlayer = null; ytPlayerReady = false; playerPrimed = false; playerInitializing = false;
    ensurePlayer(videoId);
  }
  window.WatchFusionDecoderRescue = {version: 'v13.10.8', consider, rebuildPlayer,
    diagnostics: () => ({scope, attempted: steps > 0, steps, outcome, healthyProgressMs: Math.round(healthyProgressMs)})};
})();
